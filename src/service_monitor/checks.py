from __future__ import annotations

import asyncio
import re
import socket
import time
from dataclasses import dataclass, field
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


async def run_database_check(check: CheckConfig, timeout_seconds: float) -> CheckResult:
    started = time.perf_counter()
    try:
        if check.database_engine == "mysql" and check.auth and check.auth.username:
            await asyncio.to_thread(_mysql_connect_sync, check, timeout_seconds)
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
