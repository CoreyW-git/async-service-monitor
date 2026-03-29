from __future__ import annotations

import asyncio
import json
import os
import secrets
import signal
from dataclasses import asdict
from pathlib import Path
from urllib.parse import urlparse

import docker
import httpx

from service_monitor.cluster import ClusterCoordinator, PeerState
from service_monitor.checks import (
    CheckResult,
    run_auth_check,
    run_browser_check,
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
        self.reap_tasks: set[asyncio.Task[None]] = set()
        self.client: httpx.AsyncClient | None = None
        self.monitor_scope = os.getenv("MONITOR_SCOPE", "full").strip().lower() or "full"
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
        old_tasks = list(self.tasks.values())
        for task in old_tasks:
            task.cancel()
        self.tasks = {}
        if old_tasks:
            self._reap_cancelled_tasks(old_tasks)
        await self._sync_check_tasks(client)

    async def _await_cancelled_tasks(self, tasks: list[asyncio.Task[None]]) -> None:
        await asyncio.gather(*tasks, return_exceptions=True)

    def _reap_cancelled_tasks(self, tasks: list[asyncio.Task[None]]) -> None:
        reap_task = asyncio.create_task(self._await_cancelled_tasks(tasks), name="task-reaper")
        self.reap_tasks.add(reap_task)
        reap_task.add_done_callback(self.reap_tasks.discard)

    async def _shutdown_tasks(self) -> None:
        for task in self.tasks.values():
            task.cancel()
        if self.peer_task is not None:
            self.peer_task.cancel()
        if self.local_health_task is not None:
            self.local_health_task.cancel()
        await asyncio.gather(*self.tasks.values(), return_exceptions=True)
        if self.reap_tasks:
            await asyncio.gather(*self.reap_tasks, return_exceptions=True)
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
                result.check_id = check.id
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
        if self.monitor_scope == "peer_only":
            return []
        checks = list(self.config.checks)
        telemetry_db = self._telemetry_timeseries_check()
        if telemetry_db is not None:
            checks.append(telemetry_db)
        telemetry_object = self._telemetry_object_storage_check()
        if telemetry_object is not None:
            checks.append(telemetry_object)
        email_service = self._email_service_check()
        if email_service is not None:
            checks.append(email_service)
        return checks

    def _telemetry_timeseries_check(self) -> CheckConfig | None:
        telemetry = self.config.telemetry
        if (
            not telemetry.enabled
            or not telemetry.timeseries_host
            or not telemetry.timeseries_port
        ):
            return None
        return CheckConfig(
            name="telemetry-timeseries",
            type="database",
            interval_seconds=max(30.0, self.config.defaults.peer_poll_interval_seconds),
            enabled=True,
            timeout_seconds=self.config.defaults.timeout_seconds,
            host=telemetry.timeseries_host,
            port=telemetry.timeseries_port,
            database_name=telemetry.timeseries_database,
            database_engine="postgresql",
            auth=(
                None
                if not telemetry.timeseries_username
                else self._telemetry_auth(
                    telemetry.timeseries_username,
                    telemetry.timeseries_password,
                )
            ),
        )

    def _telemetry_object_storage_check(self) -> CheckConfig | None:
        telemetry = self.config.telemetry
        if not telemetry.enabled or not telemetry.object_endpoint:
            return None
        parsed = urlparse(telemetry.object_endpoint)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            health_url = telemetry.object_endpoint.rstrip("/")
            if telemetry.object_provider == "local_minio":
                health_url = f"{health_url}/minio/health/live"
            return CheckConfig(
                name="telemetry-object-storage",
                type="http",
                interval_seconds=max(30.0, self.config.defaults.peer_poll_interval_seconds),
                enabled=True,
                timeout_seconds=self.config.defaults.timeout_seconds,
                url=health_url,
                expected_statuses=[200, 204, 403],
            )
        host = parsed.hostname or parsed.path or telemetry.object_endpoint
        port = parsed.port or (443 if telemetry.object_use_ssl else 80)
        return CheckConfig(
            name="telemetry-object-storage",
            type="generic",
            interval_seconds=max(30.0, self.config.defaults.peer_poll_interval_seconds),
            enabled=True,
            timeout_seconds=self.config.defaults.timeout_seconds,
            host=host,
            port=port,
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
        if check.type in {"http", "api"}:
            return await run_http_check(client, check, timeout_seconds)
        if check.type == "auth":
            return await run_auth_check(client, check, timeout_seconds)
        if check.type == "generic":
            return await run_generic_check(check, timeout_seconds)
        if check.type == "database":
            return await run_database_check(check, timeout_seconds)
        if check.type == "browser":
            return await run_browser_check(check, timeout_seconds)

        raise ValueError(f"Unsupported check type: {check.type}")

    async def execute_check_preview(self, check: CheckConfig) -> CheckResult:
        if self.client is not None:
            return await self._execute_check(self.client, check)
        async with httpx.AsyncClient(
            headers={"User-Agent": self.config.defaults.user_agent}
        ) as client:
            return await self._execute_check(client, check)

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
        latest = None
        if hasattr(self.state, "_latest_by_check"):
            latest = self.state._latest_by_check.get(check.id) or self.state._latest_by_check.get(
                check.name
            )
        return {
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
            "browser": {
                "expected_title_contains": check.browser.expected_title_contains,
                "required_selectors": check.browser.required_selectors,
                "wait_until": check.browser.wait_until,
                "viewport_width": check.browser.viewport_width,
                "viewport_height": check.browser.viewport_height,
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
            "assignable_nodes": self.cluster.assignable_node_ids()
            if self.config.cluster.enabled
            else [self.config.cluster.node_id],
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
                    "monitor_scope": peer.monitor_scope,
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
                    "monitor_scope": peer.monitor_scope,
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
            "local_monitor_scope": self.monitor_scope,
            "healthy_nodes": self.cluster.healthy_node_ids(),
            "assignable_nodes": self.cluster.assignable_node_ids(),
            "assignment_plan": self.cluster.assignment_plan() if self.config.cluster.enabled else {},
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
        if (
            self.config.telemetry.timeseries_provider == "local_postgresql"
            and self.config.telemetry.timeseries_local_container_name
        ):
            monitor_names.add(self.config.telemetry.timeseries_local_container_name)
        if (
            self.config.telemetry.object_provider == "local_minio"
            and self.config.telemetry.object_local_container_name
        ):
            monitor_names.add(self.config.telemetry.object_local_container_name)
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
            attrs = container.attrs if hasattr(container, "attrs") else {}
            network_settings = attrs.get("NetworkSettings", {})
            networks = sorted((network_settings.get("Networks") or {}).keys())
            port_bindings = network_settings.get("Ports") or {}
            published_ports: list[dict[str, object]] = []
            for container_port, bindings in port_bindings.items():
                if not bindings:
                    published_ports.append(
                        {
                            "container_port": container_port,
                            "host_ip": None,
                            "host_port": None,
                        }
                    )
                    continue
                for binding in bindings:
                    published_ports.append(
                        {
                            "container_port": container_port,
                            "host_ip": binding.get("HostIp"),
                            "host_port": binding.get("HostPort"),
                        }
                    )
            containers.append(
                {
                    "name": container.name,
                    "status": container.status,
                    "image": container.image.tags[0] if container.image.tags else "unknown",
                    "networks": networks,
                    "ports": published_ports,
                    "created": attrs.get("Created"),
                    "command": attrs.get("Config", {}).get("Cmd") or [],
                }
            )
        return sorted(containers, key=lambda item: str(item["name"]))

    async def create_monitor_container(self, payload: dict[str, object]) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to the monitor service")
        return await asyncio.to_thread(self._create_monitor_container_sync, payload)

    async def plan_container_creation(self, payload: dict[str, object]) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to the monitor service")
        return await asyncio.to_thread(self._plan_container_creation_sync, payload)

    async def provision_local_postgresql(self, telemetry_config) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to provision local PostgreSQL")
        return await asyncio.to_thread(self._provision_local_postgresql_sync, telemetry_config)

    async def provision_local_minio(self, telemetry_config) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to provision local MinIO")
        return await asyncio.to_thread(self._provision_local_minio_sync, telemetry_config)

    async def provision_local_email_service(self, email_config) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to provision a local email service")
        return await asyncio.to_thread(self._provision_local_email_service_sync, email_config)

    async def reconcile_ui_scaling(self, config_path: str | os.PathLike[str]) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to manage scaled UI services")
        return await asyncio.to_thread(self._reconcile_ui_scaling_sync, str(config_path))

    def _create_monitor_container_sync(self, payload: dict[str, object]) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to the monitor service")
        plan = self._plan_container_creation_sync(payload)
        container_name = str(plan["container_name"])
        image = str(plan["image"])
        host_port = plan.get("host_port")
        network = plan.get("network")
        config_path = plan.get("config_path")
        monitor_scope = str(plan["monitor_scope"])
        node_id = str(plan["node_id"])

        environment = {"MONITOR_NODE_ID": node_id, "MONITOR_SCOPE": monitor_scope}
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
        kwargs["ports"] = {"8000/tcp": int(host_port)} if host_port else {"8000/tcp": None}
        if network:
            kwargs["network"] = network
        if config_path:
            kwargs["volumes"] = {
                str(config_path): {"bind": "/app/config.yaml", "mode": "ro"}
            }

        container = self.docker_client.containers.run(image, **kwargs)
        container.reload()
        attrs = container.attrs if hasattr(container, "attrs") else {}
        network_settings = attrs.get("NetworkSettings", {})
        networks = sorted((network_settings.get("Networks") or {}).keys())
        ports = network_settings.get("Ports") or {}
        bindings = ports.get("8000/tcp") or []
        published_port = int(bindings[0]["HostPort"]) if bindings and bindings[0].get("HostPort") else None
        base_url = (
            f"http://{container.name}:8000"
            if networks
            else f"http://127.0.0.1:{published_port or 8000}"
        )
        return {
            "status": "ok",
            "container": container.name,
            "state": container.status,
            "image": image,
            "network": networks[0] if networks else None,
            "host_port": published_port,
            "base_url": base_url,
            "monitor_scope": monitor_scope,
        }

    def _plan_container_creation_sync(self, payload: dict[str, object]) -> dict[str, object]:
        defaults = self._container_creation_defaults_sync()
        node_id = str(payload["node_id"])
        container_name = str(payload.get("container_name") or node_id)
        image = str(payload.get("image") or defaults["image"])
        host_port = int(payload["host_port"]) if payload.get("host_port") else None
        network = payload.get("network") or defaults["network"]
        monitor_scope = str(payload.get("monitor_scope") or "full")
        config_path = payload.get("config_bind_source") or os.getenv("ASM_CONFIG_BIND_SOURCE") or payload.get("config_path")
        if not config_path and os.getenv("ASM_CONFIG_BIND_SOURCE"):
            config_path = os.getenv("ASM_CONFIG_BIND_SOURCE")
        if str(payload.get("config_path") or "") == "/app/config.yaml" and not os.getenv("ASM_CONFIG_BIND_SOURCE"):
            raise ValueError(
                "Container creation from a Dockerized admin requires ASM_CONFIG_BIND_SOURCE to point at the host path of the shared config file."
            )
        base_url = (
            f"http://{container_name}:8000"
            if network
            else f"http://127.0.0.1:{host_port or 8000}"
        )
        return {
            "node_id": node_id,
            "container_name": container_name,
            "image": image,
            "host_port": host_port,
            "network": network,
            "config_path": config_path,
            "monitor_scope": monitor_scope,
            "base_url": base_url,
        }

    def _container_creation_defaults_sync(self) -> dict[str, object]:
        image = "async-service-monitor:latest"
        network = None
        if self.docker_client is None:
            return {"image": image, "network": network}

        candidate_names = [
            self.config.cluster.node_id,
            *[
                peer.container_name
                for peer in self.config.cluster.peers
                if peer.container_name
            ],
        ]
        for candidate_name in candidate_names:
            try:
                container = self.docker_client.containers.get(candidate_name)
            except docker.errors.NotFound:
                continue
            if container.image.tags:
                image = container.image.tags[0]
            attrs = container.attrs if hasattr(container, "attrs") else {}
            networks = sorted(
                (attrs.get("NetworkSettings", {}).get("Networks") or {}).keys()
            )
            if networks:
                network = networks[0]
            break
        return {"image": image, "network": network}

    def _provision_local_postgresql_sync(self, telemetry_config) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to provision local PostgreSQL")

        container_name = (
            telemetry_config.timeseries_local_container_name
            or "async-service-monitor-postgres"
        )
        port = int(telemetry_config.timeseries_port or 5432)
        database = telemetry_config.timeseries_database or "async_service_monitor"
        username = telemetry_config.timeseries_username or "asm_telemetry"
        password = telemetry_config.timeseries_password or secrets.token_urlsafe(18)

        try:
            container = self.docker_client.containers.get(container_name)
            if container.status != "running":
                container.start()
            container.reload()
        except docker.errors.NotFound:
            container = self.docker_client.containers.run(
                "postgres:17-alpine",
                name=container_name,
                detach=True,
                environment={
                    "POSTGRES_DB": database,
                    "POSTGRES_USER": username,
                    "POSTGRES_PASSWORD": password,
                },
                ports={"5432/tcp": port},
            )
            container.reload()

        host_port = port
        ports = container.attrs.get("NetworkSettings", {}).get("Ports", {}) if hasattr(container, "attrs") else {}
        bindings = ports.get("5432/tcp") or []
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

    def _provision_local_minio_sync(self, telemetry_config) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to provision local MinIO")

        container_name = (
            telemetry_config.object_local_container_name
            or "async-service-monitor-minio"
        )
        parsed = urlparse(telemetry_config.object_endpoint or "")
        endpoint_port = parsed.port or (443 if telemetry_config.object_use_ssl else 9000)
        console_port = int(telemetry_config.object_console_port or 9001)
        access_key = telemetry_config.object_access_key or "asm_minio"
        secret_key = telemetry_config.object_secret_key or secrets.token_urlsafe(24)
        bucket = telemetry_config.object_bucket or "async-service-monitor"

        try:
            container = self.docker_client.containers.get(container_name)
            if container.status != "running":
                container.start()
            container.reload()
        except docker.errors.NotFound:
            container = self.docker_client.containers.run(
                "minio/minio:RELEASE.2025-02-28T09-55-16Z",
                name=container_name,
                detach=True,
                environment={
                    "MINIO_ROOT_USER": access_key,
                    "MINIO_ROOT_PASSWORD": secret_key,
                },
                command=["server", "/data", "--console-address", ":9001"],
                ports={"9000/tcp": endpoint_port, "9001/tcp": console_port},
            )
            container.reload()

        ports = container.attrs.get("NetworkSettings", {}).get("Ports", {}) if hasattr(container, "attrs") else {}
        api_bindings = ports.get("9000/tcp") or []
        console_bindings = ports.get("9001/tcp") or []
        host_api_port = endpoint_port
        host_console_port = console_port
        if api_bindings and api_bindings[0].get("HostPort"):
            host_api_port = int(api_bindings[0]["HostPort"])
        if console_bindings and console_bindings[0].get("HostPort"):
            host_console_port = int(console_bindings[0]["HostPort"])

        return {
            "container_name": container.name,
            "endpoint": f"http://127.0.0.1:{host_api_port}",
            "console_port": host_console_port,
            "access_key": access_key,
            "secret_key": secret_key,
            "bucket": bucket,
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

    def _reconcile_ui_scaling_sync(self, config_path: str) -> dict[str, object]:
        if self.docker_client is None:
            raise ValueError("Docker is not available to manage scaled UI services")
        scaling = self.config.ui_scaling
        defaults = self._container_creation_defaults_sync()
        image = str(defaults["image"])
        network = defaults.get("network")
        host_config_path = os.getenv("ASM_CONFIG_BIND_SOURCE") or config_path
        if str(config_path) == "/app/config.yaml" and not os.getenv("ASM_CONFIG_BIND_SOURCE"):
            raise ValueError(
                "Scaled UI management from a Dockerized admin requires ASM_CONFIG_BIND_SOURCE to point at the host path of the shared config file."
            )

        if not scaling.enabled:
            for container_name in [scaling.proxy_container_name, *self._find_scaled_dashboard_containers_sync(scaling.dashboard_container_prefix)]:
                self._remove_container_if_exists_sync(container_name)
            return {
                "enabled": False,
                "dashboard_replicas": 0,
                "proxy_container_name": scaling.proxy_container_name,
                "containers": [],
            }

        if not self.config.telemetry.enabled:
            raise ValueError("UI scaling requires telemetry storage to be enabled")

        desired_names = [
            f"{scaling.dashboard_container_prefix}-{index}"
            for index in range(1, scaling.dashboard_replicas + 1)
        ]
        for container_name in desired_names:
            self._ensure_dashboard_container_sync(container_name, image, network, host_config_path)

        for container_name in self._find_scaled_dashboard_containers_sync(scaling.dashboard_container_prefix):
            if container_name not in desired_names:
                self._remove_container_if_exists_sync(container_name)

        proxy_conf_path = self._write_scaled_proxy_config_sync(
            dashboard_names=desired_names,
            sticky_sessions=scaling.sticky_sessions or scaling.session_strategy == "sticky_proxy",
        )
        self._ensure_proxy_container_sync(
            container_name=scaling.proxy_container_name,
            image="nginx:1.27-alpine",
            network=network,
            proxy_conf_path=proxy_conf_path,
            host_port=int(scaling.proxy_port or 8000),
        )
        return {
            "enabled": True,
            "dashboard_replicas": len(desired_names),
            "proxy_container_name": scaling.proxy_container_name,
            "containers": desired_names,
            "proxy_port": scaling.proxy_port,
            "session_strategy": scaling.session_strategy,
            "sticky_sessions": scaling.sticky_sessions,
        }

    def _find_scaled_dashboard_containers_sync(self, prefix: str) -> list[str]:
        if self.docker_client is None:
            return []
        return sorted(
            container.name
            for container in self.docker_client.containers.list(all=True)
            if container.name.startswith(f"{prefix}-")
        )

    def _remove_container_if_exists_sync(self, container_name: str) -> None:
        if self.docker_client is None:
            return
        try:
            container = self.docker_client.containers.get(container_name)
        except docker.errors.NotFound:
            return
        container.remove(force=True)

    def _ensure_dashboard_container_sync(
        self,
        container_name: str,
        image: str,
        network: str | None,
        host_config_path: str,
    ) -> None:
        if self.docker_client is None:
            raise ValueError("Docker is not available to provision dashboard replicas")
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
        environment = {
            "MONITOR_NODE_ID": container_name,
            "SERVICE_MONITOR_APP_MODE": "dashboard",
        }
        recreate = False
        try:
            container = self.docker_client.containers.get(container_name)
            attrs = container.attrs if hasattr(container, "attrs") else {}
            current_image = container.image.tags[0] if container.image.tags else None
            current_networks = sorted((attrs.get("NetworkSettings", {}).get("Networks") or {}).keys())
            expected_networks = [network] if network else []
            if current_image != image or current_networks != expected_networks:
                recreate = True
            elif container.status != "running":
                container.start()
                return
            else:
                return
        except docker.errors.NotFound:
            recreate = True
        if recreate:
            self._remove_container_if_exists_sync(container_name)
            kwargs: dict[str, object] = {
                "name": container_name,
                "detach": True,
                "environment": environment,
                "command": command,
                "volumes": {
                    str(host_config_path): {"bind": "/app/config.yaml", "mode": "ro"},
                },
            }
            if network:
                kwargs["network"] = network
            self.docker_client.containers.run(image, **kwargs)

    def _write_scaled_proxy_config_sync(self, dashboard_names: list[str], sticky_sessions: bool) -> str:
        proxy_dir = Path(__file__).resolve().parents[2] / "docker" / "generated"
        proxy_dir.mkdir(parents=True, exist_ok=True)
        proxy_conf_path = proxy_dir / "nginx.scaled.runtime.conf"
        sticky_block = "    ip_hash;\n" if sticky_sessions else ""
        dashboard_servers = "\n".join(f"    server {name}:8000;" for name in dashboard_names)
        proxy_conf_path.write_text(
            (
                "upstream control_plane {\n"
                f"    server {self.config.cluster.node_id}:8000;\n"
                "}\n\n"
                "upstream dashboard_pool {\n"
                f"{sticky_block}"
                f"{dashboard_servers}\n"
                "}\n\n"
                "map $request_method $checks_backend {\n"
                "    default http://control_plane;\n"
                "    GET http://dashboard_pool;\n"
                "    HEAD http://dashboard_pool;\n"
                "}\n\n"
                "server {\n"
                "    listen 8080;\n"
                "    server_name _;\n"
                "    proxy_http_version 1.1;\n"
                "    proxy_set_header Host $host;\n"
                "    proxy_set_header X-Real-IP $remote_addr;\n"
                "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n"
                "    proxy_set_header X-Forwarded-Proto $scheme;\n"
                "    proxy_set_header Upgrade $http_upgrade;\n"
                "    proxy_set_header Connection \"upgrade\";\n"
                "    location = / { proxy_pass http://dashboard_pool; }\n"
                "    location /dashboards { proxy_pass http://dashboard_pool; }\n"
                "    location /app.js { proxy_pass http://dashboard_pool; }\n"
                "    location /app.css { proxy_pass http://dashboard_pool; }\n"
                "    location = /api/overview { proxy_pass http://dashboard_pool; }\n"
                "    location = /api/results { proxy_pass http://dashboard_pool; }\n"
                "    location /api/metrics/ { proxy_pass http://dashboard_pool; }\n"
                "    location = /api/checks { proxy_pass $checks_backend; }\n"
                "    location ~ ^/api/checks/[^/]+$ { proxy_pass $checks_backend; }\n"
                "    location /api/ { proxy_pass http://control_plane; }\n"
                "    location / { proxy_pass http://control_plane; }\n"
                "}\n"
            ),
            encoding="utf-8",
        )
        return str(proxy_conf_path)

    def _ensure_proxy_container_sync(
        self,
        container_name: str,
        image: str,
        network: str | None,
        proxy_conf_path: str,
        host_port: int,
    ) -> None:
        if self.docker_client is None:
            raise ValueError("Docker is not available to provision the scaled UI proxy")
        self._remove_container_if_exists_sync(container_name)
        kwargs: dict[str, object] = {
            "name": container_name,
            "detach": True,
            "ports": {"8080/tcp": int(host_port)},
            "volumes": {
                str(proxy_conf_path): {"bind": "/etc/nginx/conf.d/default.conf", "mode": "ro"},
            },
        }
        if network:
            kwargs["network"] = network
        self.docker_client.containers.run(image, **kwargs)

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
