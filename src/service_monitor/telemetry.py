from __future__ import annotations

import asyncio
import json
import time
from dataclasses import asdict
from typing import Any

from service_monitor.checks import CheckResult
from service_monitor.config import AppConfig, CheckConfig, TelemetryConfig


class TelemetryStore:
    def __init__(self, config: AppConfig) -> None:
        self.config = config.telemetry
        self._schema_ready = False
        self._schema_key: tuple[object, ...] | None = None
        self._lock = asyncio.Lock()

    async def apply_config(self, config: AppConfig) -> None:
        self.config = config.telemetry
        self._schema_ready = False
        self._schema_key = None
        if self.config.enabled:
            await self.ensure_ready()
            await self.store_config_snapshot(config)

    async def ensure_ready(self) -> None:
        async with self._lock:
            if not self.config.enabled:
                return
            key = self._connection_key()
            if self._schema_ready and self._schema_key == key:
                return
            await asyncio.to_thread(self._ensure_schema_sync)
            self._schema_ready = True
            self._schema_key = key

    async def store_config_snapshot(self, config: AppConfig) -> None:
        if not self.config.enabled:
            return
        await self.ensure_ready()
        payload = {
            "captured_at": time.time(),
            "cluster": asdict(config.cluster),
            "portal": {
                "enabled": config.portal.enabled,
                "provider": config.portal.provider,
                "users": [
                    {
                        "username": user.username,
                        "first_name": user.first_name,
                        "last_name": user.last_name,
                        "role": user.role,
                        "enabled": user.enabled,
                        "last_login_at": user.last_login_at,
                    }
                    for user in config.portal.users
                ],
            },
            "checks": [asdict(check) for check in config.checks],
        }
        await asyncio.to_thread(self._insert_config_snapshot_sync, payload)

    async def record_check_result(
        self,
        result: CheckResult,
        owner: str | None,
        check: CheckConfig,
    ) -> None:
        if not self.config.enabled:
            return
        await self.ensure_ready()
        await asyncio.to_thread(
            self._insert_check_result_sync,
            asdict(result),
            owner,
            asdict(check),
        )

    async def record_node_health(
        self,
        node_id: str,
        healthy: bool,
        timestamp: float | None = None,
    ) -> None:
        if not self.config.enabled:
            return
        await self.ensure_ready()
        await asyncio.to_thread(
            self._insert_node_health_sync,
            node_id,
            healthy,
            timestamp if timestamp is not None else time.time(),
        )

    def _connection_key(self) -> tuple[object, ...]:
        return (
            self.config.provider,
            self.config.host,
            self.config.port,
            self.config.database,
            self.config.username,
            self.config.use_ssl,
        )

    def _connect(self):
        try:
            import pymysql
        except ImportError as exc:
            raise RuntimeError(
                "PyMySQL is not installed. Install project dependencies to enable MySQL telemetry."
            ) from exc

        kwargs: dict[str, Any] = {
            "host": self.config.host,
            "port": self.config.port,
            "user": self.config.username,
            "password": self.config.password,
            "database": self.config.database,
            "autocommit": True,
            "cursorclass": pymysql.cursors.DictCursor,
        }
        if self.config.use_ssl or self.config.provider == "oci_mysql":
            kwargs["ssl"] = {}
        return pymysql.connect(**kwargs)

    def _ensure_schema_sync(self) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS monitor_telemetry (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        captured_at DOUBLE NOT NULL,
                        monitor_name VARCHAR(255) NOT NULL,
                        monitor_type VARCHAR(32) NOT NULL,
                        owner_node VARCHAR(255) NULL,
                        success BOOLEAN NOT NULL,
                        status_code INT NULL,
                        duration_ms DOUBLE NULL,
                        message TEXT NULL,
                        target_url TEXT NULL,
                        target_host VARCHAR(255) NULL,
                        monitor_config_json JSON NOT NULL
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS node_telemetry (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        captured_at DOUBLE NOT NULL,
                        node_id VARCHAR(255) NOT NULL,
                        healthy BOOLEAN NOT NULL
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS monitor_config_snapshots (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        captured_at DOUBLE NOT NULL,
                        config_json JSON NOT NULL
                    )
                    """
                )

    def _prune_sync(self, cursor) -> None:
        cutoff = time.time() - (self.config.retention_hours * 3600)
        cursor.execute("DELETE FROM monitor_telemetry WHERE captured_at < %s", (cutoff,))
        cursor.execute("DELETE FROM node_telemetry WHERE captured_at < %s", (cutoff,))
        cursor.execute("DELETE FROM monitor_config_snapshots WHERE captured_at < %s", (cutoff,))

    def _insert_config_snapshot_sync(self, payload: dict[str, Any]) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO monitor_config_snapshots (captured_at, config_json) VALUES (%s, %s)",
                    (payload["captured_at"], json.dumps(payload)),
                )
                self._prune_sync(cursor)

    def _insert_check_result_sync(
        self,
        result_payload: dict[str, Any],
        owner: str | None,
        check_payload: dict[str, Any],
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO monitor_telemetry (
                        captured_at,
                        monitor_name,
                        monitor_type,
                        owner_node,
                        success,
                        status_code,
                        duration_ms,
                        message,
                        target_url,
                        target_host,
                        monitor_config_json
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        result_payload["timestamp"],
                        result_payload["name"],
                        check_payload["type"],
                        owner,
                        bool(result_payload["success"]),
                        result_payload.get("status_code"),
                        result_payload.get("duration_ms"),
                        result_payload.get("message"),
                        check_payload.get("url"),
                        check_payload.get("host"),
                        json.dumps(check_payload),
                    ),
                )
                self._prune_sync(cursor)

    def _insert_node_health_sync(self, node_id: str, healthy: bool, timestamp: float) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO node_telemetry (captured_at, node_id, healthy) VALUES (%s, %s, %s)",
                    (timestamp, node_id, bool(healthy)),
                )
                self._prune_sync(cursor)
