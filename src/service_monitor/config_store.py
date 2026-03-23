from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any

import yaml

from service_monitor.config import (
    AppConfig,
    CheckConfig,
    EmailConfig,
    OCIAuthConfig,
    PeerConfig,
    PortalAuthConfig,
    PortalUserConfig,
    TelemetryConfig,
    load_config,
    validate_config,
)


def _strip_none(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _strip_none(item)
            for key, item in value.items()
            if item is not None and item != []
        }
    if isinstance(value, list):
        return [_strip_none(item) for item in value]
    return value


class ConfigStore:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def load(self) -> AppConfig:
        return load_config(self.path)

    def save(self, config: AppConfig) -> None:
        validate_config(config)
        payload = _strip_none(asdict(config))
        self.path.write_text(
            yaml.safe_dump(payload, sort_keys=False, default_flow_style=False),
            encoding="utf-8",
        )

    def add_check(self, check: CheckConfig) -> AppConfig:
        config = self.load()
        if any(existing.name == check.name for existing in config.checks):
            raise ValueError(f"Check with name '{check.name}' already exists")
        config.checks.append(check)
        self.save(config)
        return config

    def update_check(self, check_name: str, updated_check: CheckConfig) -> AppConfig:
        config = self.load()
        for index, existing in enumerate(config.checks):
            if existing.name == check_name:
                if updated_check.name != check_name and any(
                    other.name == updated_check.name for other in config.checks
                ):
                    raise ValueError(f"Check with name '{updated_check.name}' already exists")
                config.checks[index] = updated_check
                self.save(config)
                return config
        raise ValueError(f"Check '{check_name}' was not found")

    def delete_check(self, check_name: str) -> AppConfig:
        config = self.load()
        updated_checks = [check for check in config.checks if check.name != check_name]
        if len(updated_checks) == len(config.checks):
            raise ValueError(f"Check '{check_name}' was not found")
        config.checks = updated_checks
        self.save(config)
        return config

    def set_check_enabled(self, check_name: str, enabled: bool) -> AppConfig:
        config = self.load()
        for check in config.checks:
            if check.name == check_name:
                check.enabled = enabled
                self.save(config)
                return config
        raise ValueError(f"Check '{check_name}' was not found")

    def add_peer(self, peer: PeerConfig) -> AppConfig:
        config = self.load()
        if any(existing.node_id == peer.node_id for existing in config.cluster.peers):
            raise ValueError(f"Peer with node_id '{peer.node_id}' already exists")
        config.cluster.enabled = True
        config.cluster.peers.append(peer)
        self.save(config)
        return config

    def update_peer(self, node_id: str, updated_peer: PeerConfig) -> AppConfig:
        config = self.load()
        for index, existing in enumerate(config.cluster.peers):
            if existing.node_id == node_id:
                if updated_peer.node_id != node_id and any(
                    peer.node_id == updated_peer.node_id for peer in config.cluster.peers
                ):
                    raise ValueError(f"Peer with node_id '{updated_peer.node_id}' already exists")
                config.cluster.peers[index] = updated_peer
                self.save(config)
                return config
        raise ValueError(f"Peer '{node_id}' was not found")

    def delete_peer(self, node_id: str) -> AppConfig:
        config = self.load()
        updated_peers = [peer for peer in config.cluster.peers if peer.node_id != node_id]
        if len(updated_peers) == len(config.cluster.peers):
            raise ValueError(f"Peer '{node_id}' was not found")
        config.cluster.peers = updated_peers
        self.save(config)
        return config

    def set_peer_enabled(self, node_id: str, enabled: bool) -> AppConfig:
        config = self.load()
        for peer in config.cluster.peers:
            if peer.node_id == node_id:
                peer.enabled = enabled
                self.save(config)
                return config
        raise ValueError(f"Peer '{node_id}' was not found")

    def add_user(self, user: PortalUserConfig) -> AppConfig:
        config = self.load()
        if any(existing.username == user.username for existing in config.portal.users):
            raise ValueError(f"User '{user.username}' already exists")
        config.portal.users.append(user)
        self.save(config)
        return config

    def update_user(self, username: str, updated_user: PortalUserConfig) -> AppConfig:
        config = self.load()
        for index, existing in enumerate(config.portal.users):
            if existing.username == username:
                if updated_user.username != username and any(
                    user.username == updated_user.username for user in config.portal.users
                ):
                    raise ValueError(f"User '{updated_user.username}' already exists")
                config.portal.users[index] = updated_user
                enabled_admins = [
                    user for user in config.portal.users if user.enabled and user.role == "admin"
                ]
                if config.portal.provider == "basic" and not enabled_admins:
                    raise ValueError("At least one enabled admin user is required")
                self.save(config)
                return config
        raise ValueError(f"User '{username}' was not found")

    def delete_user(self, username: str) -> AppConfig:
        config = self.load()
        updated_users = [user for user in config.portal.users if user.username != username]
        if len(updated_users) == len(config.portal.users):
            raise ValueError(f"User '{username}' was not found")
        enabled_admins = [
            user for user in updated_users if user.enabled and user.role == "admin"
        ]
        if config.portal.provider == "basic" and not enabled_admins:
            raise ValueError("Cannot delete the last enabled admin user")
        config.portal.users = updated_users
        self.save(config)
        return config

    def find_user(self, username: str) -> PortalUserConfig | None:
        config = self.load()
        for user in config.portal.users:
            if user.username == username:
                return user
        return None

    def set_user_last_login(self, username: str, timestamp: float) -> AppConfig:
        config = self.load()
        for user in config.portal.users:
            if user.username == username:
                user.last_login_at = timestamp
                self.save(config)
                return config
        raise ValueError(f"User '{username}' was not found")

    def update_telemetry(self, telemetry: TelemetryConfig) -> AppConfig:
        config = self.load()
        config.telemetry = telemetry
        self.save(config)
        return config

    def update_email_settings(self, email: EmailConfig) -> AppConfig:
        config = self.load()
        config.notifications.email = email
        self.save(config)
        return config

    def update_portal_settings(self, portal: PortalAuthConfig) -> AppConfig:
        config = self.load()
        config.portal.enabled = portal.enabled
        config.portal.provider = portal.provider
        config.portal.realm = portal.realm
        config.portal.oci = OCIAuthConfig(
            enabled=portal.oci.enabled,
            tenancy_ocid=portal.oci.tenancy_ocid,
            user_ocid=portal.oci.user_ocid,
            region=portal.oci.region,
            group_claim=portal.oci.group_claim,
        )
        self.save(config)
        return config
