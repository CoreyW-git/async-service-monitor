from __future__ import annotations

import asyncio
import json
import math
import os
import re
import socket
import ssl
import subprocess
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
    check_id: str | None = None
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


def _merged_request_headers(check: CheckConfig) -> dict[str, str]:
    headers = {header.name: header.value for header in check.request_headers if header.name}
    auth_kwargs = _build_request_kwargs(check.auth)
    auth_headers = auth_kwargs.get("headers") or {}
    headers.update(auth_headers)
    return headers


def _request_payload_kwargs(check: CheckConfig) -> dict[str, object]:
    kwargs: dict[str, object] = {}
    headers = _merged_request_headers(check)
    auth_kwargs = _build_request_kwargs(check.auth)
    if "auth" in auth_kwargs:
        kwargs["auth"] = auth_kwargs["auth"]
    if headers:
        kwargs["headers"] = headers
    body = check.request_body
    if body and check.request_method not in {"GET", "HEAD", "OPTIONS"}:
        if check.request_body_mode == "json":
            try:
                kwargs["json"] = json.loads(body)
            except json.JSONDecodeError:
                kwargs["content"] = body
        elif check.request_body_mode == "text":
            kwargs["content"] = body
    return kwargs


def _analyze_response_body(response: httpx.Response, body: bytes) -> dict[str, object]:
    content_type = response.headers.get("content-type", "")
    text = body.decode(response.encoding or "utf-8", errors="replace")
    analysis: dict[str, object] = {
        "content_type": content_type,
        "bytes": len(body),
        "characters": len(text),
        "line_count": text.count("\n") + (1 if text else 0),
        "is_json": False,
        "is_html": "text/html" in content_type.lower() or "<html" in text[:500].lower(),
        "is_xml": "xml" in content_type.lower() or text.lstrip().startswith("<?xml"),
        "json_kind": None,
        "json_keys": [],
        "html_title": None,
    }
    if "<title" in text[:4000].lower():
        match = re.search(r"<title[^>]*>(.*?)</title>", text[:4000], re.IGNORECASE | re.DOTALL)
        if match:
            analysis["html_title"] = re.sub(r"\s+", " ", match.group(1)).strip()
    try:
        parsed = json.loads(text)
        analysis["is_json"] = True
        if isinstance(parsed, dict):
            analysis["json_kind"] = "object"
            analysis["json_keys"] = sorted(str(key) for key in list(parsed.keys())[:25])
        elif isinstance(parsed, list):
            analysis["json_kind"] = "array"
            analysis["json_keys"] = [f"items:{len(parsed)}"]
        else:
            analysis["json_kind"] = type(parsed).__name__
    except Exception:
        pass
    return analysis


def _validate_expected_headers(response: httpx.Response, check: CheckConfig) -> tuple[bool, str]:
    for assertion in check.expected_headers:
        actual = response.headers.get(assertion.name)
        if actual is None:
            return False, f"missing expected header: {assertion.name}"
        if actual != assertion.expected_value:
            return False, f"header {assertion.name} mismatch"
    return True, "header validation passed"


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


def _network_path_target(check: CheckConfig) -> tuple[str, int | None, str]:
    if check.url:
        parsed = urlparse(check.url)
        host = parsed.hostname or check.host or ""
        port = check.port or parsed.port or (443 if parsed.scheme == "https" else 80)
        display = check.url
        return host, port, display
    return check.host or "", check.port, check.host or ""


def _compare_assertion(actual: float, operator: str, expected: float) -> bool:
    if operator == "is":
        return math.isclose(actual, expected, rel_tol=0.0, abs_tol=0.01)
    if operator == "<":
        return actual < expected
    if operator == "<=":
        return actual <= expected
    if operator == ">":
        return actual > expected
    if operator == ">=":
        return actual >= expected
    raise ValueError(f"Unsupported assertion operator: {operator}")


def _network_stat_value(stat: dict[str, float], key: str) -> float | None:
    mapping = {"avg": "avg", "min": "min", "max": "max"}
    stat_key = mapping.get(key)
    if stat_key is None:
        return None
    return stat.get(stat_key)


def _compute_latency_stats(samples: list[float]) -> dict[str, float | int]:
    if not samples:
        return {"samples": 0, "min": 0.0, "max": 0.0, "avg": 0.0}
    return {
        "samples": len(samples),
        "min": round(min(samples), 2),
        "max": round(max(samples), 2),
        "avg": round(sum(samples) / len(samples), 2),
    }


def _compute_jitter(samples: list[float]) -> float:
    if len(samples) < 2:
        return 0.0
    deltas = [abs(samples[index] - samples[index - 1]) for index in range(1, len(samples))]
    return round(sum(deltas) / len(deltas), 2)


async def _run_traceroute(host: str, max_ttl: int, timeout_seconds: float) -> dict[str, object]:
    if not host:
        return {"available": False, "message": "no host configured", "hops": []}
    if os.name == "nt":
        command = ["tracert", "-d", "-h", str(max_ttl), host]
    else:
        command = ["traceroute", "-n", "-m", str(max_ttl), host]
    try:
        completed = await asyncio.to_thread(
            subprocess.run,
            command,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except FileNotFoundError:
        return {"available": False, "message": f"{command[0]} is not available on this host", "hops": []}
    except subprocess.TimeoutExpired:
        return {"available": False, "message": "traceroute timed out", "hops": []}
    output = completed.stdout or ""
    error_output = completed.stderr or ""
    hops: list[dict[str, object]] = []
    for line in output.splitlines():
        match = re.match(r"^\s*(\d+)\s+(.*)$", line.strip())
        if not match:
            continue
        hop_number = int(match.group(1))
        rest = match.group(2)
        latencies = [float(item) for item in re.findall(r"(\d+(?:\.\d+)?)\s*ms", rest)]
        address_match = re.search(r"((?:\d{1,3}\.){3}\d{1,3}|[A-Fa-f0-9:]+)$", rest)
        hops.append(
            {
                "hop": hop_number,
                "address": address_match.group(1) if address_match else None,
                "latencies_ms": latencies,
                "avg_latency_ms": round(sum(latencies) / len(latencies), 2) if latencies else None,
                "timeout": "*" in rest and not latencies,
                "raw": line.strip(),
            }
        )
    return {
        "available": True,
        "command": command,
        "message": error_output.strip() or None,
        "hops": hops,
        "raw_output": output[:12000],
    }


def _aggregate_traceroute_hops(traceroute_runs: list[dict[str, object]]) -> list[dict[str, object]]:
    if not traceroute_runs:
        return []
    total_runs = len(traceroute_runs)
    hop_map: dict[int, dict[str, object]] = {}
    for run in traceroute_runs:
        run_hops = run.get("hops") or []
        seen_in_run: set[int] = set()
        for hop in run_hops:
            hop_number = int(hop.get("hop") or 0)
            if hop_number <= 0:
                continue
            entry = hop_map.setdefault(
                hop_number,
                {
                    "hop": hop_number,
                    "address": None,
                    "latencies_ms": [],
                    "raw_samples": [],
                    "traversed_count": 0,
                    "timeout_count": 0,
                },
            )
            seen_in_run.add(hop_number)
            if hop.get("address") and not entry["address"]:
                entry["address"] = hop.get("address")
            latencies = [float(value) for value in (hop.get("latencies_ms") or [])]
            entry["latencies_ms"].extend(latencies)
            entry["raw_samples"].append(hop.get("raw"))
            if latencies or not hop.get("timeout"):
                entry["traversed_count"] += 1
            if hop.get("timeout"):
                entry["timeout_count"] += 1
        observed = {int(h.get("hop") or 0) for h in run_hops if int(h.get("hop") or 0) > 0}
        for hop_number in observed:
            seen_in_run.add(hop_number)
        for hop_number, entry in hop_map.items():
            if hop_number not in seen_in_run and entry["traversed_count"] + entry["timeout_count"] < total_runs:
                entry["timeout_count"] += 1

    aggregated: list[dict[str, object]] = []
    for hop_number in sorted(hop_map):
        entry = hop_map[hop_number]
        latencies = entry["latencies_ms"]
        traversed = int(entry["traversed_count"])
        timeout_count = int(entry["timeout_count"])
        packet_loss_pct = round((timeout_count / max(total_runs, 1)) * 100, 2)
        aggregated.append(
            {
                "hop": hop_number,
                "address": entry["address"],
                "latencies_ms": latencies,
                "avg_latency_ms": round(sum(latencies) / len(latencies), 2) if latencies else None,
                "timeout": traversed == 0,
                "timeout_count": timeout_count,
                "traversed_count": traversed,
                "packet_loss_pct": packet_loss_pct,
                "raw": next((sample for sample in entry["raw_samples"] if sample), None),
            }
        )
    return aggregated


async def _tcp_network_path_queries(host: str, port: int, queries: int, timeout_seconds: float) -> dict[str, object]:
    samples: list[float] = []
    failures: list[str] = []
    attempts: list[dict[str, object]] = []
    for index in range(queries):
        started = time.perf_counter()
        try:
            await _tcp_connect(host, port, timeout_seconds)
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            samples.append(duration_ms)
            attempts.append({"query": index + 1, "success": True, "latency_ms": duration_ms})
        except Exception as exc:
            failures.append(str(exc))
            attempts.append({"query": index + 1, "success": False, "error": str(exc)})
    packet_loss_pct = round(((queries - len(samples)) / max(queries, 1)) * 100, 2)
    return {
        "mode": "tcp",
        "attempts": attempts,
        "latency_ms": _compute_latency_stats(samples),
        "packet_loss_pct": packet_loss_pct,
        "jitter_ms": _compute_jitter(samples),
        "successes": len(samples),
        "failures": len(failures),
        "failure_messages": failures[:10],
    }


async def _icmp_network_path_queries(host: str, queries: int, timeout_seconds: float) -> dict[str, object]:
    timeout_ms = max(1000, int(timeout_seconds * 1000))
    if os.name == "nt":
        command = ["ping", "-n", str(queries), "-w", str(timeout_ms), host]
    else:
        command = ["ping", "-c", str(queries), "-W", str(max(1, int(timeout_seconds))), host]
    try:
        completed = await asyncio.to_thread(
            subprocess.run,
            command,
            capture_output=True,
            text=True,
            timeout=max(timeout_seconds * max(queries, 1), timeout_seconds),
            check=False,
        )
    except FileNotFoundError:
        return {
            "mode": "icmp",
            "available": False,
            "message": f"{command[0]} is not available on this host",
            "latency_ms": _compute_latency_stats([]),
            "packet_loss_pct": 100.0,
            "jitter_ms": 0.0,
            "attempts": [],
        }
    except subprocess.TimeoutExpired:
        return {
            "mode": "icmp",
            "available": False,
            "message": "ping timed out",
            "latency_ms": _compute_latency_stats([]),
            "packet_loss_pct": 100.0,
            "jitter_ms": 0.0,
            "attempts": [],
        }
    output = completed.stdout or ""
    error_output = completed.stderr or ""
    samples = [float(item) for item in re.findall(r"time[=<]\s*(\d+(?:\.\d+)?)\s*ms", output, re.IGNORECASE)]
    packet_loss_match = re.search(r"(\d+)%\s*loss", output, re.IGNORECASE)
    packet_loss_pct = float(packet_loss_match.group(1)) if packet_loss_match else round(((queries - len(samples)) / max(queries, 1)) * 100, 2)
    attempts = [
        {"query": index + 1, "latency_ms": samples[index], "success": True}
        for index in range(len(samples))
    ]
    return {
        "mode": "icmp",
        "available": True,
        "message": error_output.strip() or None,
        "command": command,
        "raw_output": output[:12000],
        "latency_ms": _compute_latency_stats(samples),
        "packet_loss_pct": round(packet_loss_pct, 2),
        "jitter_ms": _compute_jitter(samples),
        "attempts": attempts,
    }


async def _udp_network_path_queries(host: str, port: int, queries: int, timeout_seconds: float) -> dict[str, object]:
    samples: list[float] = []
    failures: list[str] = []
    attempts: list[dict[str, object]] = []
    loop = asyncio.get_running_loop()
    for index in range(queries):
        started = time.perf_counter()
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setblocking(False)
        try:
            await loop.sock_connect(sock, (host, port))
            await loop.sock_sendall(sock, b"asm-network-path")
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            samples.append(duration_ms)
            attempts.append(
                {
                    "query": index + 1,
                    "success": True,
                    "latency_ms": duration_ms,
                    "note": "UDP send completed; no response payload was required.",
                }
            )
        except Exception as exc:
            failures.append(str(exc))
            attempts.append({"query": index + 1, "success": False, "error": str(exc)})
        finally:
            sock.close()
    packet_loss_pct = round(((queries - len(samples)) / max(queries, 1)) * 100, 2)
    return {
        "mode": "udp",
        "available": True,
        "latency_ms": _compute_latency_stats(samples),
        "packet_loss_pct": packet_loss_pct,
        "jitter_ms": _compute_jitter(samples),
        "attempts": attempts,
        "failure_messages": failures[:10],
        "notes": [
            "UDP path timing is measured from socket send completion.",
            "Because UDP is connectionless, this view is best-effort unless the remote service responds.",
        ],
    }


def _network_path_assertions(check: CheckConfig, details: dict[str, object]) -> list[dict[str, object]]:
    config = check.network_path
    if config is None:
        return []
    stats = details.get("stats") or {}
    assertions: list[dict[str, object]] = []
    latency_stats = stats.get("latency_ms") or {}
    hops_stats = stats.get("network_hops") or {}
    packet_loss = float(stats.get("packet_loss_pct") or 0.0)
    jitter = float(stats.get("jitter_ms") or 0.0)
    if config.latency_value is not None:
        actual = _network_stat_value(latency_stats, config.latency_operator_1)
        if actual is not None:
            assertions.append(
                {
                    "name": "latency",
                    "success": _compare_assertion(float(actual), config.latency_operator_2, float(config.latency_value)),
                    "message": f"latency {config.latency_operator_1} {actual} ms {config.latency_operator_2} {config.latency_value} ms",
                }
            )
    if config.packet_loss_value is not None:
        assertions.append(
            {
                "name": "packet_loss",
                "success": _compare_assertion(packet_loss, config.packet_loss_operator, float(config.packet_loss_value)),
                "message": f"packet loss {packet_loss}% {config.packet_loss_operator} {config.packet_loss_value}%",
            }
        )
    if config.jitter_value is not None:
        assertions.append(
            {
                "name": "jitter",
                "success": _compare_assertion(jitter, config.jitter_operator, float(config.jitter_value)),
                "message": f"jitter {jitter} ms {config.jitter_operator} {config.jitter_value} ms",
            }
        )
    if config.hops_value is not None:
        actual = _network_stat_value(hops_stats, config.hops_operator_1)
        if actual is not None:
            assertions.append(
                {
                    "name": "network_hops",
                    "success": _compare_assertion(float(actual), config.hops_operator_2, float(config.hops_value)),
                    "message": f"network hops {config.hops_operator_1} {actual} {config.hops_operator_2} {config.hops_value}",
                }
            )
    return assertions


async def _http_network_probe(target_url: str, timeout_seconds: float) -> dict[str, object]:
    parsed = urlparse(target_url)
    host = parsed.hostname or ""
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    probe: dict[str, object] = {
        "host": host,
        "port": port,
        "scheme": parsed.scheme,
        "dns": {"duration_ms": None, "addresses": []},
        "connect": {"duration_ms": None},
        "tls": {"enabled": parsed.scheme == "https", "duration_ms": None, "version": None, "cipher": None, "alpn_protocol": None},
    }
    if not host:
        return probe

    loop = asyncio.get_running_loop()
    dns_started = time.perf_counter()
    addr_info = await loop.getaddrinfo(
        host,
        port,
        family=socket.AF_UNSPEC,
        type=socket.SOCK_STREAM,
    )
    dns_completed = time.perf_counter()
    addresses = sorted({item[4][0] for item in addr_info if item and item[4]})
    probe["dns"] = {
        "duration_ms": round((dns_completed - dns_started) * 1000, 2),
        "addresses": addresses,
        "record_count": len(addresses),
    }

    connect_started = time.perf_counter()
    reader, writer = await asyncio.wait_for(
        asyncio.open_connection(host, port),
        timeout=timeout_seconds,
    )
    connect_completed = time.perf_counter()
    probe["connect"] = {
        "duration_ms": round((connect_completed - connect_started) * 1000, 2),
        "transport": "tcp",
    }
    writer.close()
    await writer.wait_closed()

    if parsed.scheme == "https":
        context = ssl.create_default_context()
        tls_started = time.perf_counter()
        tls_reader, tls_writer = await asyncio.wait_for(
            asyncio.open_connection(host, port, ssl=context, server_hostname=host),
            timeout=timeout_seconds,
        )
        tls_completed = time.perf_counter()
        ssl_object = tls_writer.get_extra_info("ssl_object")
        cipher = ssl_object.cipher() if ssl_object else None
        probe["tls"] = {
            "enabled": True,
            "duration_ms": round((tls_completed - tls_started) * 1000, 2),
            "version": ssl_object.version() if ssl_object else None,
            "cipher": cipher[0] if cipher else None,
            "alpn_protocol": ssl_object.selected_alpn_protocol() if ssl_object else None,
        }
        tls_writer.close()
        await tls_writer.wait_closed()

    return probe


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


async def run_network_path_check(check: CheckConfig, timeout_seconds: float) -> CheckResult:
    started = time.perf_counter()
    host, derived_port, display_target = _network_path_target(check)
    config = check.network_path
    if config is None:
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=False,
            message="network path monitor requires a network_path block",
            duration_ms=(time.perf_counter() - started) * 1000,
        )
    if not host:
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=False,
            message="network path monitor requires a host or URL",
            duration_ms=(time.perf_counter() - started) * 1000,
        )
    port = check.port or derived_port or (443 if config.request_type == "tcp" else 33434)

    traceroute_runs = []
    traceroute_iterations = max(1, min(config.traceroute_queries, 3))
    for _ in range(traceroute_iterations):
        traceroute_runs.append(await _run_traceroute(host, config.max_ttl, timeout_seconds))
    aggregated_hops = _aggregate_traceroute_hops(traceroute_runs)
    hop_counts = [len(run.get("hops") or []) for run in traceroute_runs if run.get("hops")]
    hop_stats = _compute_latency_stats([float(value) for value in hop_counts]) if hop_counts else {"samples": 0, "min": 0.0, "max": 0.0, "avg": 0.0}

    if config.request_type == "icmp":
        e2e = await _icmp_network_path_queries(host, max(1, config.e2e_queries), timeout_seconds)
    elif config.request_type == "udp":
        e2e = await _udp_network_path_queries(host, int(port), max(1, config.e2e_queries), timeout_seconds)
    else:
        e2e = await _tcp_network_path_queries(host, int(port), max(1, config.e2e_queries), timeout_seconds)

    details: dict[str, object] = {
        "target": {
            "display": display_target,
            "host": host,
            "port": port,
            "source_service": config.source_service,
            "destination_service": config.destination_service,
        },
        "request_type": config.request_type,
        "path": {
            "traces": traceroute_runs,
            "hops": aggregated_hops,
            "traceroute_runs": traceroute_iterations,
        },
        "stats": {
            "latency_ms": e2e.get("latency_ms") or _compute_latency_stats([]),
            "packet_loss_pct": float(e2e.get("packet_loss_pct") or 0.0),
            "jitter_ms": float(e2e.get("jitter_ms") or 0.0),
            "network_hops": hop_stats,
        },
        "queries": {
            "e2e_queries": config.e2e_queries,
            "traceroute_queries": config.traceroute_queries,
        },
        "probe": e2e,
        "tags": config.tags,
        "tcp_traceroute_strategy": config.tcp_traceroute_strategy,
    }
    assertions = _network_path_assertions(check, details)
    details["assertions"] = assertions
    success = all(item["success"] for item in assertions) if assertions else bool((e2e.get("latency_ms") or {}).get("samples"))
    if config.request_type == "icmp" and e2e.get("available") is False:
        success = False
    if config.request_type in {"tcp", "udp"} and e2e.get("failures") == config.e2e_queries and config.e2e_queries > 0:
        success = False
    duration_ms = (time.perf_counter() - started) * 1000
    packet_loss = float(details["stats"]["packet_loss_pct"])
    avg_latency = float((details["stats"]["latency_ms"] or {}).get("avg") or 0.0)
    hop_avg = float((details["stats"]["network_hops"] or {}).get("avg") or 0.0)
    message = (
        f"{config.request_type.upper()} path to {host} "
        f"avg latency {avg_latency:.2f} ms, packet loss {packet_loss:.2f}%, avg hops {hop_avg:.2f}"
    )
    if assertions and not success:
        message = f"{message}; one or more path assertions failed"
    return CheckResult(
        name=check.name,
        check_type=check.type,
        success=success,
        message=message,
        duration_ms=duration_ms,
        details=details,
    )


async def run_http_check(
    client: httpx.AsyncClient, check: CheckConfig, timeout_seconds: float
) -> CheckResult:
    started = time.perf_counter()
    attempts = max(1, int(check.retry.attempts or 1))
    retry_statuses = {int(status) for status in (check.retry.retry_on_statuses or [])}
    last_exception: Exception | None = None
    response: httpx.Response | None = None
    current_attempt = 0
    try:
        probe = await _http_network_probe(_resolved_url(check), timeout_seconds)
        for current_attempt in range(1, attempts + 1):
            try:
                request_started_at = time.perf_counter()
                async with client.stream(
                    check.request_method,
                    _resolved_url(check),
                    timeout=timeout_seconds,
                    follow_redirects=True,
                    **_request_payload_kwargs(check),
                ) as streamed_response:
                    response_headers_received_at = time.perf_counter()
                    response_body = await streamed_response.aread()
                    response_completed_at = time.perf_counter()
                    response = streamed_response
                if response.status_code not in retry_statuses or current_attempt >= attempts:
                    break
            except httpx.TimeoutException as exc:
                last_exception = exc
                if not check.retry.retry_on_timeout or current_attempt >= attempts:
                    raise
            except httpx.RequestError as exc:
                last_exception = exc
                if not check.retry.retry_on_connection_error or current_attempt >= attempts:
                    raise
            if check.retry.delay_seconds > 0 and current_attempt < attempts:
                await asyncio.sleep(check.retry.delay_seconds)

        if response is None:
            if last_exception is not None:
                raise last_exception
            raise RuntimeError("HTTP request did not produce a response")

        assertions: list[dict[str, object]] = []
        final_url = str(response.url)
        request_url = str(response.request.url)
        parsed_final_url = urlparse(final_url)
        response_text = response.text
        redirect_chain = [
            {
                "status_code": item.status_code,
                "url": str(item.url),
                "location": item.headers.get("location"),
            }
            for item in response.history
        ]
        response_analysis = _analyze_response_body(response, response_body)
        response_network_entry = {
            "method": check.request_method,
            "url": final_url,
            "resource_type": "document",
            "started_at": time.time() - max(0.0, (response_completed_at - request_started_at)),
            "status": response.status_code,
            "ok": response.is_success,
            "failure": None,
            "duration_ms": round((response_completed_at - request_started_at) * 1000, 2),
            "timing": {
                "ttfb_ms": round((response_headers_received_at - request_started_at) * 1000, 2),
                "download_ms": round((response_completed_at - response_headers_received_at) * 1000, 2),
                "total_ms": round((response_completed_at - request_started_at) * 1000, 2),
            },
        }
        details = {
            "status_code": response.status_code,
            "request": {
                "method": check.request_method,
                "url": request_url,
                "headers": dict(response.request.headers),
                "body": check.request_body,
                "body_mode": check.request_body_mode,
            },
            "response": {
                "status_code": response.status_code,
                "url": final_url,
                "headers": dict(response.headers),
                "body": response_text[:20000],
                "body_preview": response_text[:4000],
                "analysis": response_analysis,
            },
            "retry": {
                "attempts": current_attempt,
                "max_attempts": attempts,
                "retried": current_attempt > 1,
            },
            "redirects": redirect_chain,
            "network": {
                "entries": [response_network_entry],
                "summary": {
                    "url": final_url,
                    "host": parsed_final_url.hostname,
                    "port": parsed_final_url.port
                    or (443 if parsed_final_url.scheme == "https" else 80 if parsed_final_url.scheme == "http" else None),
                    "scheme": parsed_final_url.scheme,
                    "http_version": getattr(response, "http_version", ""),
                    "redirects": len(response.history),
                    "request_headers_count": len(response.request.headers),
                    "response_headers_count": len(response.headers),
                    "request_body_bytes": len((check.request_body or "").encode("utf-8")) if check.request_body else 0,
                    "response_bytes": len(response_body),
                    "content_type": response.headers.get("content-type"),
                    "server": response.headers.get("server"),
                    "cache_control": response.headers.get("cache-control"),
                    "redirect_chain_length": len(redirect_chain),
                    "ttfb_ms": response_network_entry["timing"]["ttfb_ms"],
                    "download_ms": response_network_entry["timing"]["download_ms"],
                    "total_ms": response_network_entry["timing"]["total_ms"],
                },
                "probe": probe,
            },
            "assertions": assertions,
        }

        if response.status_code not in check.expected_statuses:
            assertions.append(
                {
                    "name": "expected_statuses",
                    "success": False,
                    "message": f"Expected {check.expected_statuses}, got {response.status_code}",
                }
            )
            duration_ms = (time.perf_counter() - started) * 1000
            return CheckResult(
                name=check.name,
                check_type=check.type,
                success=False,
                message=f"unexpected status: {response.status_code}",
                duration_ms=duration_ms,
                details=details,
            )
        assertions.append(
            {
                "name": "expected_statuses",
                "success": True,
                "message": f"Matched status {response.status_code}",
            }
        )

        header_ok, header_message = _validate_expected_headers(response, check)
        if not header_ok:
            assertions.append({"name": "expected_headers", "success": False, "message": header_message})
            duration_ms = (time.perf_counter() - started) * 1000
            return CheckResult(
                name=check.name,
                check_type=check.type,
                success=False,
                message=f"header validation failed: {header_message}",
                duration_ms=duration_ms,
                details=details,
            )
        if check.expected_headers:
            assertions.append({"name": "expected_headers", "success": True, "message": header_message})

        content_ok, content_message = _validate_content(response.text, check)
        duration_ms = (time.perf_counter() - started) * 1000
        details["response_time_assertion_ms"] = check.max_response_time_ms
        if check.max_response_time_ms is not None and duration_ms > float(check.max_response_time_ms):
            assertions.append(
                {
                    "name": "max_response_time_ms",
                    "success": False,
                    "message": (
                        f"Duration {int(duration_ms)} ms exceeded {int(float(check.max_response_time_ms))} ms"
                    ),
                }
            )
            return CheckResult(
                name=check.name,
                check_type=check.type,
                success=False,
                message=(
                    f"response time exceeded assertion: {int(duration_ms)} ms > "
                    f"{int(float(check.max_response_time_ms))} ms"
                ),
                duration_ms=duration_ms,
                details=details,
            )
        if check.max_response_time_ms is not None:
            assertions.append(
                {
                    "name": "max_response_time_ms",
                    "success": True,
                    "message": f"Duration {int(duration_ms)} ms within limit",
                }
            )
        assertions.append(
            {
                "name": "content",
                "success": bool(content_ok),
                "message": content_message,
            }
        )
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=content_ok,
            message=content_message if content_ok else f"content validation failed: {content_message}",
            duration_ms=duration_ms,
            details=details,
        )
    except Exception as exc:
        duration_ms = (time.perf_counter() - started) * 1000
        return CheckResult(
            name=check.name,
            check_type=check.type,
            success=False,
            message=f"http request failed: {exc}",
            duration_ms=duration_ms,
            details={
                "request": {
                    "method": check.request_method,
                    "url": _resolved_url(check),
                    "headers": _merged_request_headers(check),
                    "body": check.request_body,
                    "body_mode": check.request_body_mode,
                },
                "retry": {
                    "attempts": current_attempt,
                    "max_attempts": attempts,
                    "retried": current_attempt > 1,
                },
            },
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

    def _step_locator(page, selector: str):
        return page.locator(selector).first

    async def _goto_with_fallback(page, target_url: str, wait_until: str, timeout_ms: int) -> None:
        strategies = [wait_until]
        if wait_until == "networkidle":
            strategies.extend(["load", "domcontentloaded"])
        elif wait_until == "load":
            strategies.append("domcontentloaded")

        last_error: Exception | None = None
        for index, strategy in enumerate(strategies):
            try:
                await page.goto(target_url, wait_until=strategy, timeout=timeout_ms)
                return
            except PlaywrightTimeoutError as exc:
                last_error = exc
                if index == len(strategies) - 1:
                    raise
            except Exception:
                raise
        if last_error is not None:
            raise last_error

    def _is_benign_page_error(message: str) -> bool:
        normalized = (message or "").lower()
        return (
            "interest-cohort" in normalized
            or "browsingtopics" in normalized
            or "permissions policy denied" in normalized
        )

    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            context_kwargs: dict[str, Any] = {
                "viewport": {
                    "width": browser_config.viewport_width,
                    "height": browser_config.viewport_height,
                },
                "java_script_enabled": browser_config.javascript_enabled,
            }
            if browser_config.persist_auth_session and browser_config.storage_state:
                context_kwargs["storage_state"] = json.loads(browser_config.storage_state)
            context = await browser.new_context(**context_kwargs)
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
                    "started_at": time.time(),
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
                        "started_at": entry["started_at"],
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
                        "started_at": entry["started_at"],
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
                _goto_with_fallback(
                    page,
                    _resolved_url(check),
                    browser_config.wait_until,
                    int(timeout_seconds * 1000),
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
                        _goto_with_fallback(
                            page,
                            step.value or _resolved_url(check),
                            browser_config.wait_until,
                            step_timeout_ms,
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
                        _step_locator(page, step.selector or "").click(timeout=step_timeout_ms),
                    )
                elif step.action == "fill":
                    await record_step(
                        step.name,
                        step.action,
                        _step_locator(page, step.selector or "").fill(step.value or "", timeout=step_timeout_ms),
                    )
                elif step.action == "press":
                    await record_step(
                        step.name,
                        step.action,
                        _step_locator(page, step.selector or "body").press(step.value or "", timeout=step_timeout_ms),
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
        significant_page_errors = [error for error in page_errors if not _is_benign_page_error(error)]
        failed_scripts = [
            entry
            for entry in network_log
            if entry.get("resource_type") == "script" and (entry.get("failure") or entry.get("ok") is False)
        ]
        duration_ms = (time.perf_counter() - started) * 1000
        page_error_failure = browser_config.fail_on_page_errors and bool(significant_page_errors)
        script_error_failure = browser_config.fail_on_script_errors and bool(failed_scripts)
        success = (
            all(step.get("success") for step in step_results)
            and not page_error_failure
            and not script_error_failure
        )
        message = (
            f"browser journey passed with {successful_steps} successful steps"
            if success
            else "browser journey found one or more required step, script, or page failures"
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
                "page_errors": significant_page_errors[-20:],
                "benign_page_errors": [error for error in page_errors if _is_benign_page_error(error)][-20:],
                "script_failures": failed_scripts,
                "fail_on_script_errors": browser_config.fail_on_script_errors,
                "fail_on_page_errors": browser_config.fail_on_page_errors,
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
