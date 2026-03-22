from __future__ import annotations

import asyncio
import re
import socket
import time
from dataclasses import dataclass, field

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
            check.url,
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
            check.url,
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
                check.url,
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
