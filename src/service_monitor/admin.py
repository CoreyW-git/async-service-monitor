from __future__ import annotations

import asyncio
import html
import json
import mimetypes
import os
import secrets
import signal
import subprocess
import sys
import threading
import time
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path
from typing import Any
from typing import Literal
from urllib.parse import quote, urlparse

import docker
import httpx
from fastapi import Cookie, Depends, FastAPI, Form, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from service_monitor.auth import AuthManager
from service_monitor.config import (
    AlertThresholdsConfig,
    AppConfig,
    AuthConfig,
    BrowserConfig,
    BrowserStepConfig,
    CheckConfig,
    ContentConfig,
    DockerRecoveryConfig,
    EmailConfig,
    HeaderAssertionConfig,
    OCIAuthConfig,
    PeerConfig,
    PortalAuthConfig,
    PortalUserConfig,
    RequestHeaderConfig,
    RetryConfig,
    TelemetryConfig,
    UIScalingConfig,
    UnauthenticatedProbeConfig,
)
from service_monitor.config_store import ConfigStore
from service_monitor.runner import MonitorRunner
from service_monitor.state import MonitorState
from service_monitor.telemetry import TelemetryStore


class ContentPayload(BaseModel):
    contains: list[str] = Field(default_factory=list)
    not_contains: list[str] = Field(default_factory=list)
    regex: str | None = None


class RequestHeaderPayload(BaseModel):
    name: str
    value: str


class HeaderAssertionPayload(BaseModel):
    name: str
    expected_value: str


class RetryPayload(BaseModel):
    attempts: int = 1
    delay_seconds: float = 0.0
    retry_on_statuses: list[int] = Field(default_factory=list)
    retry_on_timeout: bool = True
    retry_on_connection_error: bool = True


class AuthPayload(BaseModel):
    type: Literal["basic", "bearer", "header"]
    username: str | None = None
    password: str | None = None
    token: str | None = None
    header_name: str | None = None
    header_value: str | None = None


class BrowserStepPayload(BaseModel):
    name: str
    action: Literal[
        "navigate",
        "wait_for_selector",
        "click",
        "fill",
        "press",
        "assert_text",
        "assert_url_contains",
        "wait_for_timeout",
    ]
    selector: str | None = None
    value: str | None = None
    timeout_seconds: float | None = None


class BrowserPayload(BaseModel):
    expected_title_contains: str | None = None
    required_selectors: list[str] = Field(default_factory=list)
    wait_until: Literal["load", "domcontentloaded", "networkidle"] = "networkidle"
    viewport_width: int = 1440
    viewport_height: int = 900
    persist_auth_session: bool = False
    storage_state: str | None = None
    storage_state_captured_at: float | None = None
    steps: list[BrowserStepPayload] = Field(default_factory=list)


class AlertThresholdsPayload(BaseModel):
    mode: Literal["auto", "manual"] = "auto"
    availability_warning: float = 99.5
    availability_critical: float = 99.0
    error_rate_warning: float = 2.0
    error_rate_critical: float = 5.0
    p95_latency_warning_ms: float = 1500.0
    p95_latency_critical_ms: float = 3000.0
    p99_latency_warning_ms: float = 2500.0
    p99_latency_critical_ms: float = 5000.0


class CheckPayload(BaseModel):
    id: str | None = None
    name: str
    type: Literal["http", "dns", "auth", "database", "generic", "browser", "api"]
    enabled: bool = True
    interval_seconds: float
    placement_mode: Literal["auto", "specific"] = "auto"
    assigned_node_id: str | None = None
    timeout_seconds: float | None = None
    url: str | None = None
    host: str | None = None
    port: int | None = None
    database_name: str | None = None
    database_engine: Literal["mysql", "postgresql"] = "mysql"
    request_method: Literal["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] = "GET"
    request_headers: list[RequestHeaderPayload] = Field(default_factory=list)
    request_body: str | None = None
    request_body_mode: Literal["none", "json", "text"] = "none"
    expected_statuses: list[int] = Field(default_factory=lambda: [200])
    expected_headers: list[HeaderAssertionPayload] = Field(default_factory=list)
    max_response_time_ms: float | None = None
    expect_authenticated_statuses: list[int] = Field(default_factory=lambda: [200])
    auth: AuthPayload | None = None
    content: ContentPayload | None = None
    browser: BrowserPayload | None = None
    retry: RetryPayload = Field(default_factory=RetryPayload)
    alert_thresholds: AlertThresholdsPayload = Field(default_factory=AlertThresholdsPayload)


class CheckStatePayload(BaseModel):
    enabled: bool


class BrowserSessionStatePayload(BaseModel):
    storage_state: str | None = None
    clear: bool = False


class BulkCheckSelectionPayload(BaseModel):
    names: list[str] = Field(default_factory=list)


class BulkCheckEnabledPayload(BulkCheckSelectionPayload):
    enabled: bool


class PeerRecoveryPayload(BaseModel):
    enabled: bool = False
    container_name: str | None = None


class PeerPayload(BaseModel):
    node_id: str
    base_url: str
    enabled: bool = True
    container_name: str | None = None
    monitor_scope: Literal["peer_only", "full"] = "full"
    recovery: PeerRecoveryPayload = Field(default_factory=PeerRecoveryPayload)


class ContainerCreatePayload(BaseModel):
    node_id: str
    container_name: str | None = None
    image: str | None = None
    base_url: str | None = None
    network: str | None = None
    host_port: int | None = None
    monitor_scope: Literal["peer_only", "full"] = "full"
    enabled: bool = True
    recovery_enabled: bool = True


class PortalUserPayload(BaseModel):
    username: str
    password: str
    first_name: str = ""
    last_name: str = ""
    role: Literal["read_only", "read_write", "admin"]
    enabled: bool = True


class LoginPayload(BaseModel):
    username: str
    password: str


class RegisterPayload(BaseModel):
    username: str
    password: str
    first_name: str = ""
    last_name: str = ""


class BootstrapPayload(BaseModel):
    username: str
    password: str
    first_name: str = ""
    last_name: str = ""


class ResetPasswordPayload(BaseModel):
    username: str
    password: str


class ProfilePayload(BaseModel):
    first_name: str = ""
    last_name: str = ""
    password: str | None = None
    dark_mode: bool | None = None


class TelemetryPayload(BaseModel):
    enabled: bool = False
    timeseries_provider: Literal["local_postgresql", "oci_postgresql"] = "local_postgresql"
    timeseries_host: str | None = None
    timeseries_port: int = 5432
    timeseries_database: str | None = None
    timeseries_username: str | None = None
    timeseries_password: str | None = None
    timeseries_use_ssl: bool = False
    auto_provision_timeseries_local: bool = False
    timeseries_local_container_name: str = "async-service-monitor-postgres"
    object_provider: Literal["local_minio", "oci_object_storage"] = "local_minio"
    object_endpoint: str | None = None
    object_access_key: str | None = None
    object_secret_key: str | None = None
    object_bucket: str = "async-service-monitor"
    object_region: str | None = None
    object_use_ssl: bool = False
    auto_provision_object_local: bool = False
    object_local_container_name: str = "async-service-monitor-minio"
    object_console_port: int = 9001
    retention_hours: int = 2


class PortalSettingsPayload(BaseModel):
    enabled: bool = True
    provider: Literal["basic", "oci"] = "basic"
    realm: str = "Async Service Monitor"
    oci_enabled: bool = False
    tenancy_ocid: str | None = None
    user_ocid: str | None = None
    region: str | None = None
    group_claim: str | None = None


class EmailSettingsPayload(BaseModel):
    enabled: bool = False
    provider: Literal["m365", "yahoo", "gmail", "outlook", "custom"] = "custom"
    host: str | None = None
    port: int = 587
    username: str | None = None
    password: str | None = None
    from_address: str | None = None
    to_addresses: list[str] = Field(default_factory=list)
    subject_prefix: str = "[async-service-monitor]"
    use_tls: bool = True
    use_ssl: bool = False
    auto_provision_local: bool = False
    local_container_name: str = "async-service-monitor-mailpit"
    local_ui_port: int = 8025


class UIScalingPayload(BaseModel):
    enabled: bool = False
    dashboard_replicas: int = 2
    session_strategy: Literal["shared_cookie", "sticky_proxy"] = "shared_cookie"
    sticky_sessions: bool = False
    proxy_container_name: str = "async-service-monitor-proxy"
    dashboard_container_prefix: str = "async-service-monitor-dashboard"
    proxy_port: int = 8000


def _auth_from_payload(payload: AuthPayload | None) -> AuthConfig | None:
    if payload is None:
        return None
    return AuthConfig(**payload.model_dump())


def _content_from_payload(payload: ContentPayload | None) -> ContentConfig | None:
    if payload is None:
        return None
    return ContentConfig(**payload.model_dump())


def _browser_from_payload(payload: BrowserPayload | None) -> BrowserConfig | None:
    if payload is None:
        return None
    return BrowserConfig(
        expected_title_contains=payload.expected_title_contains,
        required_selectors=payload.required_selectors,
        wait_until=payload.wait_until,
        viewport_width=payload.viewport_width,
        viewport_height=payload.viewport_height,
        persist_auth_session=payload.persist_auth_session,
        storage_state=payload.storage_state,
        storage_state_captured_at=payload.storage_state_captured_at,
        steps=[
            BrowserStepConfig(
                name=step.name,
                action=step.action,
                selector=step.selector,
                value=step.value,
                timeout_seconds=step.timeout_seconds,
            )
            for step in payload.steps
        ],
    )


def _alert_thresholds_from_payload(payload: AlertThresholdsPayload | None) -> AlertThresholdsConfig:
    if payload is None:
        return AlertThresholdsConfig()
    return AlertThresholdsConfig(**payload.model_dump())


def _request_headers_from_payload(payload: list[RequestHeaderPayload] | None) -> list[RequestHeaderConfig]:
    return [
        RequestHeaderConfig(name=item.name.strip(), value=item.value)
        for item in (payload or [])
        if item.name.strip()
    ]


def _expected_headers_from_payload(
    payload: list[HeaderAssertionPayload] | None,
) -> list[HeaderAssertionConfig]:
    return [
        HeaderAssertionConfig(name=item.name.strip(), expected_value=item.expected_value)
        for item in (payload or [])
        if item.name.strip()
    ]


def _retry_from_payload(payload: RetryPayload | None) -> RetryConfig:
    if payload is None:
        return RetryConfig()
    return RetryConfig(**payload.model_dump())


def _check_from_payload(payload: CheckPayload) -> CheckConfig:
    return CheckConfig(
        id=payload.id or secrets.token_urlsafe(10),
        name=payload.name,
        type=payload.type,  # type: ignore[arg-type]
        enabled=payload.enabled,
        interval_seconds=payload.interval_seconds,
        placement_mode=payload.placement_mode,
        assigned_node_id=payload.assigned_node_id,
        timeout_seconds=payload.timeout_seconds,
        url=payload.url,
        host=payload.host,
        port=payload.port,
        database_name=payload.database_name,
        database_engine=payload.database_engine,
        request_method=payload.request_method,
        request_headers=_request_headers_from_payload(payload.request_headers),
        request_body=payload.request_body,
        request_body_mode=payload.request_body_mode,
        expected_statuses=payload.expected_statuses,
        expected_headers=_expected_headers_from_payload(payload.expected_headers),
        max_response_time_ms=payload.max_response_time_ms,
        expect_authenticated_statuses=payload.expect_authenticated_statuses,
        auth=_auth_from_payload(payload.auth),
        content=_content_from_payload(payload.content),
        browser=_browser_from_payload(payload.browser),
        retry=_retry_from_payload(payload.retry),
        alert_thresholds=_alert_thresholds_from_payload(payload.alert_thresholds),
    )


def _auth_test_check_from_payload(payload: CheckPayload) -> CheckConfig:
    if payload.type not in {"http", "auth", "api"}:
        raise ValueError("Authentication tests are only available for HTTP, API, and auth monitors")
    check = _check_from_payload(payload)
    check.type = "auth"
    check.expect_authenticated_statuses = (
        payload.expect_authenticated_statuses or payload.expected_statuses or [200]
    )
    check.unauthenticated_probe = UnauthenticatedProbeConfig(enabled=False)
    return check


def _peer_from_payload(payload: PeerPayload) -> PeerConfig:
    return PeerConfig(
        node_id=payload.node_id,
        base_url=payload.base_url.rstrip("/"),
        enabled=payload.enabled,
        container_name=payload.container_name,
        monitor_scope=payload.monitor_scope,
        recovery=DockerRecoveryConfig(
            enabled=payload.recovery.enabled,
            container_name=payload.recovery.container_name,
        ),
    )


def _user_from_payload(payload: PortalUserPayload, existing: PortalUserConfig | None = None) -> PortalUserConfig:
    return PortalUserConfig(
        username=payload.username,
        password=payload.password,
        first_name=payload.first_name,
        last_name=payload.last_name,
        dark_mode=existing.dark_mode if existing is not None else False,
        role=payload.role,
        enabled=payload.enabled,
        last_login_at=existing.last_login_at if existing is not None else None,
    )


def _frontend_html() -> str:
    web_dir = Path(__file__).parent / "web"
    html = (web_dir / "index.html").read_text(encoding="utf-8")
    css_version = int((web_dir / "app.css").stat().st_mtime)
    js_version = int((web_dir / "app.js").stat().st_mtime)
    plotly_version = int((web_dir / "vendor" / "plotly.min.js").stat().st_mtime)
    html = html.replace('href="/app.css"', f'href="/app.css?v={css_version}"')
    html = html.replace('src="/vendor/plotly.min.js"', f'src="/vendor/plotly.min.js?v={plotly_version}"')
    html = html.replace('src="/app.js"', f'src="/app.js?v={js_version}"')
    return html


def _no_cache_headers() -> dict[str, str]:
    return {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    }


def create_admin_app(config_path: str | Path) -> FastAPI:
    store = ConfigStore(config_path)
    initial_config = store.load()
    state = MonitorState(metrics_history_limit=initial_config.defaults.metrics_history_limit)
    app_mode = os.getenv("SERVICE_MONITOR_APP_MODE", "all").strip().lower()
    dashboard_mode = app_mode == "dashboard"
    telemetry = TelemetryStore(initial_config)
    runtime: dict[str, Any] = {
        "runner": None,
        "runner_task": None,
        "state": state,
        "store": store,
        "config_path": str(config_path),
        "telemetry": telemetry,
        "app_mode": app_mode,
        "recorder_clients": {},
        "playwright_recorders": {},
    }

    class RecorderHelperStatusPayload(BaseModel):
        status: str
        error: str | None = None
        message: str | None = None
        browser_open: bool | None = None
        storage_state: str | None = None
        storage_state_captured_at: float | None = None

    class RecorderHelperEventPayload(BaseModel):
        event: str
        selector: str | None = None
        value: str | None = None
        url: str | None = None
        title: str | None = None
        textSnippet: str | None = None
        action: str | None = None
        method: str | None = None
        message: str | None = None
        timestamp: float | None = None

    def _get_runner() -> MonitorRunner:
        runner = runtime.get("runner")
        if runner is None:
            if dashboard_mode:
                raise HTTPException(status_code=503, detail="This endpoint is only available on the control-plane service")
            raise HTTPException(status_code=503, detail="Monitor runtime is still starting")
        return runner

    def _get_runtime_config() -> AppConfig:
        return store.load()

    def _telemetry_reads_enabled(config: AppConfig) -> bool:
        return dashboard_mode and config.telemetry.enabled

    def _status_from_result(latest: dict[str, object] | None, enabled: bool) -> str:
        if not enabled:
            return "disabled"
        if latest is None:
            return "unknown"
        return "healthy" if latest.get("success") else "unhealthy"

    def _get_recorder_client(session_id: str) -> httpx.Client:
        clients = runtime["recorder_clients"]
        client = clients.get(session_id)
        if client is None:
            client = httpx.Client(
                follow_redirects=True,
                headers={"User-Agent": initial_config.defaults.user_agent},
                timeout=30.0,
            )
            clients[session_id] = client
        return client

    def _inject_recorder_script(html_body: str, target_url: str, session_id: str) -> str:
        target_json = json.dumps(target_url)
        session_json = json.dumps(session_id)
        script = f"""
<script>
(function() {{
  const ASM_TARGET_URL = {target_json};
  const ASM_SESSION_ID = {session_json};

  function post(payload) {{
    try {{
      window.parent.postMessage({{ source: "asm-recorder", ...payload }}, "*");
    }} catch (error) {{
      console.error(error);
    }}
  }}

  function selectorFor(element) {{
    if (!element || element === document.body) return "body";
    const form = element.closest("form");
    let prefix = "";
    if (form) {{
      if (form.id) {{
        prefix = "form#" + CSS.escape(form.id) + " ";
      }} else if (form.getAttribute("name")) {{
        prefix = "form[name=\"" + form.getAttribute("name") + "\"] ";
      }}
    }}
    if (element.id) return "#" + CSS.escape(element.id);
    const testId = element.getAttribute("data-testid") || element.getAttribute("data-test");
    if (testId) return prefix + '[data-testid="' + testId + '"]';
    const name = element.getAttribute("name");
    if (name && element.tagName) return prefix + element.tagName.toLowerCase() + '[name="' + name + '"]';
    const aria = element.getAttribute("aria-label");
    if (aria && element.tagName) return prefix + element.tagName.toLowerCase() + '[aria-label="' + aria + '"]';
    const placeholder = element.getAttribute("placeholder");
    if (placeholder && element.tagName) return prefix + element.tagName.toLowerCase() + '[placeholder="' + placeholder + '"]';
    const classes = Array.from(element.classList || []).filter(Boolean).slice(0, 2);
    if (classes.length && element.tagName) return prefix + element.tagName.toLowerCase() + "." + classes.map((item) => CSS.escape(item)).join(".");
    if (element.tagName) return prefix + element.tagName.toLowerCase();
    return "body";
  }}

  function notifyNavigate(kind) {{
    post({{
      event: "navigate",
      kind,
      url: window.location.href,
      title: document.title
    }});
  }}

  document.addEventListener("click", function(event) {{
    const target = event.target.closest("a, button, input, [role='button']");
    if (!target) return;
    post({{
      event: "click",
      selector: selectorFor(target),
      text: (target.innerText || target.value || target.getAttribute("aria-label") || "").trim().slice(0, 120),
      href: target.closest("a") ? target.closest("a").href : null
    }});
  }}, true);

  document.addEventListener("change", function(event) {{
    const target = event.target;
    if (!target || !target.tagName) return;
    if (!["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    post({{
      event: "fill",
      selector: selectorFor(target),
      value: target.value || ""
    }});
  }}, true);

  document.addEventListener("submit", function(event) {{
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    const action = form.action || window.location.href;
    const method = (form.method || "POST").toUpperCase();
    post({{
      event: "submit",
      selector: selectorFor(form),
      action,
      method
    }});
    const body = new FormData(form);
    fetch("/api/recorder/proxy?url=" + encodeURIComponent(action) + "&session_id=" + encodeURIComponent(ASM_SESSION_ID), {{
      method,
      body
    }}).then((response) => response.text()).then((nextHtml) => {{
      document.open();
      document.write(nextHtml);
      document.close();
    }}).catch((error) => {{
      post({{ event: "proxy_error", message: String(error) }});
    }});
  }}, true);

  const wrapHistory = function(methodName) {{
    const original = history[methodName];
    history[methodName] = function() {{
      const result = original.apply(this, arguments);
      notifyNavigate(methodName);
      return result;
    }};
  }};
  wrapHistory("pushState");
  wrapHistory("replaceState");
  window.addEventListener("hashchange", function() {{ notifyNavigate("hashchange"); }});
  window.addEventListener("load", function() {{
    notifyNavigate("load");
    post({{
      event: "page_ready",
      url: window.location.href,
      title: document.title,
      textSnippet: (document.body && document.body.innerText ? document.body.innerText.slice(0, 280) : "")
    }});
  }});
}})();
</script>
"""
        base_tag = f'<base href="{html.escape(target_url, quote=True)}">'
        if "<head" in html_body.lower():
            lower = html_body.lower()
            head_close = lower.find(">", lower.find("<head"))
            if head_close != -1:
                html_body = html_body[: head_close + 1] + base_tag + html_body[head_close + 1 :]
        if "</body>" in html_body.lower():
            idx = html_body.lower().rfind("</body>")
            return html_body[:idx] + script + html_body[idx:]
        return html_body + script

    def _proxy_recorder_request_sync(
        target_url: str,
        session_id: str,
        method: str,
        headers: dict[str, str],
        form_data: list[tuple[str, str]],
    ) -> tuple[bytes, str]:
        client = _get_recorder_client(session_id)
        safe_headers = {
            "Accept": headers.get("accept", "*/*"),
            "Accept-Language": headers.get("accept-language", "en-US,en;q=0.9"),
        }
        response = client.request(
            method.upper(),
            target_url,
            headers=safe_headers,
            data=form_data if method.upper() != "GET" else None,
        )
        content_type = response.headers.get("content-type", "text/plain")
        if "text/html" in content_type:
            body = response.text
            body = _inject_recorder_script(body, str(response.url), session_id)
            return body.encode("utf-8"), "text/html; charset=utf-8"
        return response.content, content_type

    def _append_playwright_step(session_id: str, payload: dict[str, Any]) -> None:
        entry = runtime["playwright_recorders"].get(session_id)
        if not entry:
            return
        payload = dict(payload)
        payload.setdefault("timestamp", time.time())
        steps = entry.setdefault("steps", [])
        if steps:
            previous = steps[-1]
            dedupe_keys = ("event", "selector", "value", "url", "title")
            if all(previous.get(key) == payload.get(key) for key in dedupe_keys):
                return
        steps.append(payload)

    def _embedded_recorder_storage_state(session_id: str, target_url: str) -> tuple[str | None, float | None]:
        client = runtime["recorder_clients"].get(session_id)
        if client is None:
            return None, None
        parsed = urlparse(target_url)
        host = parsed.hostname or ""
        jar = getattr(client.cookies, "jar", None)
        if jar is None:
            return None, None
        cookies: list[dict[str, Any]] = []
        for cookie in jar:
            domain = cookie.domain or host
            if not domain:
                continue
            cookies.append(
                {
                    "name": cookie.name,
                    "value": cookie.value,
                    "domain": domain,
                    "path": cookie.path or "/",
                    "expires": cookie.expires,
                    "httpOnly": False,
                    "secure": bool(cookie.secure),
                    "sameSite": "Lax",
                }
            )
        if not cookies:
            return None, None
        return json.dumps({"cookies": cookies, "origins": []}), time.time()

    def _launch_visible_recorder_browser(playwright, viewport_width: int = 1440, viewport_height: int = 900):
        launch_args = [
            "--new-window",
            f"--window-size={viewport_width},{viewport_height}",
            "--window-position=72,72",
            "--disable-popup-blocking",
        ]
        launch_errors: list[str] = []
        browser = None
        selected_runtime = "chromium"
        for channel in ("msedge", "chrome", None):
            try:
                kwargs: dict[str, Any] = {
                    "headless": False,
                    "args": launch_args,
                }
                if channel:
                    kwargs["channel"] = channel
                browser = playwright.chromium.launch(**kwargs)
                selected_runtime = channel or "chromium"
                break
            except Exception as exc:
                label = channel or "chromium"
                launch_errors.append(f"{label}: {exc}")
        if browser is None:
            raise RuntimeError(
                "Could not launch a visible recorder browser window. "
                + " | ".join(launch_errors)
            )
        return browser, selected_runtime

    def _recorder_helper_python_executable() -> str:
        return str(Path(sys.executable))

    def _spawn_desktop_recorder_helper(session_id: str, target_url: str, token: str) -> int | None:
        python_exec = _recorder_helper_python_executable()
        config_dir = Path(runtime["config_path"]).parent
        helper_script = Path(__file__).with_name("recorder_helper.py")
        stdout_log = config_dir / "recorder-helper.out.log"
        stderr_log = config_dir / "recorder-helper.err.log"
        stdout_log.write_text("", encoding="utf-8")
        stderr_log.write_text("", encoding="utf-8")
        command = [
            python_exec,
            "-u",
            str(helper_script),
            "--session-id",
            session_id,
            "--target-url",
            target_url,
            "--api-base",
            "http://127.0.0.1:8000",
            "--token",
            token,
        ]
        with stdout_log.open("a", encoding="utf-8") as stdout_handle, stderr_log.open(
            "a", encoding="utf-8"
        ) as stderr_handle:
            creation_flags = 0
            if os.name == "nt":
                creation_flags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
            process = subprocess.Popen(
                command,
                cwd=str(config_dir),
                stdout=stdout_handle,
                stderr=stderr_handle,
                creationflags=creation_flags,
            )
        return process.pid

    def _playwright_recorder_active(entry: dict[str, Any] | None) -> bool:
        if not entry:
            return False
        return str(entry.get("status") or "") in {"launching", "running", "stopping"} or bool(
            entry.get("browser_open")
        )

    def _playwright_recorder_process_running(pid: int | None) -> bool:
        if not pid:
            return False
        try:
            os.kill(int(pid), 0)
        except OSError:
            return False
        return True

    def _terminate_playwright_recorder(entry: dict[str, Any], reason: str = "Recorder helper terminated.") -> None:
        pid = entry.get("pid")
        if pid and _playwright_recorder_process_running(int(pid)):
            try:
                os.kill(int(pid), signal.SIGTERM)
            except OSError:
                pass
        entry["browser_open"] = False
        entry["stop_requested"] = False
        entry["status"] = "stopped"
        entry["message"] = reason

    def _retire_existing_playwright_recorders() -> None:
        now = time.time()
        for entry in runtime["playwright_recorders"].values():
            if not _playwright_recorder_active(entry):
                continue
            entry["stop_requested"] = True
            entry["status"] = "stopping"
            entry["message"] = "A new Chromium recorder session is replacing this one."
            stop_requested_at = entry.get("stop_requested_at")
            if stop_requested_at is None:
                entry["stop_requested_at"] = now
                stop_requested_at = now
            last_seen_at = float(entry.get("last_seen_at") or 0.0)
            if _playwright_recorder_process_running(entry.get("pid")):
                _terminate_playwright_recorder(
                    entry,
                    "Previous recorder session was terminated so a new one could start cleanly.",
                )
                continue
            if last_seen_at and now - last_seen_at > 4:
                _terminate_playwright_recorder(
                    entry,
                    "Previous recorder session was marked stale and retired before launching a new one.",
                )

    def _launch_playwright_recorder_sync(session_id: str, target_url: str) -> None:
        entry = runtime["playwright_recorders"].get(session_id)
        if not entry:
            return
        stop_event: threading.Event = entry["stop_event"]
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            entry["status"] = "error"
            entry["error"] = (
                "Playwright is not installed. Install project dependencies and Chromium to use the Chromium recorder."
            )
            return

        init_script = """
(() => {
  const originalOpen = window.open ? window.open.bind(window) : null;
  window.open = function(url, target) {
    if (url && typeof url === "string") {
      try {
        window.location.assign(url);
      } catch (_) {
        window.location.href = url;
      }
    }
    return window;
  };

  function normalizeNewWindowTargets(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('a[target], form[target]').forEach((node) => {
      const target = (node.getAttribute('target') || '').toLowerCase();
      if (target === '_blank' || target === '_new') {
        node.setAttribute('target', '_self');
      }
    });
  }

  function wireMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) {
          if (node && node.nodeType === Node.ELEMENT_NODE) {
            normalizeNewWindowTargets(node);
          }
        }
      }
    });
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
  }

  function selectorFor(element) {
    if (!element || element === document.body) return "body";
    const form = element.closest("form");
    let prefix = "";
    if (form) {
      if (form.id) {
        prefix = "form#" + CSS.escape(form.id) + " ";
      } else if (form.getAttribute("name")) {
        prefix = "form[name=\"" + form.getAttribute("name") + "\"] ";
      }
    }
    if (element.id) return "#" + CSS.escape(element.id);
    const testId = element.getAttribute("data-testid") || element.getAttribute("data-test");
    if (testId) return prefix + '[data-testid="' + testId + '"]';
    const name = element.getAttribute("name");
    if (name && element.tagName) return prefix + element.tagName.toLowerCase() + '[name="' + name + '"]';
    const aria = element.getAttribute("aria-label");
    if (aria && element.tagName) return prefix + element.tagName.toLowerCase() + '[aria-label="' + aria + '"]';
    const placeholder = element.getAttribute("placeholder");
    if (placeholder && element.tagName) return prefix + element.tagName.toLowerCase() + '[placeholder="' + placeholder + '"]';
    const classes = Array.from(element.classList || []).filter(Boolean).slice(0, 2);
    if (classes.length && element.tagName) return prefix + element.tagName.toLowerCase() + "." + classes.map((item) => CSS.escape(item)).join(".");
    return element.tagName ? prefix + element.tagName.toLowerCase() : "body";
  }

  function send(payload) {
    if (window.asmRecordEvent) {
      window.asmRecordEvent(payload);
    }
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("a, button, input, [role='button']");
    if (!target) return;
    const link = target.closest("a");
    if (link) {
      const targetName = (link.getAttribute("target") || "").toLowerCase();
      if (targetName === "_blank" || targetName === "_new") {
        event.preventDefault();
        const href = link.href;
        if (href) {
          window.location.assign(href);
        }
      }
    }
    send({
      event: "click",
      selector: selectorFor(target),
      text: (target.innerText || target.value || target.getAttribute("aria-label") || "").trim().slice(0, 120),
      href: link ? link.href : null
    });
  }, true);

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!target || !target.tagName) return;
    if (!["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    send({
      event: "fill",
      selector: selectorFor(target),
      value: target.value || ""
    });
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const targetName = (form.getAttribute("target") || "").toLowerCase();
    if (targetName === "_blank" || targetName === "_new") {
      form.setAttribute("target", "_self");
    }
    send({
      event: "submit",
      selector: selectorFor(form),
      action: form.action || window.location.href,
      method: (form.method || "POST").toUpperCase()
    });
  }, true);

  window.addEventListener("load", () => {
    normalizeNewWindowTargets(document);
    wireMutationObserver();
    send({
      event: "page_ready",
      url: window.location.href,
      title: document.title,
      textSnippet: (document.body && document.body.innerText ? document.body.innerText.slice(0, 280) : "")
    });
  });
})();
"""

        try:
            entry["status"] = "launching"
            with sync_playwright() as playwright:
                browser, runtime_name = _launch_visible_recorder_browser(playwright)
                context = browser.new_context(no_viewport=True)
                entry["status"] = "running"
                entry["browser_open"] = True
                entry["message"] = f"{runtime_name} recorder window launched"

                def on_binding(source, payload):
                    if isinstance(payload, dict):
                        _append_playwright_step(session_id, payload)

                context.expose_function("asmRecordEvent", lambda payload: on_binding(None, payload))
                context.add_init_script(init_script)

                page = context.new_page()
                try:
                    page.bring_to_front()
                except Exception:
                    pass

                def handle_extra_page(extra_page):
                    if extra_page == page:
                        return
                    try:
                        popup_url = extra_page.url or "about:blank"
                    except Exception:
                        popup_url = "about:blank"
                    _append_playwright_step(
                        session_id,
                        {
                            "event": "popup_blocked",
                            "url": popup_url,
                            "title": "Blocked secondary tab",
                            "message": "A secondary tab or popup was blocked so the recorder can stay focused on one controlled browser page.",
                        },
                    )
                    try:
                        extra_page.close()
                    except Exception:
                        pass

                context.on("page", handle_extra_page)
                page.on("popup", handle_extra_page)

                def on_navigate(frame):
                    if frame == page.main_frame:
                        _append_playwright_step(
                            session_id,
                            {
                                "event": "navigate",
                                "url": frame.url,
                                "title": page.title() if page.url else "",
                            },
                        )

                page.on("framenavigated", on_navigate)
                page.goto(target_url, wait_until="domcontentloaded")
                try:
                    page.bring_to_front()
                except Exception:
                    pass

                while not stop_event.is_set():
                    try:
                        entry["storage_state"] = json.dumps(context.storage_state())
                        entry["storage_state_captured_at"] = time.time()
                    except Exception:
                        pass
                    if page.is_closed():
                        break
                    time.sleep(0.4)

                try:
                    entry["storage_state"] = json.dumps(context.storage_state())
                    entry["storage_state_captured_at"] = time.time()
                except Exception:
                    pass

                try:
                    context.close()
                except Exception:
                    pass
                try:
                    browser.close()
                except Exception:
                    pass
        except Exception as exc:
            entry["status"] = "error"
            entry["error"] = f"Chromium recorder failed to launch: {exc}"
            entry["browser_open"] = False
            return

        entry["browser_open"] = False
        if entry.get("status") != "error":
            entry["status"] = "stopped"

    async def _latest_results() -> list[dict[str, object]]:
        config = _get_runtime_config()
        if _telemetry_reads_enabled(config):
            return await telemetry.latest_check_results()
        return await state.latest_results()

    async def _recent_results(limit: int) -> list[dict[str, object]]:
        config = _get_runtime_config()
        if _telemetry_reads_enabled(config):
            return await telemetry.recent_check_results(limit)
        return await state.recent_results(limit=limit)

    async def _check_history() -> dict[str, list[dict[str, object]]]:
        config = _get_runtime_config()
        if _telemetry_reads_enabled(config):
            return await telemetry.check_history()
        return await state.check_history()

    async def _node_history() -> dict[str, list[dict[str, object]]]:
        config = _get_runtime_config()
        if _telemetry_reads_enabled(config):
            return await telemetry.node_history()
        return await state.node_history()

    async def _cluster_summary(config: AppConfig) -> dict[str, object]:
        if not dashboard_mode:
            runner = _get_runner()
            return await runner.cluster_status()

        node_history = await _node_history()
        peers = []
        healthy_nodes: list[str] = []
        local_history = node_history.get(config.cluster.node_id, [])
        if local_history and local_history[-1].get("healthy"):
            healthy_nodes.append(config.cluster.node_id)
        for peer in config.cluster.peers:
            peer_history = node_history.get(peer.node_id, [])
            peer_healthy = bool(peer_history and peer_history[-1].get("healthy"))
            if peer_healthy:
                healthy_nodes.append(peer.node_id)
            peers.append(
                {
                    "node_id": peer.node_id,
                    "base_url": peer.base_url,
                    "container_name": peer.container_name,
                    "enabled": peer.enabled,
                    "monitor_scope": peer.monitor_scope,
                    "healthy": peer_healthy,
                    "last_ok_at": peer_history[-1]["timestamp"] if peer_healthy and peer_history else None,
                    "last_error": None,
                    "assigned_checks": [],
                }
            )

        assignable_nodes = [config.cluster.node_id] + [
            peer.node_id for peer in config.cluster.peers if peer.monitor_scope != "peer_only"
        ]
        checks = config.checks
        local_assigned = [
            check.name
            for check in checks
            if (check.assigned_node_id or config.cluster.node_id) == config.cluster.node_id
        ]
        return {
            "enabled": config.cluster.enabled,
            "node_id": config.cluster.node_id,
            "local_monitor_scope": "full",
            "healthy_nodes": healthy_nodes,
            "assignable_nodes": assignable_nodes,
            "assignment_plan": {},
            "peers": peers,
            "local_assigned_checks": local_assigned,
        }

    async def _describe_checks(config: AppConfig) -> list[dict[str, object]]:
        latest_map = {
            str(item.get("check_id") or item.get("name")): item
            for item in await _latest_results()
            if item.get("name")
        }
        cluster = await _cluster_summary(config)
        assignable_nodes = cluster.get("assignable_nodes") or [config.cluster.node_id]
        described: list[dict[str, object]] = []
        for check in config.checks:
            latest = latest_map.get(check.id) or latest_map.get(check.name)
            described.append(
                {
                    "id": check.id,
                    "name": check.name,
                    "type": check.type,
                    "generated": check.name
                    in {"telemetry-timeseries", "telemetry-object-storage", "notification-email-service"},
                    "enabled": check.enabled,
                    "placement_mode": check.placement_mode,
                    "assigned_node_id": check.assigned_node_id,
                    "interval_seconds": check.interval_seconds,
                    "timeout_seconds": check.timeout_seconds,
                    "url": check.url,
                    "host": check.host,
                    "port": check.port,
                    "database_name": check.database_name,
                    "database_engine": check.database_engine,
                    "request_method": check.request_method,
                    "request_headers": [
                        {"name": header.name, "value": header.value}
                        for header in check.request_headers
                    ],
                    "request_body": check.request_body,
                    "request_body_mode": check.request_body_mode,
                    "browser": {
                        "expected_title_contains": check.browser.expected_title_contains,
                        "required_selectors": check.browser.required_selectors,
                        "wait_until": check.browser.wait_until,
                        "viewport_width": check.browser.viewport_width,
                        "viewport_height": check.browser.viewport_height,
                        "persist_auth_session": check.browser.persist_auth_session,
                        "has_storage_state": bool(check.browser.storage_state),
                        "storage_state_captured_at": check.browser.storage_state_captured_at,
                        "steps": [
                            {
                                "name": step.name,
                                "action": step.action,
                                "selector": step.selector,
                                "value": step.value,
                                "timeout_seconds": step.timeout_seconds,
                            }
                            for step in check.browser.steps
                        ],
                    }
                    if check.browser
                    else None,
                    "expected_statuses": check.expected_statuses,
                    "expected_headers": [
                        {"name": header.name, "expected_value": header.expected_value}
                        for header in check.expected_headers
                    ],
                    "max_response_time_ms": check.max_response_time_ms,
                    "expect_authenticated_statuses": check.expect_authenticated_statuses,
                    "retry": {
                        "attempts": check.retry.attempts,
                        "delay_seconds": check.retry.delay_seconds,
                        "retry_on_statuses": check.retry.retry_on_statuses,
                        "retry_on_timeout": check.retry.retry_on_timeout,
                        "retry_on_connection_error": check.retry.retry_on_connection_error,
                    },
                    "alert_thresholds": {
                        "mode": check.alert_thresholds.mode,
                        "availability_warning": check.alert_thresholds.availability_warning,
                        "availability_critical": check.alert_thresholds.availability_critical,
                        "error_rate_warning": check.alert_thresholds.error_rate_warning,
                        "error_rate_critical": check.alert_thresholds.error_rate_critical,
                        "p95_latency_warning_ms": check.alert_thresholds.p95_latency_warning_ms,
                        "p95_latency_critical_ms": check.alert_thresholds.p95_latency_critical_ms,
                        "p99_latency_warning_ms": check.alert_thresholds.p99_latency_warning_ms,
                        "p99_latency_critical_ms": check.alert_thresholds.p99_latency_critical_ms,
                    },
                    "has_auth": check.auth is not None,
                    "auth": {
                        "type": check.auth.type,
                        "username": check.auth.username,
                        "password": check.auth.password,
                        "token": check.auth.token,
                        "header_name": check.auth.header_name,
                        "header_value": check.auth.header_value,
                    }
                    if check.auth
                    else None,
                    "status": _status_from_result(latest, check.enabled),
                    "latest_result": latest,
                    "content_rules": {
                        "contains": check.content.contains if check.content else [],
                        "not_contains": check.content.not_contains if check.content else [],
                        "regex": check.content.regex if check.content else None,
                    },
                    "owner": (latest or {}).get("owner")
                    or check.assigned_node_id
                    or config.cluster.node_id,
                    "assignable_nodes": assignable_nodes,
                }
            )
        return described

    auth_manager = AuthManager(_get_runtime_config, store)
    require_read_only = auth_manager.require_role("read_only")
    require_read_write = auth_manager.require_role("read_write")
    require_admin = auth_manager.require_role("admin")
    generated_check_names = {
        "telemetry-timeseries",
        "telemetry-object-storage",
        "notification-email-service",
    }

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        config = store.load()
        if dashboard_mode:
            if not config.telemetry.enabled:
                raise RuntimeError(
                    "Dashboard mode requires telemetry storage to be enabled so replicas can serve shared dashboard data."
                )
            if config.telemetry.enabled:
                await telemetry.ensure_ready()
            runtime["runner"] = None
            runtime["runner_task"] = None
            yield
            return
        runner = MonitorRunner(config, state=state)
        task = asyncio.create_task(runner.run(), name="monitor-runner")
        runtime["runner"] = runner
        runtime["runner_task"] = task
        yield
        for client in runtime["recorder_clients"].values():
            try:
                client.close()
            except Exception:
                pass
        runner.stop()
        await asyncio.gather(task, return_exceptions=True)

    app = FastAPI(title="Async Service Monitor Admin", lifespan=lifespan)

    @app.get("/", response_class=HTMLResponse)
    async def index() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/monitors", response_class=HTMLResponse)
    async def monitors_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/dashboards", response_class=HTMLResponse)
    async def dashboards_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/dashboards/{check_name:path}", response_class=HTMLResponse)
    async def dashboard_detail_page(check_name: str) -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/monitors/new", response_class=HTMLResponse)
    async def monitor_create_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/monitors/new/basic", response_class=HTMLResponse)
    async def monitor_create_basic_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/monitors/new/advanced", response_class=HTMLResponse)
    async def monitor_create_advanced_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/monitors/new/advanced/browser-health-monitor", response_class=HTMLResponse)
    async def monitor_create_browser_health_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/monitors/new/advanced/real-user-monitoring", response_class=HTMLResponse)
    async def monitor_create_rum_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/monitors/new/advanced/monitor-recorder", response_class=HTMLResponse)
    async def monitor_create_recorder_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/configured-monitors", response_class=HTMLResponse)
    async def configured_monitors_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/monitors/{check_name:path}", response_class=HTMLResponse)
    async def monitor_detail_page(check_name: str) -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/containers", response_class=HTMLResponse)
    async def containers_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/cluster", response_class=HTMLResponse)
    async def cluster_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/cluster/configure", response_class=HTMLResponse)
    async def cluster_configure_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/cluster/{container_name:path}", response_class=HTMLResponse)
    async def cluster_container_page(container_name: str) -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/guide", response_class=HTMLResponse)
    async def guide_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/admin", response_class=HTMLResponse)
    async def admin_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/admin/users", response_class=HTMLResponse)
    async def admin_users_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/admin/config", response_class=HTMLResponse)
    async def admin_config_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/admin/cluster", response_class=HTMLResponse)
    async def admin_cluster_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/admin/cluster/{container_name:path}", response_class=HTMLResponse)
    async def admin_cluster_container_page(container_name: str) -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/profile", response_class=HTMLResponse)
    async def profile_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/app.css")
    async def app_css() -> Response:
        return Response(
            (Path(__file__).parent / "web" / "app.css").read_text(encoding="utf-8"),
            media_type="text/css",
            headers=_no_cache_headers(),
        )

    @app.get("/app.js")
    async def app_js() -> Response:
        return Response(
            (Path(__file__).parent / "web" / "app.js").read_text(encoding="utf-8"),
            media_type="application/javascript",
            headers=_no_cache_headers(),
        )

    @app.get("/vendor/plotly.min.js")
    async def vendor_plotly_js() -> Response:
        return Response(
            (Path(__file__).parent / "web" / "vendor" / "plotly.min.js").read_text(encoding="utf-8"),
            media_type="application/javascript",
            headers=_no_cache_headers(),
        )

    @app.get("/help-assets/{asset_name}")
    async def help_asset(asset_name: str) -> Response:
        asset_path = (Path(__file__).parent / "web" / "help_assets" / asset_name).resolve()
        base_dir = (Path(__file__).parent / "web" / "help_assets").resolve()
        if base_dir not in asset_path.parents or not asset_path.exists() or not asset_path.is_file():
            raise HTTPException(status_code=404, detail="Help asset not found")
        media_type = mimetypes.guess_type(asset_path.name)[0] or "application/octet-stream"
        return Response(
            asset_path.read_text(encoding="utf-8") if media_type.startswith("text/") or media_type == "image/svg+xml" else asset_path.read_bytes(),
            media_type=media_type,
            headers=_no_cache_headers(),
        )

    @app.get("/api/session")
    async def session(session_id: str | None = Cookie(default=None, alias="service_monitor_session")) -> dict[str, object]:
        return auth_manager.authenticate_optional(session_id)

    @app.get("/livez")
    async def livez() -> dict[str, object]:
        return {
            "status": "alive",
            "app_mode": app_mode,
            "dashboard_mode": dashboard_mode,
        }

    async def _readiness_payload() -> dict[str, object]:
        config = store.load()
        payload: dict[str, object] = {
            "status": "ready",
            "app_mode": app_mode,
            "dashboard_mode": dashboard_mode,
            "telemetry": "disabled",
            "runner": "dashboard-only" if dashboard_mode else "starting",
        }
        if config.telemetry.enabled:
            try:
                await telemetry.ensure_ready()
            except Exception as exc:
                raise HTTPException(
                    status_code=503,
                    detail={
                        "status": "not-ready",
                        "reason": "telemetry",
                        "message": str(exc),
                    },
                ) from exc
            payload["telemetry"] = "ready"

        if not dashboard_mode:
            runner_task = runtime.get("runner_task")
            if runner_task is None:
                raise HTTPException(
                    status_code=503,
                    detail={
                        "status": "not-ready",
                        "reason": "runner",
                        "message": "Monitor runner has not started yet.",
                    },
                )
            if runner_task.done():
                message = "Monitor runner stopped unexpectedly."
                try:
                    exception = runner_task.exception()
                except asyncio.CancelledError:
                    exception = None
                if exception is not None:
                    message = str(exception)
                raise HTTPException(
                    status_code=503,
                    detail={
                        "status": "not-ready",
                        "reason": "runner",
                        "message": message,
                    },
                )
            payload["runner"] = "ready"

        return payload

    @app.get("/readyz")
    async def readyz() -> dict[str, object]:
        return await _readiness_payload()

    @app.get("/healthz")
    async def healthz() -> dict[str, object]:
        return await _readiness_payload()

    @app.post("/api/auth/login")
    async def login(payload: LoginPayload, response: Response) -> dict[str, object]:
        return auth_manager.login(response, payload.username, payload.password)

    @app.post("/api/auth/logout")
    async def logout(
        response: Response,
        session_id: str | None = Cookie(default=None, alias="service_monitor_session"),
    ) -> dict[str, str]:
        auth_manager.logout(response, session_id)
        return {"status": "ok"}

    @app.post("/api/auth/register")
    async def register(payload: RegisterPayload) -> dict[str, object]:
        user = auth_manager.register(
            payload.username,
            payload.password,
            payload.first_name,
            payload.last_name,
        )
        return {
            "status": "ok",
            "user": {
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": user.role,
                "enabled": user.enabled,
                "last_login_at": user.last_login_at,
            },
        }

    @app.post("/api/auth/bootstrap")
    async def bootstrap(payload: BootstrapPayload, response: Response) -> dict[str, object]:
        user = auth_manager.bootstrap_admin(
            response,
            payload.username,
            payload.password,
            payload.first_name,
            payload.last_name,
        )
        return {"status": "ok", "user": user}

    @app.post("/api/auth/reset-password")
    async def reset_password(payload: ResetPasswordPayload) -> dict[str, str]:
        auth_manager.reset_password(payload.username, payload.password)
        return {"status": "ok"}

    @app.get("/api/profile")
    async def profile(
        current_user: dict[str, object] = Depends(require_read_only),
    ) -> dict[str, object]:
        return current_user

    @app.put("/api/profile")
    async def update_profile(
        payload: ProfilePayload,
        current_user: dict[str, object] = Depends(require_read_only),
    ) -> dict[str, object]:
        user = auth_manager.update_profile(
            str(current_user["username"]),
            payload.first_name,
            payload.last_name,
            payload.password,
            payload.dark_mode,
        )
        return {
            "status": "ok",
            "user": {
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": user.role,
                "enabled": user.enabled,
                "dark_mode": user.dark_mode,
                "last_login_at": user.last_login_at,
                "provider": current_user["provider"],
                "authenticated": True,
            },
        }

    @app.get("/api/overview")
    async def overview(current_user: dict[str, str] = Depends(require_read_only)) -> dict[str, object]:
        config = _get_runtime_config()
        latest = await _latest_results()
        healthy = sum(1 for item in latest if item.get("success"))
        summary = {
            "started_at": state.started_at,
            "checks_seen": len(latest),
            "healthy_checks": healthy,
            "unhealthy_checks": len(latest) - healthy,
        }
        return {
            "config_path": runtime["config_path"],
            "node_id": config.cluster.node_id,
            "cluster_enabled": config.cluster.enabled,
            "total_checks": len(config.checks),
            "summary": summary,
        }

    @app.get("/api/checks")
    async def checks(current_user: dict[str, str] = Depends(require_read_only)) -> list[dict[str, object]]:
        return await _describe_checks(_get_runtime_config())

    @app.post("/api/checks/test")
    async def test_check(
        payload: CheckPayload,
        current_user: dict[str, str] = Depends(require_read_write),
    ) -> dict[str, object]:
        check = _check_from_payload(payload)
        runner = _get_runner()
        result = await runner.execute_check_preview(check)
        return asdict(result)

    @app.post("/api/checks/test-auth")
    async def test_check_auth(
        payload: CheckPayload,
        current_user: dict[str, str] = Depends(require_read_write),
    ) -> dict[str, object]:
        try:
            check = _auth_test_check_from_payload(payload)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        runner = _get_runner()
        result = await runner.execute_check_preview(check)
        return asdict(result)

    @app.patch("/api/checks/bulk/enabled")
    async def set_checks_enabled_bulk(
        payload: BulkCheckEnabledPayload,
        current_user: dict[str, str] = Depends(require_read_write),
    ) -> dict[str, object]:
        requested_names = [name for name in payload.names if name]
        if not requested_names:
            raise HTTPException(status_code=400, detail="Select at least one monitor")
        protected_names = sorted(name for name in requested_names if name in generated_check_names)
        if protected_names:
            raise HTTPException(
                status_code=400,
                detail=f"Generated monitors cannot be updated here: {', '.join(protected_names)}",
            )
        for check_name in requested_names:
            try:
                store.set_check_enabled(check_name, payload.enabled)
            except ValueError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
        runner = _get_runner()
        await runner.apply_config(store.load())
        return {"status": "ok", "updated": len(requested_names)}

    @app.post("/api/checks/bulk/delete")
    async def delete_checks_bulk(
        payload: BulkCheckSelectionPayload,
        current_user: dict[str, str] = Depends(require_read_write),
    ) -> dict[str, object]:
        requested_names = [name for name in payload.names if name]
        if not requested_names:
            raise HTTPException(status_code=400, detail="Select at least one monitor")
        protected_names = sorted(name for name in requested_names if name in generated_check_names)
        if protected_names:
            raise HTTPException(
                status_code=400,
                detail=f"Generated monitors cannot be deleted here: {', '.join(protected_names)}",
            )
        for check_name in requested_names:
            try:
                store.delete_check(check_name)
            except ValueError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
        runner = _get_runner()
        await runner.apply_config(store.load())
        return {"status": "ok", "deleted": len(requested_names)}

    @app.get("/api/checks/{check_name}")
    async def check_detail(
        check_name: str, current_user: dict[str, str] = Depends(require_read_only)
    ) -> dict[str, object]:
        check = next((item for item in await _describe_checks(_get_runtime_config()) if item["name"] == check_name), None)
        if check is None:
            raise HTTPException(status_code=404, detail=f"Check '{check_name}' was not found")
        return check

    @app.post("/api/checks")
    async def add_check(
        payload: CheckPayload, current_user: dict[str, str] = Depends(require_read_write)
    ) -> dict[str, object]:
        check = _check_from_payload(payload)
        try:
            store.add_check(check)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        runner = _get_runner()
        await runner.apply_config(store.load())
        return {"status": "ok"}

    @app.put("/api/checks/{check_name}")
    async def update_check(
        check_name: str,
        payload: CheckPayload,
        current_user: dict[str, str] = Depends(require_read_write),
    ) -> dict[str, object]:
        if check_name in generated_check_names:
            raise HTTPException(status_code=400, detail="This generated monitor is managed by service configuration")
        check = _check_from_payload(payload)
        existing = next((item for item in store.load().checks if item.name == check_name), None)
        if existing is not None:
            check.id = existing.id
        if existing and check.type == "browser" and check.browser:
            if check.browser.persist_auth_session:
                if not check.browser.storage_state and existing.browser and existing.browser.storage_state:
                    check.browser.storage_state = existing.browser.storage_state
                    check.browser.storage_state_captured_at = existing.browser.storage_state_captured_at
            else:
                check.browser.storage_state = None
                check.browser.storage_state_captured_at = None
        try:
            store.update_check(check_name, check)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        runner = _get_runner()
        await runner.apply_config(store.load())
        return {"status": "ok"}

    @app.patch("/api/checks/{check_name}/enabled")
    async def set_check_enabled(
        check_name: str,
        payload: CheckStatePayload,
        current_user: dict[str, str] = Depends(require_read_write),
    ) -> dict[str, object]:
        if check_name in generated_check_names:
            raise HTTPException(status_code=400, detail="This generated monitor is managed by service configuration")
        try:
            store.set_check_enabled(check_name, payload.enabled)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

        runner = _get_runner()
        await runner.apply_config(store.load())
        return {"status": "ok"}

    @app.patch("/api/checks/{check_name}/browser-session")
    async def update_browser_session_state(
        check_name: str,
        payload: BrowserSessionStatePayload,
        current_user: dict[str, str] = Depends(require_read_write),
    ) -> dict[str, object]:
        if check_name in generated_check_names:
            raise HTTPException(status_code=400, detail="This generated monitor is managed by service configuration")
        config = store.load()
        check = next((item for item in config.checks if item.name == check_name), None)
        if check is None:
            raise HTTPException(status_code=404, detail=f"Check '{check_name}' was not found")
        if check.type != "browser" or check.browser is None:
            raise HTTPException(status_code=400, detail="Only browser monitors support stored browser sessions")

        if payload.clear:
            store.update_browser_storage_state(check_name, None, None)
        else:
            raw = (payload.storage_state or "").strip()
            if not raw:
                raise HTTPException(status_code=400, detail="Provide a browser session payload or choose clear")
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail=f"Browser session payload must be valid JSON: {exc.msg}") from exc
            if not isinstance(parsed, dict) or not isinstance(parsed.get("cookies", []), list):
                raise HTTPException(status_code=400, detail="Browser session payload must look like Playwright storage_state JSON")
            store.update_browser_storage_state(check_name, json.dumps(parsed), time.time())

        runner = _get_runner()
        await runner.apply_config(store.load())
        updated = next((item for item in await _describe_checks(_get_runtime_config()) if item["name"] == check_name), None)
        return {"status": "ok", "check": updated}

    @app.delete("/api/checks/{check_name}")
    async def delete_check(
        check_name: str, current_user: dict[str, str] = Depends(require_read_write)
    ) -> dict[str, object]:
        if check_name in generated_check_names:
            raise HTTPException(status_code=400, detail="This generated monitor is managed by service configuration")
        try:
            store.delete_check(check_name)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

        runner = _get_runner()
        await runner.apply_config(store.load())
        return {"status": "ok"}

    @app.get("/api/results")
    async def results(
        limit: int = 100, current_user: dict[str, str] = Depends(require_read_only)
    ) -> list[dict[str, object]]:
        return await _recent_results(limit)

    @app.get("/api/metrics/checks")
    async def check_metrics(
        current_user: dict[str, str] = Depends(require_read_only),
    ) -> dict[str, list[dict[str, object]]]:
        return await _check_history()

    @app.get("/api/metrics/nodes")
    async def node_metrics(
        current_user: dict[str, str] = Depends(require_read_only),
    ) -> dict[str, list[dict[str, object]]]:
        return await _node_history()

    @app.get("/api/cluster")
    async def cluster(current_user: dict[str, str] = Depends(require_read_only)) -> dict[str, object]:
        return await _cluster_summary(_get_runtime_config())

    @app.get("/api/peers")
    async def peers(current_user: dict[str, str] = Depends(require_admin)) -> list[dict[str, object]]:
        runner = _get_runner()
        return runner.peer_details()

    @app.post("/api/peers")
    async def add_peer(
        payload: PeerPayload, current_user: dict[str, str] = Depends(require_admin)
    ) -> dict[str, object]:
        try:
            store.add_peer(_peer_from_payload(payload))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        runner = _get_runner()
        await runner.apply_config(store.load())
        return {"status": "ok"}

    @app.put("/api/peers/{node_id}")
    async def update_peer(
        node_id: str,
        payload: PeerPayload,
        current_user: dict[str, str] = Depends(require_admin),
    ) -> dict[str, object]:
        try:
            store.update_peer(node_id, _peer_from_payload(payload))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        runner = _get_runner()
        await runner.apply_config(store.load())
        return {"status": "ok"}

    @app.patch("/api/peers/{node_id}/enabled")
    async def set_peer_enabled(
        node_id: str,
        payload: CheckStatePayload,
        current_user: dict[str, str] = Depends(require_admin),
    ) -> dict[str, object]:
        try:
            store.set_peer_enabled(node_id, payload.enabled)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        runner = _get_runner()
        await runner.apply_config(store.load())
        return {"status": "ok"}

    @app.delete("/api/peers/{node_id}")
    async def delete_peer(
        node_id: str, current_user: dict[str, str] = Depends(require_admin)
    ) -> dict[str, object]:
        try:
            store.delete_peer(node_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        runner = _get_runner()
        await runner.apply_config(store.load())
        return {"status": "ok"}

    @app.get("/api/containers")
    async def containers(
        current_user: dict[str, str] = Depends(require_read_only)
    ) -> dict[str, object]:
        runner = _get_runner()
        return await runner.container_status()

    @app.post("/api/containers/{container_name}/{action}")
    async def container_action(
        container_name: str,
        action: str,
        current_user: dict[str, str] = Depends(require_admin),
    ) -> dict[str, object]:
        runner = _get_runner()
        try:
            return await runner.manage_container(container_name, action)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except docker.errors.DockerException as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.post("/api/containers")
    async def create_container(
        payload: ContainerCreatePayload, current_user: dict[str, str] = Depends(require_admin)
    ) -> dict[str, object]:
        runner = _get_runner()
        request_payload = payload.model_dump()
        request_payload["config_path"] = runtime["config_path"]
        added_peer = False
        try:
            planned = await runner.plan_container_creation(request_payload)
            store.add_peer(
                PeerConfig(
                    node_id=payload.node_id,
                    base_url=str(planned.get("base_url") or payload.base_url or "").rstrip("/"),
                    enabled=payload.enabled,
                    container_name=str(planned.get("container_name") or payload.container_name or payload.node_id),
                    monitor_scope=payload.monitor_scope,
                    recovery=DockerRecoveryConfig(
                        enabled=payload.recovery_enabled,
                        container_name=str(planned.get("container_name") or payload.container_name or payload.node_id),
                    ),
                )
            )
            added_peer = True
            await runner.apply_config(store.load())
            result = await runner.create_monitor_container(request_payload)
            if str(result.get("base_url") or "") != str(planned.get("base_url") or ""):
                existing = store.load()
                peer_config = next((peer for peer in existing.cluster.peers if peer.node_id == payload.node_id), None)
                if peer_config is not None:
                    peer_config.base_url = str(result.get("base_url") or peer_config.base_url).rstrip("/")
                    peer_config.container_name = str(result.get("container") or peer_config.container_name or payload.node_id)
                    peer_config.recovery.container_name = str(result.get("container") or peer_config.recovery.container_name or payload.node_id)
                    store.update_peer(payload.node_id, peer_config)
                    await runner.apply_config(store.load())
        except ValueError as exc:
            try:
                if added_peer:
                    store.delete_peer(payload.node_id)
                    await runner.apply_config(store.load())
            except Exception:
                pass
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except docker.errors.DockerException as exc:
            try:
                if added_peer:
                    store.delete_peer(payload.node_id)
                    await runner.apply_config(store.load())
            except Exception:
                pass
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        return result

    @app.get("/api/stream")
    async def stream(current_user: dict[str, str] = Depends(require_read_only)) -> dict[str, object]:
        return {
            "timestamp": time.time(),
            "results": await state.recent_results(limit=25),
        }

    @app.get("/api/users")
    async def users(current_user: dict[str, str] = Depends(require_admin)) -> list[dict[str, object]]:
        config = _get_runtime_config()
        return [
            {
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": user.role,
                "enabled": user.enabled,
                "dark_mode": user.dark_mode,
                "last_login_at": user.last_login_at,
            }
            for user in config.portal.users
        ]

    @app.post("/api/recorder/session")
    async def create_recorder_session(
        current_user: dict[str, str] = Depends(require_read_write),
    ) -> dict[str, str]:
        session_id = secrets.token_urlsafe(18)
        await asyncio.to_thread(_get_recorder_client, session_id)
        return {"session_id": session_id}

    @app.api_route("/api/recorder/proxy", methods=["GET", "POST"])
    async def recorder_proxy(
        request: Request,
        url: str = Query(...),
        session_id: str = Query(...),
        current_user: dict[str, str] = Depends(require_read_write),
    ) -> Response:
        form_data: list[tuple[str, str]] = []
        if request.method != "GET":
            submitted = await request.form()
            form_data = [(str(key), str(value)) for key, value in submitted.multi_items()]
        body, content_type = await asyncio.to_thread(
            _proxy_recorder_request_sync,
            url,
            session_id,
            request.method,
            dict(request.headers),
            form_data,
        )
        return Response(content=body, media_type=content_type, headers=_no_cache_headers())

    @app.post("/api/recorder/playwright-session")
    async def launch_playwright_recorder(
        url: str = Query(...),
        current_user: dict[str, str] = Depends(require_read_write),
    ) -> dict[str, object]:
        _retire_existing_playwright_recorders()
        session_id = secrets.token_urlsafe(18)
        token = secrets.token_urlsafe(24)
        entry = {
            "session_id": session_id,
            "url": url,
            "status": "launching",
            "error": None,
            "message": "Launching desktop recorder helper...",
            "steps": [],
            "browser_open": False,
            "stop_requested": False,
            "stop_requested_at": None,
            "token": token,
            "pid": None,
            "started_at": time.time(),
            "last_seen_at": time.time(),
        }
        runtime["playwright_recorders"][session_id] = entry
        try:
            entry["pid"] = _spawn_desktop_recorder_helper(session_id, url, token)
        except Exception as exc:
            entry["status"] = "error"
            entry["error"] = f"Failed to launch desktop recorder helper: {exc}"
        return {
            "session_id": session_id,
            "status": entry["status"],
            "message": entry["message"],
        }

    @app.get("/api/recorder/storage-state")
    async def recorder_storage_state(
        mode: Literal["in_app", "playwright"] = Query("in_app"),
        session_id: str = Query(...),
        url: str | None = Query(default=None),
        current_user: dict[str, str] = Depends(require_read_write),
    ) -> dict[str, object]:
        if mode == "playwright":
            entry = runtime["playwright_recorders"].get(session_id)
            if not entry:
                raise HTTPException(status_code=404, detail="Playwright recorder session was not found")
            return {
                "available": bool(entry.get("storage_state")),
                "storage_state": entry.get("storage_state"),
                "captured_at": entry.get("storage_state_captured_at"),
                "source": "playwright",
            }
        if not url:
            raise HTTPException(status_code=400, detail="url is required for embedded recorder session capture")
        storage_state, captured_at = await asyncio.to_thread(_embedded_recorder_storage_state, session_id, url)
        return {
            "available": bool(storage_state),
            "storage_state": storage_state,
            "captured_at": captured_at,
            "source": "in_app",
        }

    @app.get("/api/recorder/playwright-session/{recorder_session_id}")
    async def playwright_recorder_status(
        recorder_session_id: str,
        current_user: dict[str, str] = Depends(require_read_write),
    ) -> dict[str, object]:
        entry = runtime["playwright_recorders"].get(recorder_session_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Playwright recorder session was not found")
        return {
            "session_id": entry["session_id"],
            "url": entry["url"],
            "status": entry["status"],
            "error": entry["error"],
            "message": entry.get("message"),
            "browser_open": entry["browser_open"],
            "has_storage_state": bool(entry.get("storage_state")),
            "storage_state_captured_at": entry.get("storage_state_captured_at"),
            "steps": entry["steps"],
        }

    @app.post("/api/recorder/playwright-session/{recorder_session_id}/stop")
    async def stop_playwright_recorder(
        recorder_session_id: str,
        current_user: dict[str, str] = Depends(require_read_write),
    ) -> dict[str, object]:
        entry = runtime["playwright_recorders"].get(recorder_session_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Playwright recorder session was not found")
        entry["status"] = "stopping"
        entry["message"] = "Stopping desktop recorder helper..."
        entry["stop_requested"] = True
        entry["stop_requested_at"] = time.time()
        return {"status": "ok"}

    def _require_recorder_helper(recorder_session_id: str, request: Request) -> dict[str, Any]:
        entry = runtime["playwright_recorders"].get(recorder_session_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Recorder session was not found")
        provided = request.headers.get("x-recorder-token", "")
        if not provided or provided != entry.get("token"):
            raise HTTPException(status_code=403, detail="Recorder helper token was rejected")
        return entry

    @app.post("/api/internal/recorder/playwright-session/{recorder_session_id}/status")
    async def update_playwright_recorder_status(
        recorder_session_id: str,
        request: Request,
    ) -> dict[str, object]:
        payload = RecorderHelperStatusPayload.model_validate(await request.json())
        entry = _require_recorder_helper(recorder_session_id, request)
        entry["last_seen_at"] = time.time()
        entry["status"] = payload.status
        entry["error"] = payload.error
        entry["message"] = payload.message
        if payload.browser_open is not None:
            entry["browser_open"] = payload.browser_open
        if payload.storage_state is not None:
            entry["storage_state"] = payload.storage_state
        if payload.storage_state_captured_at is not None:
            entry["storage_state_captured_at"] = payload.storage_state_captured_at
        if payload.status in {"stopped", "error"}:
            entry["stop_requested"] = False
        return {"status": "ok"}

    @app.post("/api/internal/recorder/playwright-session/{recorder_session_id}/event")
    async def append_playwright_recorder_event(
        recorder_session_id: str,
        request: Request,
    ) -> dict[str, object]:
        payload = RecorderHelperEventPayload.model_validate(await request.json())
        entry = _require_recorder_helper(recorder_session_id, request)
        entry["last_seen_at"] = time.time()
        _append_playwright_step(recorder_session_id, payload.model_dump(exclude_none=True))
        return {"status": "ok"}

    @app.get("/api/internal/recorder/playwright-session/{recorder_session_id}/control")
    async def playwright_recorder_control(
        recorder_session_id: str,
        request: Request,
    ) -> dict[str, object]:
        entry = _require_recorder_helper(recorder_session_id, request)
        return {"stop_requested": bool(entry.get("stop_requested"))}

    @app.post("/api/users")
    async def add_user(
        payload: PortalUserPayload, current_user: dict[str, str] = Depends(require_admin)
    ) -> dict[str, object]:
        try:
            store.add_user(_user_from_payload(payload))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        runner = _get_runner()
        await runner.apply_config(store.load())
        return {"status": "ok"}

    @app.put("/api/users/{username}")
    async def update_user(
        username: str,
        payload: PortalUserPayload,
        current_user: dict[str, str] = Depends(require_admin),
    ) -> dict[str, object]:
        try:
            existing = store.find_user(username)
            if existing is None:
                raise ValueError(f"User '{username}' was not found")
            store.update_user(username, _user_from_payload(payload, existing))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        runner = _get_runner()
        await runner.apply_config(store.load())
        return {"status": "ok"}

    @app.delete("/api/users/{username}")
    async def delete_user(
        username: str, current_user: dict[str, str] = Depends(require_admin)
    ) -> dict[str, object]:
        try:
            store.delete_user(username)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        runner = _get_runner()
        await runner.apply_config(store.load())
        return {"status": "ok"}

    @app.get("/api/settings/telemetry")
    async def telemetry_settings(
        current_user: dict[str, object] = Depends(require_admin),
    ) -> dict[str, object]:
        telemetry = _get_runtime_config().telemetry
        return {
            "enabled": telemetry.enabled,
            "timeseries_provider": telemetry.timeseries_provider,
            "timeseries_host": telemetry.timeseries_host,
            "timeseries_port": telemetry.timeseries_port,
            "timeseries_database": telemetry.timeseries_database,
            "timeseries_username": telemetry.timeseries_username,
            "timeseries_password": telemetry.timeseries_password,
            "timeseries_use_ssl": telemetry.timeseries_use_ssl,
            "auto_provision_timeseries_local": telemetry.auto_provision_timeseries_local,
            "timeseries_local_container_name": telemetry.timeseries_local_container_name,
            "object_provider": telemetry.object_provider,
            "object_endpoint": telemetry.object_endpoint,
            "object_access_key": telemetry.object_access_key,
            "object_secret_key": telemetry.object_secret_key,
            "object_bucket": telemetry.object_bucket,
            "object_region": telemetry.object_region,
            "object_use_ssl": telemetry.object_use_ssl,
            "auto_provision_object_local": telemetry.auto_provision_object_local,
            "object_local_container_name": telemetry.object_local_container_name,
            "object_console_port": telemetry.object_console_port,
            "retention_hours": telemetry.retention_hours,
        }

    @app.get("/api/settings/ui-scaling")
    async def ui_scaling_settings(
        current_user: dict[str, object] = Depends(require_admin),
    ) -> dict[str, object]:
        config = _get_runtime_config()
        scaling = config.ui_scaling
        return {
            "enabled": scaling.enabled,
            "dashboard_replicas": scaling.dashboard_replicas,
            "session_strategy": scaling.session_strategy,
            "sticky_sessions": scaling.sticky_sessions,
            "proxy_container_name": scaling.proxy_container_name,
            "dashboard_container_prefix": scaling.dashboard_container_prefix,
            "proxy_port": scaling.proxy_port,
            "session_secret_configured": bool(config.portal.session_secret),
        }

    @app.put("/api/settings/telemetry")
    async def update_telemetry_settings(
        payload: TelemetryPayload,
        current_user: dict[str, object] = Depends(require_admin),
    ) -> dict[str, object]:
        telemetry = TelemetryConfig(**payload.model_dump())
        message = "Telemetry settings saved."
        runner = _get_runner()
        if (
            telemetry.enabled
            and telemetry.timeseries_provider == "local_postgresql"
            and telemetry.auto_provision_timeseries_local
        ):
            if not telemetry.timeseries_database:
                telemetry.timeseries_database = "async_service_monitor"
            if not telemetry.timeseries_username:
                telemetry.timeseries_username = "asm_telemetry"
            if not telemetry.timeseries_password:
                telemetry.timeseries_password = secrets.token_urlsafe(18)
            if not telemetry.timeseries_host:
                telemetry.timeseries_host = "127.0.0.1"
            provisioned_pg = await runner.provision_local_postgresql(telemetry)
            telemetry.timeseries_host = str(provisioned_pg["host"])
            telemetry.timeseries_port = int(provisioned_pg["port"])
            telemetry.timeseries_local_container_name = str(provisioned_pg["container_name"])
            message = (
                "Telemetry settings saved and local PostgreSQL is available in "
                f"container '{telemetry.timeseries_local_container_name}'."
            )
        if (
            telemetry.enabled
            and telemetry.object_provider == "local_minio"
            and telemetry.auto_provision_object_local
        ):
            if not telemetry.object_access_key:
                telemetry.object_access_key = "asm_minio"
            if not telemetry.object_secret_key:
                telemetry.object_secret_key = secrets.token_urlsafe(24)
            minio_provisioned = await runner.provision_local_minio(telemetry)
            telemetry.object_endpoint = str(minio_provisioned["endpoint"])
            telemetry.object_console_port = int(minio_provisioned["console_port"])
            telemetry.object_local_container_name = str(minio_provisioned["container_name"])
            telemetry.object_access_key = str(minio_provisioned["access_key"])
            telemetry.object_secret_key = str(minio_provisioned["secret_key"])
            telemetry.object_bucket = str(minio_provisioned["bucket"])
            message = (
                f"{message.rstrip('.')} and local MinIO is available in container "
                f"'{telemetry.object_local_container_name}'."
            )
        try:
            store.update_telemetry(telemetry)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        await runner.apply_config(store.load())
        return {"status": "ok", "message": message}

    @app.put("/api/settings/ui-scaling")
    async def update_ui_scaling_settings(
        payload: UIScalingPayload,
        current_user: dict[str, object] = Depends(require_admin),
    ) -> dict[str, object]:
        runner = _get_runner()
        config = store.load()
        ui_scaling = UIScalingConfig(**payload.model_dump())
        if ui_scaling.enabled and not config.portal.session_secret:
            config.portal.session_secret = secrets.token_urlsafe(48)
            store.update_portal_settings(config.portal)
            config = store.load()
        store.update_ui_scaling(ui_scaling)
        updated = store.load()
        await runner.apply_config(updated)
        try:
            scaling_result = await runner.reconcile_ui_scaling(runtime["config_path"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except docker.errors.DockerException as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        message = (
            f"UI scaling enabled with {ui_scaling.dashboard_replicas} dashboard replicas."
            if ui_scaling.enabled
            else "UI scaling disabled and scaled dashboard containers were removed."
        )
        return {"status": "ok", "message": message, "scaling": scaling_result}

    @app.get("/api/settings/email")
    async def email_settings(
        current_user: dict[str, object] = Depends(require_admin),
    ) -> dict[str, object]:
        email = _get_runtime_config().notifications.email
        return {
            "enabled": email.enabled,
            "provider": email.provider,
            "host": email.host,
            "port": email.port,
            "username": email.username,
            "password": email.password,
            "from_address": email.from_address,
            "to_addresses": email.to_addresses,
            "subject_prefix": email.subject_prefix,
            "use_tls": email.use_tls,
            "use_ssl": email.use_ssl,
            "auto_provision_local": email.auto_provision_local,
            "local_container_name": email.local_container_name,
            "local_ui_port": email.local_ui_port,
        }

    @app.put("/api/settings/email")
    async def update_email_settings(
        payload: EmailSettingsPayload,
        current_user: dict[str, object] = Depends(require_admin),
    ) -> dict[str, object]:
        email = EmailConfig(**payload.model_dump())
        message = "Email service settings saved."
        runner = _get_runner()
        if email.enabled and email.auto_provision_local:
            if not email.host:
                email.host = "127.0.0.1"
            provisioned = await runner.provision_local_email_service(email)
            email.host = str(provisioned["host"])
            email.port = int(provisioned["port"])
            email.local_container_name = str(provisioned["container_name"])
            email.local_ui_port = int(provisioned["ui_port"])
            if not email.from_address:
                email.from_address = "monitor@localhost"
            message = (
                "Email settings saved and local email service is available in "
                f"container '{email.local_container_name}'."
            )
        try:
            store.update_email_settings(email)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        await runner.apply_config(store.load())
        return {"status": "ok", "message": message}

    @app.get("/api/settings/portal")
    async def portal_settings(
        current_user: dict[str, object] = Depends(require_admin),
    ) -> dict[str, object]:
        portal = _get_runtime_config().portal
        return {
            "enabled": portal.enabled,
            "provider": portal.provider,
            "realm": portal.realm,
            "session_secret_configured": bool(portal.session_secret),
            "oci_enabled": portal.oci.enabled,
            "tenancy_ocid": portal.oci.tenancy_ocid,
            "user_ocid": portal.oci.user_ocid,
            "region": portal.oci.region,
            "group_claim": portal.oci.group_claim,
        }

    @app.put("/api/settings/portal")
    async def update_portal_settings(
        payload: PortalSettingsPayload,
        current_user: dict[str, object] = Depends(require_admin),
    ) -> dict[str, object]:
        config = _get_runtime_config()
        try:
            store.update_portal_settings(
                PortalAuthConfig(
                    enabled=payload.enabled,
                    provider=payload.provider,
                    realm=payload.realm,
                    session_secret=config.portal.session_secret,
                    users=config.portal.users,
                    oci=OCIAuthConfig(
                        enabled=payload.oci_enabled,
                        tenancy_ocid=payload.tenancy_ocid,
                        user_ocid=payload.user_ocid,
                        region=payload.region,
                        group_claim=payload.group_claim,
                    ),
                )
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        runner = _get_runner()
        await runner.apply_config(store.load())
        return {"status": "ok"}

    return app
