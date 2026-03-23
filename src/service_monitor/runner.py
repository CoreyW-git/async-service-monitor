from __future__ import annotations

import asyncio
import json
import secrets
import signal
from dataclasses import asdict

import docker
import httpx

from service_monitor.cluster import ClusterCoordinator, PeerState
from service_monitor.checks import (
    CheckResult,
    run_auth_check,
    run_database_check,
    run_dns_check,
    run_generic_check,
    run_http_check,
)
from service_monitor.config import AppConfig, CheckConfig
from service_monitor.notifier import EmailNotifier
from service_monitor.state import MonitorState
from service_monitor.telemetry import TelemetryStore


class MonitorRunner:
    def __init__(self, config: AppConfig, state: MonitorState | None = None) -> None:
        self.config = config
        self.telemetry = TelemetryStore(config)
        self.state = state or MonitorState()
        self.state.result_listeners = list(self.state.result_listeners) + [self._record_result_telemetry]
        self.state.node_listeners = list(self.state.node_listeners) + [self._record_node_telemetry]
        self.stop_event = asyncio.Event()
        self.reload_lock = asyncio.Lock()
        self.notifier = EmailNotifier(config.notifications.email)
        self.cluster = ClusterCoordinator(config, self.notifier, self.state)
        self.tasks: dict[str, asyncio.Task[None]] = {}
        self.peer_task: asyncio.Task[None] | None = None
        self.local_health_task: asyncio.Task[None] | None = None
        self.client: httpx.AsyncClient | None = None
        try:
            self.docker_client = docker.from_env()
        except Exception:
            self.docker_client = None

    async def run(self) -> None:
        async with httpx.AsyncClient(
            headers={"User-Agent": self.config.defaults.user_agent}
        ) as client:
            self.client = client
            await self.telemetry.apply_config(self.config)
            await self.cluster.start()
            await self._sync_check_tasks(client)

            if self.cluster.enabled:
                self.peer_task = asyncio.create_task(
                    self.cluster.poll_peers(client, self.stop_event),
                    name="peer-poller",
                )
            self.local_health_task = asyncio.create_task(
                self._record_local_health_loop(),
                name="local-health",
            )

            self._install_signal_handlers()
            await self.stop_event.wait()
            await self._shutdown_tasks()
            await self.cluster.stop()
            self.client = None

    def stop(self) -> None:
        self.stop_event.set()

    async def apply_config(self, config: AppConfig) -> None:
        async with self.reload_lock:
            previous_enabled = self.config.cluster.enabled
            previous_states = self.cluster.peer_states
            self.config = config
            self.telemetry.config = config.telemetry
            self.notifier.config = config.notifications.email
            if previous_enabled and self.client is not None:
                await self.cluster.stop()
            self.cluster.config = config
            self.cluster.peer_states = {
                peer.node_id: previous_states.get(peer.node_id)
                or PeerState(node_id=peer.node_id, healthy=False)
                for peer in config.cluster.peers
            }
            if self.client is not None:
                if previous_enabled and not config.cluster.enabled:
                    if self.peer_task is not None:
                        self.peer_task.cancel()
                        await asyncio.gather(self.peer_task, return_exceptions=True)
                        self.peer_task = None
                elif previous_enabled and config.cluster.enabled:
                    if self.peer_task is not None:
                        self.peer_task.cancel()
                        await asyncio.gather(self.peer_task, return_exceptions=True)
                    await self.cluster.start()
                    self.peer_task = asyncio.create_task(
                        self.cluster.poll_peers(self.client, self.stop_event),
                        name="peer-poller",
                    )
                elif config.cluster.enabled and not previous_enabled:
                    await self.cluster.start()
                    self.peer_task = asyncio.create_task(
                        self.cluster.poll_peers(self.client, self.stop_event),
                        name="peer-poller",
                    )
                await self.telemetry.apply_config(config)
                await self._restart_check_tasks(self.client)

    def _install_signal_handlers(self) -> None:
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, self.stop)
            except NotImplementedError:
                pass

    async def _sync_check_tasks(self, client: httpx.AsyncClient) -> None:
        active_names = {check.name for check in self.runtime_checks()}
        for name, task in list(self.tasks.items()):
            if name not in active_names:
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
                del self.tasks[name]

        for check in self.runtime_checks():
            if check.name not in self.tasks or self.tasks[check.name].done():
                self.tasks[check.name] = asyncio.create_task(
                    self._run_check_loop(client, check),
                    name=check.name,
                )

    async def _restart_check_tasks(self, client: httpx.AsyncClient) -> None:
        for task in self.tasks.values():
            task.cancel()
        if self.tasks:
            await asyncio.gather(*self.tasks.values(), return_exceptions=True)
        self.tasks = {}
        await self._sync_check_tasks(client)

    async def _shutdown_tasks(self) -> None:
        for task in self.tasks.values():
            task.cancel()
        if self.peer_task is not None:
            self.peer_task.cancel()
        if self.local_health_task is not None:
            self.local_health_task.cancel()
        await asyncio.gather(*self.tasks.values(), return_exceptions=True)
        if self.peer_task is not None:
            await asyncio.gather(self.peer_task, return_exceptions=True)
        if self.local_health_task is not None:
            await asyncio.gather(self.local_health_task, return_exceptions=True)

    async def _run_check_loop(self, client: httpx.AsyncClient, initial_check: CheckConfig) -> None:
        while not self.stop_event.is_set():
            check = self._get_check(initial_check.name)
            if check is None:
                return

            if check.enabled and self.cluster.should_run_check(check.name):
                result = await self._execute_check(client, check)
                await self.state.record_result(result, owner=self.cluster.owner_for_check(check.name))
                self._emit_result(result)

            try:
                await asyncio.wait_for(
                    self.stop_event.wait(),
                    timeout=check.interval_seconds,
                )
            except asyncio.TimeoutError:
                continue

    async def _record_local_health_loop(self) -> None:
        while not self.stop_event.is_set():
            await self.state.record_node_health(self.config.cluster.node_id, True)
            try:
                await asyncio.wait_for(
                    self.stop_event.wait(),
                    timeout=self.config.defaults.peer_poll_interval_seconds,
                )
            except asyncio.TimeoutError:
                continue

    def _get_check(self, name: str) -> CheckConfig | None:
        for check in self.runtime_checks():
            if check.name == name:
                return check
        return None

    def runtime_checks(self) -> list[CheckConfig]:
        checks = list(self.config.checks)
        telemetry_db = self._telemetry_database_check()
        if telemetry_db is not None:
            checks.append(telemetry_db)
        email_service = self._email_service_check()
        if email_service is not None:
            checks.append(email_service)
        return checks

    def _telemetry_database_check(self) -> CheckConfig | None:
        telemetry = self.config.telemetry
        if not telemetry.enabled or not telemetry.host or not telemetry.port:
            return None
        return CheckConfig(
            name="telemetry-database",
            type="database",
            interval_seconds=max(30.0, self.config.defaults.peer_poll_interval_seconds),
            enabled=True,
            timeout_seconds=self.config.defaults.timeout_seconds,
            host=telemetry.host,
            port=telemetry.port,
            database_name=telemetry.database,
            database_engine="mysql",
            auth=(
                None
                if not telemetry.username
                else self._telemetry_auth(telemetry.username, telemetry.password)
            ),
        )

    def _email_service_check(self) -> CheckConfig | None:
        email = self.config.notifications.email
        if not email.enabled or not email.host or not email.port:
            return None
        return CheckConfig(
            name="notification-email-service",
            type="generic",
            interval_seconds=max(30.0, self.config.defaults.peer_poll_interval_seconds),
            enabled=True,
            timeout_seconds=self.config.defaults.timeout_seconds,
            host=email.host,
            port=email.port,
        )

    @staticmethod
    def _telemetry_auth(username: str, password: str | None):
        from service_monitor.config import AuthConfig

        return AuthConfig(type="basic", username=username, password=password)

    async def _execute_check(
        self, client: httpx.AsyncClient, check: CheckConfig
    ) -> CheckResult:
        timeout_seconds = (
            check.timeout_seconds
            if check.timeout_seconds is not None
            else self.config.defaults.timeout_seconds
        )

        if check.type == "dns":
            return await run_dns_check(check)
        if check.type == "http":
            return await run_http_check(client, check, timeout_seconds)
        if check.type == "auth":
            return await run_auth_check(client, check, timeout_seconds)
        if check.type == "generic":
            return await run_generic_check(check, timeout_seconds)
        if check.type == "database":
            return await run_database_check(check, timeout_seconds)

        raise ValueError(f"Unsupported check type: {check.type}")

    def _emit_result(self, result: CheckResult) -> None:
        print(json.dumps(asdict(result), default=str), flush=True)

    async def _record_result_telemetry(self, result: CheckResult, owner: str | None) -> None:
        check = self._get_check(result.name)
        if check is None:
            return
        await self.telemetry.record_check_result(result, owner, check)

    async def _record_node_telemetry(self, node_id: str, healthy: bool, timestamp: float) -> None:
        await self.telemetry.record_node_health(node_id, healthy, timestamp)

    def describe_check(self, check: CheckConfig) -> dict[str, object]:
        latest = self.state._latest_by_check.get(check.name) if hasattr(self.state, "_latest_by_check") else None
        return {
            "name": check.name,
            "type": check.type,
            "generated": check.name in {"telemetry-database", "notification-email-service"},
            "enabled": check.enabled,
            "interval_seconds": check.interval_seconds,
            "timeout_seconds": check.timeout_seconds,
            "url": check.url,
            "host": check.host,
            "port": check.port,
            "database_name": check.database_name,
            "database_engine": check.database_engine,
            "expected_statuses": check.expected_statuses,
            "expect_authenticated_statuses": check.expect_authenticated_statuses,
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
            "status": self._status_from_result(latest, check.enabled),
            "latest_result": latest,
            "content_rules": {
                "contains": check.content.contains if check.content else [],
                "not_contains": check.content.not_contains if check.content else [],
                "regex": check.content.regex if check.content else None,
            },
            "owner": self.cluster.owner_for_check(check.name)
            if self.config.cluster.enabled
            else self.config.cluster.node_id,
        }

    def get_check_detail(self, check_name: str) -> dict[str, object] | None:
        check = self._get_check(check_name)
        if check is None:
            return None
        return self.describe_check(check)

    def peer_details(self) -> list[dict[str, object]]:
        details: list[dict[str, object]] = []
        for peer in self.config.cluster.peers:
            state = self.cluster.peer_states.get(peer.node_id)
            details.append(
                {
                    "node_id": peer.node_id,
                    "base_url": peer.base_url,
                    "enabled": peer.enabled,
                    "container_name": peer.container_name,
                    "healthy": state.healthy if state else False,
                    "last_ok_at": state.last_ok_at if state else None,
                    "last_error": state.last_error if state else None,
                    "recovery": {
                        "enabled": peer.recovery.enabled,
                        "container_name": peer.recovery.container_name,
                    },
                }
            )
        return details

    async def cluster_status(self) -> dict[str, object]:
        peers = []
        for peer in self.config.cluster.peers:
            state = self.cluster.peer_states.get(peer.node_id)
            peers.append(
                {
                    "node_id": peer.node_id,
                    "base_url": peer.base_url,
                    "container_name": peer.container_name,
                    "enabled": peer.enabled,
                    "healthy": state.healthy if state else False,
                    "last_ok_at": state.last_ok_at if state else None,
                    "last_error": state.last_error if state else None,
                    "assigned_checks": [
                        check.name
                        for check in self.runtime_checks()
                        if self.cluster.owner_for_check(check.name) == peer.node_id
                    ]
                    if self.config.cluster.enabled
                    else [],
                }
            )

        return {
            "enabled": self.config.cluster.enabled,
            "node_id": self.config.cluster.node_id,
            "healthy_nodes": self.cluster.healthy_node_ids(),
            "peers": peers,
            "local_assigned_checks": [
                check.name
                for check in self.runtime_checks()
                if not self.config.cluster.enabled
                or self.cluster.owner_for_check(check.name) == self.config.cluster.node_id
            ],
        }

    async def container_status(self) -> dict[str, object]:
        if self.docker_client is None:
            return {"available": False, "containers": []}

        monitor_names = {
            peer.container_name
            for peer in self.config.cluster.peers
            if peer.container_name is not None
        }
        monitor_names.add(self.config.cluster.node_id)
        if self.config.telemetry.provider == "local_mysql" and self.config.telemetry.local_container_name:
            monitor_names.add(self.config.telemetry.local_container_name)
        if (
            self.config.notifications.email.auto_provision_local
            and self.config.notifications.email.local_container_name
        ):
            monitor_names.add(self.config.notifications.email.local_container_name)
        for peer in self.config.cluster.peers:
            monitor_names.add(peer.node_id)

        containers = await asyncio.to_thread(self._list_containers, monitor_names)
        return {"available": True, "containers": containers}

    def _list_containers(self, monitor_names: set[str]) -> list[dict[str, object]]:
        if self.docker_client is None:
            return []
        containers = []
        for container in self.docker_client.containers.list(all=True):
            if monitor_names and container.name not in monitor_names:
                continue
            containers.append(
                {
                    "name": container.name,
                    "status": container.status,
                    "image": container.image.tags[0] if container.image.tags else "unknown",
                }
            )
        return sorted(containers, key=lambda item: str(item["name"]))

    async def create_monitor_container(self, payload: dict[str, object]) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to the monitor service")
        return await asyncio.to_thread(self._create_monitor_container_sync, payload)

    async def provision_local_mysql(self, telemetry_config) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to provision local MySQL")
        return await asyncio.to_thread(self._provision_local_mysql_sync, telemetry_config)

    async def provision_local_email_service(self, email_config) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to provision a local email service")
        return await asyncio.to_thread(self._provision_local_email_service_sync, email_config)

    def _create_monitor_container_sync(self, payload: dict[str, object]) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to the monitor service")

        container_name = str(payload["container_name"])
        image = str(payload["image"])
        node_id = str(payload["node_id"])
        host_port = payload.get("host_port")
        network = payload.get("network")
        config_path = payload.get("config_path")

        environment = {"MONITOR_NODE_ID": node_id}
        command = [
            "python",
            "-m",
            "service_monitor",
            "--config",
            "config.yaml",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
        ]

        kwargs: dict[str, object] = {
            "name": container_name,
            "detach": True,
            "environment": environment,
            "command": command,
        }
        if host_port:
            kwargs["ports"] = {"8000/tcp": int(host_port)}
        if network:
            kwargs["network"] = network
        if config_path:
            kwargs["volumes"] = {
                str(config_path): {"bind": "/app/config.yaml", "mode": "ro"}
            }

        container = self.docker_client.containers.run(image, **kwargs)
        container.reload()
        return {
            "status": "ok",
            "container": container.name,
            "state": container.status,
        }

    def _provision_local_mysql_sync(self, telemetry_config) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to provision local MySQL")

        container_name = telemetry_config.local_container_name or "async-service-monitor-mysql"
        port = int(telemetry_config.port or 3306)
        database = telemetry_config.database or "async_service_monitor"
        username = telemetry_config.username or "asm_telemetry"
        password = telemetry_config.password or secrets.token_urlsafe(18)

        try:
            container = self.docker_client.containers.get(container_name)
            if container.status != "running":
                container.start()
            container.reload()
        except docker.errors.NotFound:
            container = self.docker_client.containers.run(
                "mysql:8.4",
                name=container_name,
                detach=True,
                environment={
                    "MYSQL_DATABASE": database,
                    "MYSQL_USER": username,
                    "MYSQL_PASSWORD": password,
                    "MYSQL_ROOT_PASSWORD": password,
                },
                ports={"3306/tcp": port},
            )
            container.reload()

        host_port = port
        ports = container.attrs.get("NetworkSettings", {}).get("Ports", {}) if hasattr(container, "attrs") else {}
        bindings = ports.get("3306/tcp") or []
        if bindings and bindings[0].get("HostPort"):
            host_port = int(bindings[0]["HostPort"])

        return {
            "container_name": container.name,
            "host": "127.0.0.1",
            "port": host_port,
            "database": database,
            "username": username,
            "password": password,
        }

    def _provision_local_email_service_sync(self, email_config) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to provision a local email service")

        container_name = email_config.local_container_name or "async-service-monitor-mailpit"
        smtp_port = int(email_config.port or 1025)
        ui_port = int(email_config.local_ui_port or 8025)

        try:
            container = self.docker_client.containers.get(container_name)
            if container.status != "running":
                container.start()
            container.reload()
        except docker.errors.NotFound:
            container = self.docker_client.containers.run(
                "axllent/mailpit:latest",
                name=container_name,
                detach=True,
                ports={"1025/tcp": smtp_port, "8025/tcp": ui_port},
            )
            container.reload()

        ports = (
            container.attrs.get("NetworkSettings", {}).get("Ports", {})
            if hasattr(container, "attrs")
            else {}
        )
        smtp_bindings = ports.get("1025/tcp") or []
        ui_bindings = ports.get("8025/tcp") or []
        host_smtp_port = smtp_port
        host_ui_port = ui_port
        if smtp_bindings and smtp_bindings[0].get("HostPort"):
            host_smtp_port = int(smtp_bindings[0]["HostPort"])
        if ui_bindings and ui_bindings[0].get("HostPort"):
            host_ui_port = int(ui_bindings[0]["HostPort"])

        return {
            "container_name": container.name,
            "host": "127.0.0.1",
            "port": host_smtp_port,
            "ui_port": host_ui_port,
        }

    async def manage_container(self, container_name: str, action: str) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to the monitor service")
        if action not in {"start", "stop", "restart"}:
            raise ValueError("Unsupported action. Use start, stop, or restart.")
        result = await asyncio.to_thread(self._manage_container_sync, container_name, action)
        return result

    def _manage_container_sync(self, container_name: str, action: str) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to the monitor service")
        container = self.docker_client.containers.get(container_name)
        if action == "start":
            container.start()
        elif action == "stop":
            container.stop()
        else:
            container.restart()
        container.reload()
        return {"status": "ok", "container": container.name, "action": action, "state": container.status}

    @staticmethod
    def _status_from_result(result: dict[str, object] | None, enabled: bool) -> str:
        if not enabled:
            return "disabled"
        if result is None:
            return "unknown"
        return "healthy" if bool(result.get("success")) else "unhealthy"
