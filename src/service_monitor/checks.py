from __future__ import annotations

import asyncio
import re
import socket
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx

from service_monitor.config import AuthConfig, CheckConfig


@dataclass(slots=True)
class CheckResult:
    name: str
    check_type: str
    success: bool
    message: str
    duration_ms: float
    details: dict[str, object] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)


def _build_request_kwargs(auth: AuthConfig | None) -> dict[str, object]:
    kwargs: dict[str, object] = {}
    headers: dict[str, str] = {}

    if not auth:
        return kwargs

    if auth.type == "basic":
        kwargs["auth"] = (auth.username or "", auth.password or "")
    elif auth.type == "bearer":
        headers["Authorization"] = f"Bearer {auth.token or ''}"
    elif auth.type == "header":
        if auth.header_name and auth.header_value:
            headers[auth.header_name] = auth.header_value

    if headers:
        kwargs["headers"] = headers

    return kwargs


def _validate_content(body: str, check: CheckConfig) -> tuple[bool, str]:
    content = check.content
    if not content:
        return True, "no content rules configured"

    for required in content.contains:
        if required not in body:
            return False, f"missing expected content: {required}"

    for forbidden in content.not_contains:
        if forbidden in body:
            return False, f"forbidden content present: {forbidden}"

    if content.regex and not re.search(content.regex, body, re.MULTILINE):
        return False, f"regex did not match: {content.regex}"

    return True, "content validation passed"


def _resolved_url(check: CheckConfig) -> str:
    if not check.url:
        raise ValueError(f"Check '{check.name}' requires a URL")
    if check.port is None:
        return check.url
    parsed = urlparse(check.url)
    hostname = parsed.hostname or ""
    if not hostname:
        return check.url
    auth = ""
    if parsed.username:
        auth = parsed.username
        if parsed.password:
            auth = f"{auth}:{parsed.password}"
        auth = f"{auth}@"
    netloc = f"{auth}{hostname}:{check.port}"
    return urlunparse(parsed._replace(netloc=netloc))


async def _tcp_connect(host: str, port: int, timeout_seconds: float) -> None:
    stream_reader, stream_writer = await asyncio.wait_for(
        asyncio.open_connection(host, port),
        timeout=timeout_seconds,
    )
    stream_writer.close()
    await stream_writer.wait_closed()


async def run_dns_check(check: CheckConfig) -> CheckResult:
    started = time.perf_counter()
    loop = asyncio.get_running_loop()
    try:
        addr_info = await loop.getaddrinfo(
            check.host,
            None,
            family=socket.AF_UNSPEC,
            type=socket.SOCK_STREAM,
        )
        addresses = sorted({item[4][0] for item in addr_info})
        duration_ms = (time.perf_counter() - started) * 1000
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=True,
            message=f"resolved {check.host}",
            duration_ms=duration_ms,
            details={"addresses": addresses},
        )
    except Exception as exc:
        duration_ms = (time.perf_counter() - started) * 1000
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=False,
            message=f"dns resolution failed: {exc}",
            duration_ms=duration_ms,
        )


async def run_http_check(
    client: httpx.AsyncClient, check: CheckConfig, timeout_seconds: float
) -> CheckResult:
    started = time.perf_counter()
    try:
        response = await client.get(
            _resolved_url(check),
            timeout=timeout_seconds,
            follow_redirects=True,
            **_build_request_kwargs(check.auth),
        )

        if response.status_code not in check.expected_statuses:
            duration_ms = (time.perf_counter() - started) * 1000
            return CheckResult(
                name=check.name,
                check_type=check.type,
                success=False,
                message=f"unexpected status: {response.status_code}",
                duration_ms=duration_ms,
                details={"status_code": response.status_code},
            )

        content_ok, content_message = _validate_content(response.text, check)
        duration_ms = (time.perf_counter() - started) * 1000
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=content_ok,
            message=content_message if content_ok else f"content validation failed: {content_message}",
            duration_ms=duration_ms,
            details={"status_code": response.status_code},
        )
    except Exception as exc:
        duration_ms = (time.perf_counter() - started) * 1000
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=False,
            message=f"http request failed: {exc}",
            duration_ms=duration_ms,
        )


async def run_auth_check(
    client: httpx.AsyncClient, check: CheckConfig, timeout_seconds: float
) -> CheckResult:
    started = time.perf_counter()
    details: dict[str, object] = {}

    try:
        authenticated_response = await client.get(
            _resolved_url(check),
            timeout=timeout_seconds,
            follow_redirects=True,
            **_build_request_kwargs(check.auth),
        )
        details["authenticated_status"] = authenticated_response.status_code

        if authenticated_response.status_code not in check.expect_authenticated_statuses:
            duration_ms = (time.perf_counter() - started) * 1000
            return CheckResult(
                name=check.name,
                check_type=check.type,
                success=False,
                message=(
                    "authenticated request returned unexpected status: "
                    f"{authenticated_response.status_code}"
                ),
                duration_ms=duration_ms,
                details=details,
            )

        if check.unauthenticated_probe.enabled:
            unauthenticated_response = await client.get(
                _resolved_url(check),
                timeout=timeout_seconds,
                follow_redirects=True,
            )
            details["unauthenticated_status"] = unauthenticated_response.status_code

            if unauthenticated_response.status_code not in check.unauthenticated_probe.expect_statuses:
                duration_ms = (time.perf_counter() - started) * 1000
                return CheckResult(
                    name=check.name,
                    check_type=check.type,
                    success=False,
                    message=(
                        "unauthenticated probe returned unexpected status: "
                        f"{unauthenticated_response.status_code}"
                    ),
                    duration_ms=duration_ms,
                    details=details,
                )

        duration_ms = (time.perf_counter() - started) * 1000
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=True,
            message="authentication validation passed",
            duration_ms=duration_ms,
            details=details,
        )
    except Exception as exc:
        duration_ms = (time.perf_counter() - started) * 1000
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=False,
            message=f"authentication check failed: {exc}",
            duration_ms=duration_ms,
            details=details,
        )


async def run_generic_check(check: CheckConfig, timeout_seconds: float) -> CheckResult:
    started = time.perf_counter()
    try:
        await _tcp_connect(check.host or "", int(check.port or 0), timeout_seconds)
        duration_ms = (time.perf_counter() - started) * 1000
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=True,
            message=f"connected to {check.host}:{check.port}",
            duration_ms=duration_ms,
            details={"host": check.host, "port": check.port},
        )
    except Exception as exc:
        duration_ms = (time.perf_counter() - started) * 1000
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=False,
            message=f"generic connectivity failed: {exc}",
            duration_ms=duration_ms,
            details={"host": check.host, "port": check.port},
        )


def _mysql_connect_sync(check: CheckConfig, timeout_seconds: float) -> None:
    import pymysql

    connection = pymysql.connect(
        host=check.host,
        port=int(check.port or 3306),
        user=check.auth.username if check.auth else None,
        password=check.auth.password if check.auth else None,
        database=check.database_name,
        connect_timeout=int(timeout_seconds),
        read_timeout=int(timeout_seconds),
        write_timeout=int(timeout_seconds),
        ssl={} if check.port == 33060 else None,
    )
    connection.close()


def _postgres_connect_sync(check: CheckConfig, timeout_seconds: float) -> None:
    import psycopg

    kwargs: dict[str, object] = {
        "host": check.host,
        "port": int(check.port or 5432),
        "user": check.auth.username if check.auth else None,
        "password": check.auth.password if check.auth else None,
        "dbname": check.database_name,
        "connect_timeout": max(1, int(timeout_seconds)),
    }
    connection = psycopg.connect(**kwargs)
    connection.close()


async def run_database_check(check: CheckConfig, timeout_seconds: float) -> CheckResult:
    started = time.perf_counter()
    try:
        if check.database_engine == "mysql" and check.auth and check.auth.username:
            await asyncio.to_thread(_mysql_connect_sync, check, timeout_seconds)
            message = f"database login passed for {check.host}:{check.port}"
        elif check.database_engine == "postgresql" and check.auth and check.auth.username:
            await asyncio.to_thread(_postgres_connect_sync, check, timeout_seconds)
            message = f"database login passed for {check.host}:{check.port}"
        else:
            await _tcp_connect(check.host or "", int(check.port or 0), timeout_seconds)
            message = f"database port reachable on {check.host}:{check.port}"
        duration_ms = (time.perf_counter() - started) * 1000
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=True,
            message=message,
            duration_ms=duration_ms,
            details={
                "host": check.host,
                "port": check.port,
                "database_name": check.database_name,
                "database_engine": check.database_engine,
            },
        )
    except Exception as exc:
        duration_ms = (time.perf_counter() - started) * 1000
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=False,
            message=f"database check failed: {exc}",
            duration_ms=duration_ms,
            details={
                "host": check.host,
                "port": check.port,
                "database_name": check.database_name,
                "database_engine": check.database_engine,
            },
        )


async def run_browser_check(check: CheckConfig, timeout_seconds: float) -> CheckResult:
    started = time.perf_counter()
    browser_config = check.browser
    if browser_config is None:
        duration_ms = (time.perf_counter() - started) * 1000
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=False,
            message="browser configuration is missing",
            duration_ms=duration_ms,
        )

    try:
        from playwright.async_api import TimeoutError as PlaywrightTimeoutError
        from playwright.async_api import async_playwright
    except ImportError:
        duration_ms = (time.perf_counter() - started) * 1000
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=False,
            message=(
                "browser health checks require Playwright. Install the playwright package and Chromium browser runtime."
            ),
            duration_ms=duration_ms,
        )

    step_results: list[dict[str, Any]] = []
    network_entries: dict[str, dict[str, Any]] = {}
    network_log: list[dict[str, Any]] = []
    console_messages: list[dict[str, Any]] = []
    page_errors: list[str] = []

    async def record_step(name: str, action: str, coro):
        step_started = time.perf_counter()
        try:
            value = await coro
            step_results.append(
                {
                    "name": name,
                    "action": action,
                    "success": True,
                    "duration_ms": round((time.perf_counter() - step_started) * 1000, 2),
                    "message": "ok",
                }
            )
            return value
        except Exception as exc:
            step_results.append(
                {
                    "name": name,
                    "action": action,
                    "success": False,
                    "duration_ms": round((time.perf_counter() - step_started) * 1000, 2),
                    "message": str(exc),
                }
            )
            raise

    async def _assert_text(page, selector: str, expected: str) -> None:
        text = await page.locator(selector).inner_text(timeout=int(timeout_seconds * 1000))
        if expected not in text:
            raise ValueError(f"expected text '{expected}' was not found in {selector}")

    async def _assert_title_contains(page, expected: str) -> None:
        title = await page.title()
        if expected not in title:
            raise ValueError(f"title '{title}' does not contain '{expected}'")

    async def _assert_url_contains(page, expected: str) -> None:
        current = page.url or ""
        if expected not in current:
            raise ValueError(f"url '{current}' does not contain '{expected}'")

    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            context = await browser.new_context(
                viewport={
                    "width": browser_config.viewport_width,
                    "height": browser_config.viewport_height,
                }
            )
            page = await context.new_page()

            page.on(
                "console",
                lambda message: console_messages.append(
                    {
                        "type": message.type,
                        "text": message.text,
                    }
                ),
            )
            page.on("pageerror", lambda error: page_errors.append(str(error)))

            def on_request(request) -> None:
                request_id = str(id(request))
                network_entries[request_id] = {
                    "method": request.method,
                    "url": request.url,
                    "resource_type": request.resource_type,
                    "request_started_at": time.perf_counter(),
                    "status": None,
                    "ok": None,
                    "failure": None,
                    "duration_ms": None,
                }

            def on_response(response) -> None:
                request_id = str(id(response.request))
                entry = network_entries.get(request_id)
                if entry is None:
                    return
                entry["status"] = response.status
                entry["ok"] = response.ok
                entry["duration_ms"] = round(
                    (time.perf_counter() - float(entry["request_started_at"])) * 1000,
                    2,
                )
                network_log.append(
                    {
                        "method": entry["method"],
                        "url": entry["url"],
                        "resource_type": entry["resource_type"],
                        "status": entry["status"],
                        "ok": entry["ok"],
                        "failure": None,
                        "duration_ms": entry["duration_ms"],
                    }
                )

            def on_request_failed(request) -> None:
                request_id = str(id(request))
                entry = network_entries.get(request_id)
                if entry is None:
                    return
                failure = request.failure
                if isinstance(failure, str):
                    failure_text = failure
                elif failure is None:
                    failure_text = "request failed"
                else:
                    failure_text = getattr(failure, "error_text", None) or str(failure)
                entry["failure"] = failure_text
                entry["ok"] = False
                entry["duration_ms"] = round(
                    (time.perf_counter() - float(entry["request_started_at"])) * 1000,
                    2,
                )
                network_log.append(
                    {
                        "method": entry["method"],
                        "url": entry["url"],
                        "resource_type": entry["resource_type"],
                        "status": None,
                        "ok": False,
                        "failure": failure_text,
                        "duration_ms": entry["duration_ms"],
                    }
                )

            page.on("request", on_request)
            page.on("response", on_response)
            page.on("requestfailed", on_request_failed)

            await record_step(
                "Navigate",
                "navigate",
                page.goto(
                    _resolved_url(check),
                    wait_until=browser_config.wait_until,
                    timeout=int(timeout_seconds * 1000),
                ),
            )

            if browser_config.expected_title_contains:
                await record_step(
                    "Validate title",
                    "assert_title_contains",
                    _assert_title_contains(page, browser_config.expected_title_contains),
                )

            for selector in browser_config.required_selectors:
                await record_step(
                    f"Wait for {selector}",
                    "wait_for_selector",
                    page.wait_for_selector(selector, timeout=int(timeout_seconds * 1000)),
                )

            for step in browser_config.steps:
                step_timeout_ms = int((step.timeout_seconds or timeout_seconds) * 1000)
                if step.action == "navigate":
                    await record_step(
                        step.name,
                        step.action,
                        page.goto(
                            step.value or _resolved_url(check),
                            wait_until=browser_config.wait_until,
                            timeout=step_timeout_ms,
                        ),
                    )
                elif step.action == "wait_for_selector":
                    await record_step(
                        step.name,
                        step.action,
                        page.wait_for_selector(step.selector or "", timeout=step_timeout_ms),
                    )
                elif step.action == "click":
                    await record_step(
                        step.name,
                        step.action,
                        page.locator(step.selector or "").click(timeout=step_timeout_ms),
                    )
                elif step.action == "fill":
                    await record_step(
                        step.name,
                        step.action,
                        page.locator(step.selector or "").fill(step.value or "", timeout=step_timeout_ms),
                    )
                elif step.action == "press":
                    await record_step(
                        step.name,
                        step.action,
                        page.locator(step.selector or "body").press(step.value or "", timeout=step_timeout_ms),
                    )
                elif step.action == "assert_text":
                    await record_step(
                        step.name,
                        step.action,
                        _assert_text(page, step.selector or "", step.value or ""),
                    )
                elif step.action == "assert_url_contains":
                    await record_step(
                        step.name,
                        step.action,
                        _assert_url_contains(page, step.value or ""),
                    )
                elif step.action == "wait_for_timeout":
                    await record_step(
                        step.name,
                        step.action,
                        page.wait_for_timeout(float(step.value or 0)),
                    )

            perf = await page.evaluate(
                """
                () => {
                  const nav = performance.getEntriesByType('navigation')[0];
                  const resources = performance.getEntriesByType('resource') || [];
                  return {
                    title: document.title,
                    url: window.location.href,
                    domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : null,
                    loadMs: nav ? nav.loadEventEnd : null,
                    transferSize: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
                    encodedBodySize: resources.reduce((sum, entry) => sum + (entry.encodedBodySize || 0), 0),
                    resourceCount: resources.length,
                  };
                }
                """
            )
            await context.close()
            await browser.close()

        successful_steps = sum(1 for step in step_results if step.get("success"))
        failed_scripts = [
            entry
            for entry in network_log
            if entry.get("resource_type") == "script" and (entry.get("failure") or entry.get("ok") is False)
        ]
        duration_ms = (time.perf_counter() - started) * 1000
        success = not page_errors and not failed_scripts and all(step.get("success") for step in step_results)
        message = (
            f"browser journey passed with {successful_steps} successful steps"
            if success
            else "browser journey found one or more step, script, or page failures"
        )
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=success,
            message=message,
            duration_ms=duration_ms,
            details={
                "title": perf.get("title"),
                "final_url": perf.get("url"),
                "performance": perf,
                "steps": step_results,
                "network": sorted(
                    network_log,
                    key=lambda item: (item.get("duration_ms") is None, -(item.get("duration_ms") or 0)),
                ),
                "console": console_messages[-50:],
                "page_errors": page_errors[-20:],
                "script_failures": failed_scripts,
            },
        )
    except PlaywrightTimeoutError as exc:
        duration_ms = (time.perf_counter() - started) * 1000
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=False,
            message=f"browser journey timed out: {exc}",
            duration_ms=duration_ms,
            details={"steps": step_results, "network": network_log, "console": console_messages, "page_errors": page_errors},
        )
    except Exception as exc:
        duration_ms = (time.perf_counter() - started) * 1000
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=False,
            message=f"browser monitor failed: {exc}",
            duration_ms=duration_ms,
            details={"steps": step_results, "network": network_log, "console": console_messages, "page_errors": page_errors},
        )
