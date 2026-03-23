from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
from dataclasses import dataclass

import docker
import httpx

from service_monitor.config import AppConfig, CheckConfig, PeerConfig
from service_monitor.notifier import EmailNotifier
from service_monitor.state import MonitorState


@dataclass(slots=True)
class PeerState:
    node_id: str
    healthy: bool
    last_ok_at: float | None = None
    last_error: str | None = None
    failure_reported: bool = False


class ClusterCoordinator:
    def __init__(self, config: AppConfig, notifier: EmailNotifier, state: MonitorState) -> None:
        self.config = config
        self.notifier = notifier
        self.state = state
        self.monitor_scope = os.getenv("MONITOR_SCOPE", "full").strip().lower() or "full"
        self.peer_states = {
            peer.node_id: PeerState(node_id=peer.node_id, healthy=False)
            for peer in config.cluster.peers
        }
        self.recovery_lock = asyncio.Lock()
        self.last_recovery_attempt: dict[str, float] = {}
        self._server: asyncio.base_events.Server | None = None
        self.docker_client: docker.DockerClient | None = None

    @property
    def enabled(self) -> bool:
        return self.config.cluster.enabled

    async def start(self) -> None:
        if not self.enabled:
            return
        try:
            self.docker_client = docker.from_env()
        except Exception:
            self.docker_client = None
        self._server = await asyncio.start_server(
            self._handle_health_request,
            host=self.config.cluster.bind_host,
            port=self.config.cluster.bind_port,
        )

    async def stop(self) -> None:
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()

    async def poll_peers(self, client: httpx.AsyncClient, stop_event: asyncio.Event) -> None:
        if not self.enabled:
            return

        while not stop_event.is_set():
            await asyncio.gather(
                *(self._poll_peer(client, peer) for peer in self.config.cluster.peers if peer.enabled),
                return_exceptions=True,
            )
            try:
                await asyncio.wait_for(
                    stop_event.wait(),
                    timeout=self.config.defaults.peer_poll_interval_seconds,
                )
            except asyncio.TimeoutError:
                continue

    def should_run_check(self, check_name: str) -> bool:
        if not self.enabled:
            return True
        return self.owner_for_check(check_name) == self.config.cluster.node_id

    def owner_for_check(self, check_name: str) -> str:
        assignments = self.assignment_plan()
        return assignments.get(check_name, self.config.cluster.node_id)

    def assignment_plan(self) -> dict[str, str]:
        checks = sorted(
            self.config.checks,
            key=lambda check: (
                0 if check.enabled else 1,
                0 if check.placement_mode == "specific" else 1,
                check.name,
            ),
        )
        assignments: dict[str, str] = {}
        loads: dict[str, int] = {node_id: 0 for node_id in self.assignable_node_ids()}
        fallback_nodes = self.healthy_node_ids()

        for check in checks:
            owner = self._choose_owner_for_check(check, loads, fallback_nodes)
            assignments[check.name] = owner
            if check.enabled:
                loads[owner] = loads.get(owner, 0) + 1

        return assignments

    def assignable_node_ids(self) -> list[str]:
        node_ids = []
        if self.monitor_scope != "peer_only":
            node_ids.append(self.config.cluster.node_id)
        node_ids.extend(
            peer.node_id
            for peer in self.config.cluster.peers
            if peer.enabled
            and peer.monitor_scope != "peer_only"
            and self.peer_states[peer.node_id].healthy
        )
        return sorted(node_ids) or self.healthy_node_ids()

    def _choose_owner_for_check(
        self, check: CheckConfig, loads: dict[str, int], fallback_nodes: list[str]
    ) -> str:
        assignable_nodes = self.assignable_node_ids()
        if check.placement_mode == "specific" and check.assigned_node_id:
            if check.assigned_node_id in assignable_nodes:
                return check.assigned_node_id
            if check.assigned_node_id in fallback_nodes:
                return check.assigned_node_id

        candidates = assignable_nodes or fallback_nodes
        if not candidates:
            return self.config.cluster.node_id

        min_load = min(loads.get(node_id, 0) for node_id in candidates)
        least_loaded = [node_id for node_id in candidates if loads.get(node_id, 0) == min_load]
        check_hash = int(hashlib.sha256(check.name.encode("utf-8")).hexdigest(), 16)
        return least_loaded[check_hash % len(least_loaded)]

    def recovery_owner_for_peer(self, peer_id: str) -> str:
        active_nodes = self.healthy_node_ids()
        peer_hash = int(hashlib.sha256(peer_id.encode("utf-8")).hexdigest(), 16)
        return active_nodes[peer_hash % len(active_nodes)]

    def healthy_node_ids(self) -> list[str]:
        node_ids = [self.config.cluster.node_id]
        node_ids.extend(
            peer.node_id
            for peer in self.config.cluster.peers
            if peer.enabled and self.peer_states[peer.node_id].healthy
        )
        return sorted(node_ids)

    async def _poll_peer(self, client: httpx.AsyncClient, peer: PeerConfig) -> None:
        url = f"{peer.base_url}/health"
        state = self.peer_states[peer.node_id]
        was_healthy = state.healthy

        try:
            response = await client.get(
                url,
                timeout=self.config.defaults.peer_timeout_seconds,
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            payload = response.json()
            if payload.get("status") != "ok":
                raise ValueError(f"unexpected peer payload: {payload}")

            state.healthy = True
            state.last_ok_at = time.time()
            state.last_error = None
            state.failure_reported = False
            await self.state.record_node_health(peer.node_id, True)
        except Exception as exc:
            state.healthy = False
            state.last_error = str(exc)
            await self.state.record_node_health(peer.node_id, False)
            if was_healthy or not state.failure_reported:
                state.failure_reported = True
                await self._handle_peer_failure(peer, state)

    async def _handle_peer_failure(self, peer: PeerConfig, state: PeerState) -> None:
        await self.notifier.send(
            subject=f"peer down: {peer.node_id}",
            body=(
                f"Peer {peer.node_id} is unhealthy.\n"
                f"Container: {peer.container_name or 'unknown'}\n"
                f"Endpoint: {peer.base_url}/health\n"
                f"Error: {state.last_error or 'unknown'}\n"
                f"Recovery owner: {self.recovery_owner_for_peer(peer.node_id)}\n"
            ),
        )
        await self._attempt_recovery(peer)

    async def _attempt_recovery(self, peer: PeerConfig) -> None:
        if not peer.recovery.enabled:
            return
        if self.recovery_owner_for_peer(peer.node_id) != self.config.cluster.node_id:
            return

        async with self.recovery_lock:
            now = time.time()
            last_attempt = self.last_recovery_attempt.get(peer.node_id, 0.0)
            if now - last_attempt < self.config.defaults.recovery_cooldown_seconds:
                return
            self.last_recovery_attempt[peer.node_id] = now

            container_name = peer.recovery.container_name or peer.container_name
            if not container_name:
                return

            command = ["docker", "restart", container_name]
            try:
                await asyncio.to_thread(self._restart_container, container_name)
                await self.notifier.send(
                    subject=f"recovery attempted: {peer.node_id}",
                    body=(
                        f"Attempted docker recovery for peer {peer.node_id}.\n"
                        f"Container: {container_name}\n"
                    ),
                )
            except Exception as exc:
                await self.notifier.send(
                    subject=f"recovery failed: {peer.node_id}",
                    body=(
                        f"Failed to recover peer {peer.node_id}.\n"
                        f"Container: {container_name}\n"
                        f"Error: {exc}\n"
                    ),
                )

    def _restart_container(self, container_name: str) -> None:
        if self.docker_client is None:
            raise RuntimeError("Docker recovery client is not available")
        container = self.docker_client.containers.get(container_name)
        container.restart()

    async def _handle_health_request(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        try:
            await reader.readuntil(b"\r\n\r\n")
        except Exception:
            writer.close()
            await writer.wait_closed()
            return

        payload = json.dumps(
            {
                "status": "ok",
                "node_id": self.config.cluster.node_id,
                "healthy_nodes": self.healthy_node_ids(),
                "timestamp": time.time(),
            }
        ).encode("utf-8")

        response = (
            b"HTTP/1.1 200 OK\r\n"
            b"Content-Type: application/json\r\n"
            b"Connection: close\r\n"
            + f"Content-Length: {len(payload)}\r\n\r\n".encode("utf-8")
            + payload
        )
        writer.write(response)
        await writer.drain()
        writer.close()
        await writer.wait_closed()
