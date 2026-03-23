from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import yaml

from service_monitor.secrets import decrypt_config_payload


def _expand_env(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _expand_env(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_expand_env(item) for item in value]
    if isinstance(value, str):
        return os.path.expandvars(value)
    return value


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "y", "on"}:
            return True
        if normalized in {"0", "false", "no", "n", "off", ""}:
            return False
    raise ValueError(f"Cannot parse boolean value from {value!r}")


@dataclass(slots=True)
class DefaultsConfig:
    timeout_seconds: float = 10.0
    user_agent: str = "async-service-monitor/0.1.0"
    peer_timeout_seconds: float = 3.0
    peer_poll_interval_seconds: float = 15.0
    recovery_cooldown_seconds: float = 300.0
    bind_host: str = "0.0.0.0"
    bind_port: int = 8080
    metrics_history_limit: int = 120


@dataclass(slots=True)
class AuthConfig:
    type: Literal["basic", "bearer", "header"]
    username: str | None = None
    password: str | None = None
    token: str | None = None
    header_name: str | None = None
    header_value: str | None = None


@dataclass(slots=True)
class ContentConfig:
    contains: list[str] = field(default_factory=list)
    not_contains: list[str] = field(default_factory=list)
    regex: str | None = None


@dataclass(slots=True)
class UnauthenticatedProbeConfig:
    enabled: bool = False
    expect_statuses: list[int] = field(default_factory=lambda: [401, 403])


@dataclass(slots=True)
class DockerRecoveryConfig:
    enabled: bool = False
    container_name: str | None = None
    restart_signal: str | None = None


@dataclass(slots=True)
class PeerConfig:
    node_id: str
    base_url: str
    enabled: bool = True
    container_name: str | None = None
    monitor_scope: Literal["peer_only", "full"] = "full"
    recovery: DockerRecoveryConfig = field(default_factory=DockerRecoveryConfig)


@dataclass(slots=True)
class ClusterConfig:
    enabled: bool = False
    node_id: str = "monitor-1"
    bind_host: str | None = None
    bind_port: int | None = None
    peers: list[PeerConfig] = field(default_factory=list)


@dataclass(slots=True)
class EmailConfig:
    enabled: bool = False
    provider: Literal["m365", "yahoo", "gmail", "outlook", "custom"] = "custom"
    host: str | None = None
    port: int = 587
    username: str | None = None
    password: str | None = None
    from_address: str | None = None
    to_addresses: list[str] = field(default_factory=list)
    subject_prefix: str = "[async-service-monitor]"
    use_tls: bool = True
    use_ssl: bool = False
    auto_provision_local: bool = False
    local_container_name: str = "async-service-monitor-mailpit"
    local_ui_port: int = 8025


@dataclass(slots=True)
class NotificationsConfig:
    email: EmailConfig = field(default_factory=EmailConfig)


@dataclass(slots=True)
class TelemetryConfig:
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


@dataclass(slots=True)
class PortalUserConfig:
    username: str
    password: str
    first_name: str = ""
    last_name: str = ""
    dark_mode: bool = False
    role: Literal["read_only", "read_write", "admin"] = "read_only"
    enabled: bool = True
    last_login_at: float | None = None


@dataclass(slots=True)
class OCIAuthConfig:
    enabled: bool = False
    tenancy_ocid: str | None = None
    user_ocid: str | None = None
    region: str | None = None
    group_claim: str | None = None


@dataclass(slots=True)
class PortalAuthConfig:
    enabled: bool = True
    provider: Literal["basic", "oci"] = "basic"
    realm: str = "Async Service Monitor"
    users: list[PortalUserConfig] = field(default_factory=list)
    oci: OCIAuthConfig = field(default_factory=OCIAuthConfig)


@dataclass(slots=True)
class CheckConfig:
    name: str
    type: Literal["http", "dns", "auth", "database", "generic"]
    interval_seconds: float
    enabled: bool = True
    placement_mode: Literal["auto", "specific"] = "auto"
    assigned_node_id: str | None = None
    timeout_seconds: float | None = None
    url: str | None = None
    host: str | None = None
    port: int | None = None
    database_name: str | None = None
    database_engine: Literal["mysql"] = "mysql"
    expected_statuses: list[int] = field(default_factory=lambda: [200])
    expect_authenticated_statuses: list[int] = field(default_factory=lambda: [200])
    auth: AuthConfig | None = None
    content: ContentConfig | None = None
    unauthenticated_probe: UnauthenticatedProbeConfig = field(
        default_factory=UnauthenticatedProbeConfig
    )


@dataclass(slots=True)
class AppConfig:
    defaults: DefaultsConfig = field(default_factory=DefaultsConfig)
    cluster: ClusterConfig = field(default_factory=ClusterConfig)
    notifications: NotificationsConfig = field(default_factory=NotificationsConfig)
    telemetry: TelemetryConfig = field(default_factory=TelemetryConfig)
    portal: PortalAuthConfig = field(default_factory=PortalAuthConfig)
    checks: list[CheckConfig] = field(default_factory=list)


def _parse_auth(raw: dict[str, Any] | None) -> AuthConfig | None:
    if not raw:
        return None
    return AuthConfig(
        type=raw["type"],
        username=raw.get("username"),
        password=raw.get("password"),
        token=raw.get("token"),
        header_name=raw.get("header_name"),
        header_value=raw.get("header_value"),
    )


def _parse_content(raw: dict[str, Any] | None) -> ContentConfig | None:
    if not raw:
        return None
    return ContentConfig(
        contains=list(raw.get("contains", [])),
        not_contains=list(raw.get("not_contains", [])),
        regex=raw.get("regex"),
    )


def _parse_probe(raw: dict[str, Any] | None) -> UnauthenticatedProbeConfig:
    if not raw:
        return UnauthenticatedProbeConfig()
    return UnauthenticatedProbeConfig(
        enabled=_as_bool(raw.get("enabled", False)),
        expect_statuses=list(raw.get("expect_statuses", [401, 403])),
    )


def _parse_recovery(raw: dict[str, Any] | None) -> DockerRecoveryConfig:
    if not raw:
        return DockerRecoveryConfig()
    return DockerRecoveryConfig(
        enabled=_as_bool(raw.get("enabled", False)),
        container_name=raw.get("container_name"),
        restart_signal=raw.get("restart_signal"),
    )


def _parse_peer(raw: dict[str, Any]) -> PeerConfig:
    return PeerConfig(
        node_id=raw["node_id"],
        base_url=raw["base_url"].rstrip("/"),
        enabled=_as_bool(raw.get("enabled", True), default=True),
        container_name=raw.get("container_name"),
        monitor_scope=raw.get("monitor_scope", "full"),
        recovery=_parse_recovery(raw.get("recovery")),
    )


def _parse_cluster(raw: dict[str, Any] | None) -> ClusterConfig:
    if not raw:
        return ClusterConfig()
    return ClusterConfig(
        enabled=_as_bool(raw.get("enabled", False)),
        node_id=raw.get("node_id", "monitor-1"),
        bind_host=raw.get("bind_host"),
        bind_port=int(raw["bind_port"]) if raw.get("bind_port") is not None else None,
        peers=[_parse_peer(item) for item in raw.get("peers", [])],
    )


def _parse_email(raw: dict[str, Any] | None) -> EmailConfig:
    if not raw:
        return EmailConfig()
    return EmailConfig(
        enabled=_as_bool(raw.get("enabled", False)),
        provider=raw.get("provider", "custom"),
        host=raw.get("host"),
        port=int(raw.get("port", 587)),
        username=raw.get("username"),
        password=raw.get("password"),
        from_address=raw.get("from_address"),
        to_addresses=list(raw.get("to_addresses", [])),
        subject_prefix=raw.get("subject_prefix", "[async-service-monitor]"),
        use_tls=_as_bool(raw.get("use_tls", True), default=True),
        use_ssl=_as_bool(raw.get("use_ssl", False)),
        auto_provision_local=_as_bool(raw.get("auto_provision_local", False)),
        local_container_name=raw.get("local_container_name", "async-service-monitor-mailpit"),
        local_ui_port=int(raw.get("local_ui_port", 8025)),
    )


def _parse_notifications(raw: dict[str, Any] | None) -> NotificationsConfig:
    if not raw:
        return NotificationsConfig()
    return NotificationsConfig(email=_parse_email(raw.get("email")))


def _parse_telemetry(raw: dict[str, Any] | None) -> TelemetryConfig:
    if not raw:
        return TelemetryConfig()
    return TelemetryConfig(
        enabled=_as_bool(raw.get("enabled", False)),
        provider=raw.get("provider", "local_mysql"),
        host=raw.get("host"),
        port=int(raw.get("port", 3306)),
        database=raw.get("database"),
        username=raw.get("username"),
        password=raw.get("password"),
        retention_hours=int(raw.get("retention_hours", 2)),
        use_ssl=_as_bool(raw.get("use_ssl", False)),
        auto_provision_local=_as_bool(raw.get("auto_provision_local", False)),
        local_container_name=raw.get("local_container_name", "async-service-monitor-mysql"),
    )


def _parse_portal_user(raw: dict[str, Any]) -> PortalUserConfig:
    return PortalUserConfig(
        username=raw["username"],
        password=raw["password"],
        first_name=raw.get("first_name", ""),
        last_name=raw.get("last_name", ""),
        dark_mode=_as_bool(raw.get("dark_mode", False)),
        role=raw.get("role", "read_only"),
        enabled=_as_bool(raw.get("enabled", True), default=True),
        last_login_at=float(raw["last_login_at"]) if raw.get("last_login_at") is not None else None,
    )


def _parse_oci(raw: dict[str, Any] | None) -> OCIAuthConfig:
    if not raw:
        return OCIAuthConfig()
    return OCIAuthConfig(
        enabled=_as_bool(raw.get("enabled", False)),
        tenancy_ocid=raw.get("tenancy_ocid"),
        user_ocid=raw.get("user_ocid"),
        region=raw.get("region"),
        group_claim=raw.get("group_claim"),
    )


def _parse_portal(raw: dict[str, Any] | None) -> PortalAuthConfig:
    if not raw:
        return PortalAuthConfig()
    return PortalAuthConfig(
        enabled=_as_bool(raw.get("enabled", True), default=True),
        provider=raw.get("provider", "basic"),
        realm=raw.get("realm", "Async Service Monitor"),
        users=[_parse_portal_user(item) for item in raw.get("users", [])]
        or PortalAuthConfig().users,
        oci=_parse_oci(raw.get("oci")),
    )


def _parse_check(raw: dict[str, Any]) -> CheckConfig:
    return CheckConfig(
        name=raw["name"],
        type=raw["type"],
        enabled=_as_bool(raw.get("enabled", True), default=True),
        interval_seconds=float(raw["interval_seconds"]),
        placement_mode=raw.get("placement_mode", "auto"),
        assigned_node_id=raw.get("assigned_node_id"),
        timeout_seconds=(
            float(raw["timeout_seconds"]) if raw.get("timeout_seconds") is not None else None
        ),
        url=raw.get("url"),
        host=raw.get("host"),
        port=int(raw["port"]) if raw.get("port") is not None else None,
        database_name=raw.get("database_name"),
        database_engine=raw.get("database_engine", "mysql"),
        expected_statuses=list(raw.get("expected_statuses", [200])),
        expect_authenticated_statuses=list(raw.get("expect_authenticated_statuses", [200])),
        auth=_parse_auth(raw.get("auth")),
        content=_parse_content(raw.get("content")),
        unauthenticated_probe=_parse_probe(raw.get("unauthenticated_probe")),
    )


def validate_config(config: AppConfig) -> None:
    if not config.checks:
        raise ValueError("Configuration must define at least one check.")

    names: set[str] = set()
    for check in config.checks:
        if check.name in names:
            raise ValueError(f"Duplicate check name: {check.name}")
        names.add(check.name)

        if check.interval_seconds <= 0:
            raise ValueError(f"Check '{check.name}' interval_seconds must be > 0")

        if check.placement_mode not in {"auto", "specific"}:
            raise ValueError(
                f"Check '{check.name}' placement_mode must be either 'auto' or 'specific'"
            )
        if check.placement_mode == "specific" and not check.assigned_node_id:
            raise ValueError(
                f"Check '{check.name}' must define assigned_node_id when placement_mode is 'specific'"
            )

        if check.type in {"http", "auth"} and not check.url:
            raise ValueError(f"Check '{check.name}' requires a url")

        if check.type == "dns" and not check.host:
            raise ValueError(f"Check '{check.name}' requires a host")

        if check.type == "auth" and not check.auth:
            raise ValueError(f"Check '{check.name}' requires an auth block")

        if check.type in {"generic", "database"}:
            if not check.host:
                raise ValueError(f"Check '{check.name}' requires a host")
            if check.port is None:
                raise ValueError(f"Check '{check.name}' requires a port")

    if config.cluster.enabled:
        peer_ids = {peer.node_id for peer in config.cluster.peers}
        if not config.cluster.node_id:
            raise ValueError("cluster.node_id is required when cluster is enabled")
        if len(peer_ids) != len(config.cluster.peers):
            raise ValueError("cluster.peers must have unique node_id values")

        assignable_nodes = {config.cluster.node_id}
        assignable_nodes.update(
            peer.node_id for peer in config.cluster.peers if peer.monitor_scope != "peer_only"
        )
        for check in config.checks:
            if check.placement_mode == "specific" and check.assigned_node_id not in assignable_nodes:
                raise ValueError(
                    f"Check '{check.name}' assigned_node_id must reference a full monitoring node"
                )
    else:
        for check in config.checks:
            if (
                check.placement_mode == "specific"
                and check.assigned_node_id
                and check.assigned_node_id != config.cluster.node_id
            ):
                raise ValueError(
                    f"Check '{check.name}' cannot target '{check.assigned_node_id}' while cluster mode is disabled"
                )

    if config.portal.provider == "basic":
        if config.portal.users:
            enabled_users = [user for user in config.portal.users if user.enabled]
            if not enabled_users:
                raise ValueError("portal basic auth requires at least one enabled user")
            if not any(user.role == "admin" for user in enabled_users):
                raise ValueError("portal basic auth requires at least one enabled admin user")

    email = config.notifications.email
    if email.enabled:
        required = [email.host, email.from_address]
        if not all(required) or not email.to_addresses:
            raise ValueError(
                "notifications.email requires host, from_address, and to_addresses"
            )
        if email.port <= 0:
            raise ValueError("notifications.email.port must be > 0")
        if email.local_ui_port <= 0:
            raise ValueError("notifications.email.local_ui_port must be > 0")

    if config.telemetry.enabled:
        required = [
            config.telemetry.host,
            config.telemetry.database,
            config.telemetry.username,
            config.telemetry.password,
        ]
        if not all(required):
            raise ValueError(
                "telemetry requires host, database, username, and password when enabled"
            )
        if config.telemetry.retention_hours <= 0:
            raise ValueError("telemetry.retention_hours must be > 0")


def load_config(path: str | Path) -> AppConfig:
    config_path = Path(path)
    raw = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    raw = decrypt_config_payload(raw)
    raw = _expand_env(raw)

    defaults_raw = raw.get("defaults", {})
    defaults = DefaultsConfig(
        timeout_seconds=float(defaults_raw.get("timeout_seconds", 10.0)),
        user_agent=defaults_raw.get("user_agent", "async-service-monitor/0.1.0"),
        peer_timeout_seconds=float(defaults_raw.get("peer_timeout_seconds", 3.0)),
        peer_poll_interval_seconds=float(
            defaults_raw.get("peer_poll_interval_seconds", 15.0)
        ),
        recovery_cooldown_seconds=float(
            defaults_raw.get("recovery_cooldown_seconds", 300.0)
        ),
        bind_host=defaults_raw.get("bind_host", "0.0.0.0"),
        bind_port=int(defaults_raw.get("bind_port", 8080)),
        metrics_history_limit=int(defaults_raw.get("metrics_history_limit", 120)),
    )

    config = AppConfig(
        defaults=defaults,
        cluster=_parse_cluster(raw.get("cluster")),
        notifications=_parse_notifications(raw.get("notifications")),
        telemetry=_parse_telemetry(raw.get("telemetry")),
        portal=_parse_portal(raw.get("portal")),
        checks=[_parse_check(item) for item in raw.get("checks", [])],
    )

    if config.cluster.bind_host is None:
        config.cluster.bind_host = config.defaults.bind_host
    if config.cluster.bind_port is None:
        config.cluster.bind_port = config.defaults.bind_port
    if config.cluster.enabled:
        config.cluster.peers = [
            peer for peer in config.cluster.peers if peer.node_id != config.cluster.node_id
        ]

    validate_config(config)
    return config
