from __future__ import annotations

import asyncio
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from typing import Literal

import docker
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from service_monitor.auth import AuthManager
from service_monitor.config import (
    AppConfig,
    AuthConfig,
    CheckConfig,
    ContentConfig,
    DockerRecoveryConfig,
    OCIAuthConfig,
    PeerConfig,
    PortalAuthConfig,
    PortalUserConfig,
    TelemetryConfig,
)
from service_monitor.config_store import ConfigStore
from service_monitor.runner import MonitorRunner
from service_monitor.state import MonitorState


class ContentPayload(BaseModel):
    contains: list[str] = Field(default_factory=list)
    not_contains: list[str] = Field(default_factory=list)
    regex: str | None = None


class AuthPayload(BaseModel):
    type: Literal["basic", "bearer", "header"]
    username: str | None = None
    password: str | None = None
    token: str | None = None
    header_name: str | None = None
    header_value: str | None = None


class CheckPayload(BaseModel):
    name: str
    type: Literal["http", "dns", "auth", "database", "generic"]
    enabled: bool = True
    interval_seconds: float
    timeout_seconds: float | None = None
    url: str | None = None
    host: str | None = None
    port: int | None = None
    database_name: str | None = None
    database_engine: Literal["mysql"] = "mysql"
    expected_statuses: list[int] = Field(default_factory=lambda: [200])
    expect_authenticated_statuses: list[int] = Field(default_factory=lambda: [200])
    auth: AuthPayload | None = None
    content: ContentPayload | None = None


class CheckStatePayload(BaseModel):
    enabled: bool


class PeerRecoveryPayload(BaseModel):
    enabled: bool = False
    container_name: str | None = None


class PeerPayload(BaseModel):
    node_id: str
    base_url: str
    enabled: bool = True
    container_name: str | None = None
    recovery: PeerRecoveryPayload = Field(default_factory=PeerRecoveryPayload)


class ContainerCreatePayload(BaseModel):
    node_id: str
    container_name: str
    image: str
    base_url: str
    network: str | None = None
    host_port: int | None = None
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


class ResetPasswordPayload(BaseModel):
    username: str
    password: str


class ProfilePayload(BaseModel):
    first_name: str = ""
    last_name: str = ""
    password: str | None = None


class TelemetryPayload(BaseModel):
    enabled: bool = False
    provider: Literal["local_mysql", "oci_mysql"] = "local_mysql"
    host: str | None = None
    port: int = 3306
    database: str | None = None
    username: str | None = None
    password: str | None = None
    retention_hours: int = 2
    use_ssl: bool = False
    auto_provision_local: bool = False
    local_container_name: str = "async-service-monitor-mysql"


class PortalSettingsPayload(BaseModel):
    enabled: bool = True
    provider: Literal["basic", "oci"] = "basic"
    realm: str = "Async Service Monitor"
    oci_enabled: bool = False
    tenancy_ocid: str | None = None
    user_ocid: str | None = None
    region: str | None = None
    group_claim: str | None = None


def _auth_from_payload(payload: AuthPayload | None) -> AuthConfig | None:
    if payload is None:
        return None
    return AuthConfig(**payload.model_dump())


def _content_from_payload(payload: ContentPayload | None) -> ContentConfig | None:
    if payload is None:
        return None
    return ContentConfig(**payload.model_dump())


def _check_from_payload(payload: CheckPayload) -> CheckConfig:
    return CheckConfig(
        name=payload.name,
        type=payload.type,  # type: ignore[arg-type]
        enabled=payload.enabled,
        interval_seconds=payload.interval_seconds,
        timeout_seconds=payload.timeout_seconds,
        url=payload.url,
        host=payload.host,
        port=payload.port,
        database_name=payload.database_name,
        database_engine=payload.database_engine,
        expected_statuses=payload.expected_statuses,
        expect_authenticated_statuses=payload.expect_authenticated_statuses,
        auth=_auth_from_payload(payload.auth),
        content=_content_from_payload(payload.content),
    )


def _peer_from_payload(payload: PeerPayload) -> PeerConfig:
    return PeerConfig(
        node_id=payload.node_id,
        base_url=payload.base_url.rstrip("/"),
        enabled=payload.enabled,
        container_name=payload.container_name,
        recovery=DockerRecoveryConfig(
            enabled=payload.recovery.enabled,
            container_name=payload.recovery.container_name,
        ),
    )


def _frontend_html() -> str:
    return (Path(__file__).parent / "web" / "index.html").read_text(encoding="utf-8")


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
    runtime: dict[str, Any] = {
        "runner": None,
        "runner_task": None,
        "state": state,
        "store": store,
        "config_path": str(config_path),
    }

    def _get_runner() -> MonitorRunner:
        runner = runtime.get("runner")
        if runner is None:
            raise HTTPException(status_code=503, detail="Monitor runtime is still starting")
        return runner

    def _get_runtime_config() -> AppConfig:
        return store.load()

    auth_manager = AuthManager(_get_runtime_config, store)
    require_read_only = auth_manager.require_role("read_only")
    require_read_write = auth_manager.require_role("read_write")
    require_admin = auth_manager.require_role("admin")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        config = store.load()
        runner = MonitorRunner(config, state=state)
        task = asyncio.create_task(runner.run(), name="monitor-runner")
        runtime["runner"] = runner
        runtime["runner_task"] = task
        yield
        runner.stop()
        await asyncio.gather(task, return_exceptions=True)

    app = FastAPI(title="Async Service Monitor Admin", lifespan=lifespan)

    @app.get("/", response_class=HTMLResponse)
    async def index() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/monitors", response_class=HTMLResponse)
    async def monitors_page() -> str:
        return HTMLResponse(_frontend_html(), headers=_no_cache_headers())

    @app.get("/monitors/new", response_class=HTMLResponse)
    async def monitor_create_page() -> str:
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

    @app.get("/api/session")
    async def session(session_id: str | None = Cookie(default=None, alias="service_monitor_session")) -> dict[str, object]:
        return auth_manager.authenticate_optional(session_id)

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
                "provider": current_user["provider"],
                "authenticated": True,
            },
        }

    @app.get("/api/overview")
    async def overview(current_user: dict[str, str] = Depends(require_read_only)) -> dict[str, object]:
        runner = _get_runner()
        config: AppConfig = runner.config
        summary = await state.summary()
        return {
            "config_path": runtime["config_path"],
            "node_id": config.cluster.node_id,
            "cluster_enabled": config.cluster.enabled,
            "total_checks": len(runner.runtime_checks()),
            "summary": summary,
        }

    @app.get("/api/checks")
    async def checks(current_user: dict[str, str] = Depends(require_read_only)) -> list[dict[str, object]]:
        runner = _get_runner()
        return [runner.describe_check(check) for check in runner.runtime_checks()]

    @app.get("/api/checks/{check_name}")
    async def check_detail(
        check_name: str, current_user: dict[str, str] = Depends(require_read_only)
    ) -> dict[str, object]:
        runner = _get_runner()
        check = runner.get_check_detail(check_name)
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
        if check_name == "telemetry-database":
            raise HTTPException(status_code=400, detail="Telemetry database monitor is managed by service configuration")
        check = _check_from_payload(payload)
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
        if check_name == "telemetry-database":
            raise HTTPException(status_code=400, detail="Telemetry database monitor is managed by service configuration")
        try:
            store.set_check_enabled(check_name, payload.enabled)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

        runner = _get_runner()
        await runner.apply_config(store.load())
        return {"status": "ok"}

    @app.delete("/api/checks/{check_name}")
    async def delete_check(
        check_name: str, current_user: dict[str, str] = Depends(require_read_write)
    ) -> dict[str, object]:
        if check_name == "telemetry-database":
            raise HTTPException(status_code=400, detail="Telemetry database monitor is managed by service configuration")
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
        return await state.recent_results(limit=limit)

    @app.get("/api/metrics/checks")
    async def check_metrics(
        current_user: dict[str, str] = Depends(require_read_only),
    ) -> dict[str, list[dict[str, object]]]:
        return await state.check_history()

    @app.get("/api/metrics/nodes")
    async def node_metrics(
        current_user: dict[str, str] = Depends(require_read_only),
    ) -> dict[str, list[dict[str, object]]]:
        return await state.node_history()

    @app.get("/api/cluster")
    async def cluster(current_user: dict[str, str] = Depends(require_read_only)) -> dict[str, object]:
        runner = _get_runner()
        return await runner.cluster_status()

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
        try:
            request_payload = payload.model_dump()
            request_payload["config_path"] = runtime["config_path"]
            result = await runner.create_monitor_container(request_payload)
            store.add_peer(
                PeerConfig(
                    node_id=payload.node_id,
                    base_url=payload.base_url.rstrip("/"),
                    enabled=payload.enabled,
                    container_name=payload.container_name,
                    recovery=DockerRecoveryConfig(
                        enabled=payload.recovery_enabled,
                        container_name=payload.container_name,
                    ),
                )
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except docker.errors.DockerException as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        await runner.apply_config(store.load())
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
                "last_login_at": user.last_login_at,
            }
            for user in config.portal.users
        ]

    @app.post("/api/users")
    async def add_user(
        payload: PortalUserPayload, current_user: dict[str, str] = Depends(require_admin)
    ) -> dict[str, object]:
        try:
            store.add_user(PortalUserConfig(**payload.model_dump()))
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
            store.update_user(username, PortalUserConfig(**payload.model_dump()))
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
            "provider": telemetry.provider,
            "host": telemetry.host,
            "port": telemetry.port,
            "database": telemetry.database,
            "username": telemetry.username,
            "password": telemetry.password,
            "retention_hours": telemetry.retention_hours,
            "use_ssl": telemetry.use_ssl,
            "auto_provision_local": telemetry.auto_provision_local,
            "local_container_name": telemetry.local_container_name,
        }

    @app.put("/api/settings/telemetry")
    async def update_telemetry_settings(
        payload: TelemetryPayload,
        current_user: dict[str, object] = Depends(require_admin),
    ) -> dict[str, object]:
        telemetry = TelemetryConfig(**payload.model_dump())
        message = "Telemetry settings saved."
        runner = _get_runner()
        if telemetry.enabled and telemetry.provider == "local_mysql" and telemetry.auto_provision_local:
            if not telemetry.database:
                telemetry.database = "async_service_monitor"
            if not telemetry.username:
                telemetry.username = "asm_telemetry"
            if not telemetry.password:
                telemetry.password = secrets.token_urlsafe(18)
            if not telemetry.host:
                telemetry.host = "127.0.0.1"
            provisioned = await runner.provision_local_mysql(telemetry)
            telemetry.host = str(provisioned["host"])
            telemetry.port = int(provisioned["port"])
            telemetry.local_container_name = str(provisioned["container_name"])
            message = f"Telemetry settings saved and local MySQL is available in container '{telemetry.local_container_name}'."
        try:
            store.update_telemetry(telemetry)
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
