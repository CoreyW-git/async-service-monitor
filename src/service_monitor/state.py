from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import asdict

from service_monitor.checks import CheckResult


class MonitorState:
    def __init__(
        self,
        max_results: int = 500,
        metrics_history_limit: int = 120,
        result_listeners: list | None = None,
        node_listeners: list | None = None,
    ) -> None:
        self.max_results = max_results
        self.metrics_history_limit = metrics_history_limit
        self.result_listeners = result_listeners or []
        self.node_listeners = node_listeners or []
        self._results: deque[dict[str, object]] = deque(maxlen=max_results)
        self._latest_by_check: dict[str, dict[str, object]] = {}
        self._check_history: dict[str, deque[dict[str, object]]] = {}
        self._node_history: dict[str, deque[dict[str, object]]] = {}
        self._lock = asyncio.Lock()
        self.started_at = time.time()

    async def record_result(self, result: CheckResult, owner: str | None = None) -> None:
        payload = asdict(result)
        if owner is not None:
            payload["owner"] = owner
        async with self._lock:
            self._results.appendleft(payload)
            self._latest_by_check[result.name] = payload
            history = self._check_history.setdefault(
                result.name, deque(maxlen=self.metrics_history_limit)
            )
            history.append(
                {
                    "timestamp": result.timestamp,
                    "healthy": bool(result.success),
                    "duration_ms": result.duration_ms,
                }
            )
        for listener in self.result_listeners:
            await listener(result, owner)

    async def record_node_health(self, node_id: str, healthy: bool) -> None:
        timestamp = time.time()
        async with self._lock:
            history = self._node_history.setdefault(
                node_id, deque(maxlen=self.metrics_history_limit)
            )
            history.append({"timestamp": timestamp, "healthy": bool(healthy)})
        for listener in self.node_listeners:
            await listener(node_id, healthy, timestamp)

    async def recent_results(self, limit: int = 100) -> list[dict[str, object]]:
        async with self._lock:
            return list(self._results)[:limit]

    async def latest_results(self) -> list[dict[str, object]]:
        async with self._lock:
            return list(self._latest_by_check.values())

    async def latest_result_for(self, check_name: str) -> dict[str, object] | None:
        async with self._lock:
            return self._latest_by_check.get(check_name)

    async def summary(self) -> dict[str, object]:
        latest = await self.latest_results()
        healthy = sum(1 for item in latest if item.get("success"))
        unhealthy = len(latest) - healthy
        return {
            "started_at": self.started_at,
            "checks_seen": len(latest),
            "healthy_checks": healthy,
            "unhealthy_checks": unhealthy,
        }

    async def check_history(self) -> dict[str, list[dict[str, object]]]:
        async with self._lock:
            return {name: list(points) for name, points in self._check_history.items()}

    async def node_history(self) -> dict[str, list[dict[str, object]]]:
        async with self._lock:
            return {name: list(points) for name, points in self._node_history.items()}
