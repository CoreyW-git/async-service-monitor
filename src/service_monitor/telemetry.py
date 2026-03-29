from __future__ import annotations

import asyncio
import json
import secrets
import time
from dataclasses import asdict
from io import BytesIO
from typing import Any
from urllib.parse import urlparse

from service_monitor.checks import CheckResult
from service_monitor.config import AppConfig, CheckConfig


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
            await asyncio.to_thread(self._ensure_storage_sync)
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
            "telemetry": asdict(config.telemetry),
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

    async def recent_check_results(self, limit: int = 100) -> list[dict[str, object]]:
        if not self.config.enabled:
            return []
        await self.ensure_ready()
        return await asyncio.to_thread(self._recent_check_results_sync, limit)

    async def latest_check_results(self) -> list[dict[str, object]]:
        if not self.config.enabled:
            return []
        await self.ensure_ready()
        return await asyncio.to_thread(self._latest_check_results_sync)

    async def check_history(self) -> dict[str, list[dict[str, object]]]:
        if not self.config.enabled:
            return {}
        await self.ensure_ready()
        return await asyncio.to_thread(self._check_history_sync)

    async def node_history(self) -> dict[str, list[dict[str, object]]]:
        if not self.config.enabled:
            return {}
        await self.ensure_ready()
        return await asyncio.to_thread(self._node_history_sync)

    def _connection_key(self) -> tuple[object, ...]:
        return (
            self.config.timeseries_provider,
            self.config.timeseries_host,
            self.config.timeseries_port,
            self.config.timeseries_database,
            self.config.timeseries_username,
            self.config.timeseries_use_ssl,
            self.config.object_provider,
            self.config.object_endpoint,
            self.config.object_bucket,
            self.config.object_use_ssl,
            self.config.object_region,
        )

    def _connect(self):
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise RuntimeError(
                "psycopg is not installed. Install project dependencies to enable PostgreSQL telemetry."
            ) from exc

        sslmode = "require" if self.config.timeseries_use_ssl else "prefer"
        return psycopg.connect(
            host=self.config.timeseries_host,
            port=self.config.timeseries_port,
            user=self.config.timeseries_username,
            password=self.config.timeseries_password,
            dbname=self.config.timeseries_database,
            autocommit=True,
            row_factory=dict_row,
            sslmode=sslmode,
        )

    def _object_client(self):
        try:
            from minio import Minio
        except ImportError as exc:
            raise RuntimeError(
                "minio is not installed. Install project dependencies to enable object storage telemetry."
            ) from exc

        parsed = urlparse(self.config.object_endpoint or "")
        if parsed.scheme:
            endpoint = parsed.netloc
            secure = parsed.scheme == "https"
        else:
            endpoint = self.config.object_endpoint or ""
            secure = self.config.object_use_ssl
        return Minio(
            endpoint,
            access_key=self.config.object_access_key,
            secret_key=self.config.object_secret_key,
            secure=secure,
            region=self.config.object_region,
        )

    def _ensure_storage_sync(self) -> None:
        client = self._object_client()
        bucket = self.config.object_bucket
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket, location=self.config.object_region)

        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS monitor_telemetry (
                        id BIGSERIAL PRIMARY KEY,
                        captured_at DOUBLE PRECISION NOT NULL,
                        monitor_id TEXT NULL,
                        monitor_name TEXT NOT NULL,
                        monitor_type VARCHAR(32) NOT NULL,
                        owner_node TEXT NULL,
                        success BOOLEAN NOT NULL,
                        status_code INTEGER NULL,
                        duration_ms DOUBLE PRECISION NULL,
                        message TEXT NULL,
                        target_url TEXT NULL,
                        target_host TEXT NULL,
                        result_details_object_key TEXT NULL,
                        monitor_config_object_key TEXT NULL
                    )
                    """
                )
                cursor.execute(
                    "ALTER TABLE monitor_telemetry ADD COLUMN IF NOT EXISTS monitor_id TEXT NULL"
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS node_telemetry (
                        id BIGSERIAL PRIMARY KEY,
                        captured_at DOUBLE PRECISION NOT NULL,
                        node_id TEXT NOT NULL,
                        healthy BOOLEAN NOT NULL
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS monitor_config_snapshots (
                        id BIGSERIAL PRIMARY KEY,
                        captured_at DOUBLE PRECISION NOT NULL,
                        config_object_key TEXT NOT NULL
                    )
                    """
                )

    def _upload_json_object_sync(self, key: str, payload: dict[str, Any]) -> str:
        client = self._object_client()
        raw = json.dumps(payload).encode("utf-8")
        stream = BytesIO(raw)
        client.put_object(
            self.config.object_bucket,
            key,
            stream,
            length=len(raw),
            content_type="application/json",
        )
        return key

    def _load_json_object_sync(self, key: str | None) -> dict[str, object]:
        if not key:
            return {}
        client = self._object_client()
        response = client.get_object(self.config.object_bucket, key)
        try:
            raw = response.read()
        finally:
            response.close()
            response.release_conn()
        try:
            loaded = json.loads(raw.decode("utf-8"))
            return loaded if isinstance(loaded, dict) else {}
        except json.JSONDecodeError:
            return {}

    def _delete_objects_sync(self, keys: list[str]) -> None:
        if not keys:
            return
        from minio.deleteobjects import DeleteObject

        client = self._object_client()
        errors = list(client.remove_objects(self.config.object_bucket, [DeleteObject(key) for key in keys]))
        if errors:
            raise RuntimeError(f"Failed to remove {len(errors)} telemetry object(s) during retention pruning")

    def _prune_sync(self, cursor) -> None:
        cutoff = time.time() - (self.config.retention_hours * 3600)
        object_keys: list[str] = []

        cursor.execute(
            """
            SELECT result_details_object_key, monitor_config_object_key
            FROM monitor_telemetry
            WHERE captured_at < %s
            """,
            (cutoff,),
        )
        for row in cursor.fetchall() or []:
            if row.get("result_details_object_key"):
                object_keys.append(str(row["result_details_object_key"]))
            if row.get("monitor_config_object_key"):
                object_keys.append(str(row["monitor_config_object_key"]))

        cursor.execute(
            """
            SELECT config_object_key
            FROM monitor_config_snapshots
            WHERE captured_at < %s
            """,
            (cutoff,),
        )
        for row in cursor.fetchall() or []:
            if row.get("config_object_key"):
                object_keys.append(str(row["config_object_key"]))

        cursor.execute("DELETE FROM monitor_telemetry WHERE captured_at < %s", (cutoff,))
        cursor.execute("DELETE FROM node_telemetry WHERE captured_at < %s", (cutoff,))
        cursor.execute("DELETE FROM monitor_config_snapshots WHERE captured_at < %s", (cutoff,))

        if object_keys:
            unique_keys = sorted(set(object_keys))
            self._delete_objects_sync(unique_keys)

    def _insert_config_snapshot_sync(self, payload: dict[str, Any]) -> None:
        config_key = (
            f"telemetry/config-snapshots/{int(payload['captured_at'])}-"
            f"{secrets.token_hex(8)}.json"
        )
        self._upload_json_object_sync(config_key, payload)
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO monitor_config_snapshots (captured_at, config_object_key) VALUES (%s, %s)",
                    (payload["captured_at"], config_key),
                )
                self._prune_sync(cursor)

    def _insert_check_result_sync(
        self,
        result_payload: dict[str, Any],
        owner: str | None,
        check_payload: dict[str, Any],
    ) -> None:
        captured_at = float(result_payload["timestamp"])
        details_key = (
            f"telemetry/results/{result_payload.get('check_id') or result_payload['name']}/{int(captured_at)}-"
            f"{secrets.token_hex(8)}.json"
        )
        config_key = (
            f"telemetry/check-configs/{result_payload.get('check_id') or result_payload['name']}/{int(captured_at)}-"
            f"{secrets.token_hex(8)}.json"
        )
        self._upload_json_object_sync(details_key, result_payload.get("details") or {})
        self._upload_json_object_sync(config_key, check_payload)

        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO monitor_telemetry (
                        captured_at,
                        monitor_id,
                        monitor_name,
                        monitor_type,
                        owner_node,
                        success,
                        status_code,
                        duration_ms,
                        message,
                        target_url,
                        target_host,
                        result_details_object_key,
                        monitor_config_object_key
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        captured_at,
                        result_payload.get("check_id"),
                        result_payload["name"],
                        check_payload["type"],
                        owner,
                        bool(result_payload["success"]),
                        (result_payload.get("details") or {}).get("status_code"),
                        result_payload.get("duration_ms"),
                        result_payload.get("message"),
                        check_payload.get("url"),
                        check_payload.get("host"),
                        details_key,
                        config_key,
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

    def _deserialize_result_row(self, row: dict[str, Any]) -> dict[str, object]:
        details = self._load_json_object_sync(row.get("result_details_object_key"))
        if row.get("status_code") is not None and "status_code" not in details:
            details["status_code"] = row.get("status_code")
        return {
            "check_id": row.get("monitor_id"),
            "name": row.get("monitor_name"),
            "check_type": row.get("monitor_type"),
            "success": bool(row.get("success")),
            "message": row.get("message"),
            "duration_ms": row.get("duration_ms"),
            "details": details,
            "timestamp": row.get("captured_at"),
            "owner": row.get("owner_node"),
        }

    def _recent_check_results_sync(self, limit: int) -> list[dict[str, object]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT captured_at, monitor_name, monitor_type, owner_node, success, status_code,
                           duration_ms, message, result_details_object_key, monitor_id
                    FROM monitor_telemetry
                    ORDER BY captured_at DESC
                    LIMIT %s
                    """,
                    (int(limit),),
                )
                rows = cursor.fetchall() or []
        return [self._deserialize_result_row(row) for row in rows]

    def _latest_check_results_sync(self) -> list[dict[str, object]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT t.captured_at, t.monitor_name, t.monitor_type, t.owner_node, t.success, t.status_code,
                           t.duration_ms, t.message, t.result_details_object_key, t.monitor_id
                    FROM monitor_telemetry t
                    INNER JOIN (
                        SELECT COALESCE(monitor_id, monitor_name) AS monitor_key, MAX(captured_at) AS max_captured_at
                        FROM monitor_telemetry
                        GROUP BY COALESCE(monitor_id, monitor_name)
                    ) latest
                    ON latest.monitor_key = COALESCE(t.monitor_id, t.monitor_name) AND latest.max_captured_at = t.captured_at
                    ORDER BY t.monitor_name ASC
                    """
                )
                rows = cursor.fetchall() or []
        return [self._deserialize_result_row(row) for row in rows]

    def _check_history_sync(self) -> dict[str, list[dict[str, object]]]:
        history: dict[str, list[dict[str, object]]] = {}
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT monitor_id, monitor_name, captured_at, success, duration_ms
                    FROM monitor_telemetry
                    ORDER BY COALESCE(monitor_id, monitor_name) ASC, captured_at ASC
                    """
                )
                rows = cursor.fetchall() or []
        for row in rows:
            history.setdefault(str(row.get("monitor_id") or row.get("monitor_name")), []).append(
                {
                    "timestamp": row.get("captured_at"),
                    "healthy": bool(row.get("success")),
                    "duration_ms": row.get("duration_ms"),
                }
            )
        return history

    def _node_history_sync(self) -> dict[str, list[dict[str, object]]]:
        history: dict[str, list[dict[str, object]]] = {}
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT node_id, captured_at, healthy
                    FROM node_telemetry
                    ORDER BY node_id ASC, captured_at ASC
                    """
                )
                rows = cursor.fetchall() or []
        for row in rows:
            history.setdefault(str(row.get("node_id")), []).append(
                {
                    "timestamp": row.get("captured_at"),
                    "healthy": bool(row.get("healthy")),
                }
            )
        return history
