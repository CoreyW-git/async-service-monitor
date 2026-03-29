from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import asdict
from typing import Literal

from fastapi import Cookie, HTTPException, Response, status

from service_monitor.config import AppConfig, PortalUserConfig
from service_monitor.config_store import ConfigStore


ROLE_LEVELS: dict[str, int] = {"read_only": 1, "read_write": 2, "admin": 3}
SESSION_COOKIE = "service_monitor_session"


class AuthManager:
    def __init__(self, config_getter, store: ConfigStore) -> None:
        self.config_getter = config_getter
        self.store = store

    def authenticate_optional(self, session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE)) -> dict[str, object]:
        config: AppConfig = self.config_getter()
        if not config.portal.enabled:
            return {
                "authenticated": True,
                "username": "anonymous",
                "first_name": "",
                "last_name": "",
                "dark_mode": False,
                "role": "admin",
                "provider": "disabled",
                "last_login_at": None,
                "setup_required": False,
            }

        if config.portal.provider == "oci":
            return {
                "authenticated": False,
                "provider": "oci",
                "role": "read_only",
                "username": "",
                "setup_required": False,
            }

        if self.bootstrap_required(config):
            return {
                "authenticated": False,
                "provider": config.portal.provider,
                "role": "admin",
                "username": "",
                "setup_required": True,
            }

        if not session_id:
            return {
                "authenticated": False,
                "provider": config.portal.provider,
                "role": "read_only",
                "setup_required": False,
            }

        username = self._read_session_username(config, session_id)
        if not username:
            return {
                "authenticated": False,
                "provider": config.portal.provider,
                "role": "read_only",
                "setup_required": False,
            }

        user = self._find_user(config, username)
        if user is None or not user.enabled:
            return {
                "authenticated": False,
                "provider": config.portal.provider,
                "role": "read_only",
                "setup_required": False,
            }

        return self._user_payload(user, provider=config.portal.provider)

    def require_role(self, minimum_role: Literal["read_only", "read_write", "admin"]):
        def dependency(
            session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE),
        ) -> dict[str, object]:
            current_user = self.authenticate_optional(session_id)
            if not current_user.get("authenticated"):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required",
                )
            if ROLE_LEVELS[str(current_user["role"])] < ROLE_LEVELS[minimum_role]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to perform this action",
                )
            return current_user

        return dependency

    def login(self, response: Response, username: str, password: str) -> dict[str, object]:
        config: AppConfig = self.config_getter()
        if config.portal.provider == "oci":
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="OCI auth scaffold exists but is not implemented yet",
            )
        if self.bootstrap_required(config):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Initial admin setup is required before sign-in is available",
            )

        user = self._find_user(config, username)
        if user is None or not user.enabled or not secrets.compare_digest(user.password, password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
            )

        config = self._ensure_session_secret(config)
        updated_config = self.store.set_user_last_login(user.username, time.time())
        updated_user = self._find_user(updated_config, user.username) or user
        response.set_cookie(
            key=SESSION_COOKIE,
            value=self._build_session_cookie(self._ensure_session_secret(updated_config), user.username),
            httponly=True,
            samesite="lax",
            secure=False,
            path="/",
        )
        return self._user_payload(updated_user, provider=config.portal.provider)

    def logout(self, response: Response, session_id: str | None) -> None:
        response.delete_cookie(SESSION_COOKIE, path="/")

    def register(
        self,
        username: str,
        password: str,
        first_name: str,
        last_name: str,
    ) -> PortalUserConfig:
        config = self.config_getter()
        if self.bootstrap_required(config):
            raise HTTPException(
                status_code=403,
                detail="Initial admin setup must be completed before self-service registration is enabled",
            )
        if self.store.find_user(username) is not None:
            raise HTTPException(status_code=400, detail=f"User '{username}' already exists")
        user = PortalUserConfig(
            username=username,
            password=password,
            first_name=first_name,
            last_name=last_name,
            dark_mode=False,
            role="read_only",
            enabled=True,
        )
        self.store.add_user(user)
        return user

    def reset_password(self, username: str, password: str) -> PortalUserConfig:
        config = self.config_getter()
        if self.bootstrap_required(config):
            raise HTTPException(
                status_code=403,
                detail="Initial admin setup must be completed before password resets are enabled",
            )
        existing = self.store.find_user(username)
        if existing is None:
            raise HTTPException(status_code=404, detail=f"User '{username}' was not found")
        if existing.role == "admin":
            raise HTTPException(
                status_code=403,
                detail="Admin passwords cannot be changed through the public reset flow. Sign in and update the admin password from the profile page instead.",
            )
        updated = PortalUserConfig(
            username=existing.username,
            password=password,
            first_name=existing.first_name,
            last_name=existing.last_name,
            dark_mode=existing.dark_mode,
            role=existing.role,
            enabled=existing.enabled,
            last_login_at=existing.last_login_at,
        )
        self.store.update_user(username, updated)
        return updated

    def bootstrap_admin(
        self,
        response: Response,
        username: str,
        password: str,
        first_name: str,
        last_name: str,
    ) -> dict[str, object]:
        config = self.config_getter()
        if not self.bootstrap_required(config):
            raise HTTPException(status_code=409, detail="Initial admin setup has already been completed")
        if self.store.find_user(username) is not None:
            raise HTTPException(status_code=400, detail=f"User '{username}' already exists")

        user = PortalUserConfig(
            username=username,
            password=password,
            first_name=first_name,
            last_name=last_name,
            dark_mode=False,
            role="admin",
            enabled=True,
            last_login_at=time.time(),
        )
        self.store.add_user(user)
        config = self._ensure_session_secret(self.config_getter())
        response.set_cookie(
            key=SESSION_COOKIE,
            value=self._build_session_cookie(config, user.username),
            httponly=True,
            samesite="lax",
            secure=False,
            path="/",
        )
        return self._user_payload(user, provider=config.portal.provider)

    @staticmethod
    def bootstrap_required(config: AppConfig) -> bool:
        return bool(config.portal.enabled and config.portal.provider == "basic" and not config.portal.users)

    def update_profile(
        self,
        username: str,
        first_name: str,
        last_name: str,
        password: str | None,
        dark_mode: bool | None,
    ) -> PortalUserConfig:
        existing = self.store.find_user(username)
        if existing is None:
            raise HTTPException(status_code=404, detail=f"User '{username}' was not found")
        updated = PortalUserConfig(
            username=existing.username,
            password=password or existing.password,
            first_name=first_name,
            last_name=last_name,
            dark_mode=existing.dark_mode if dark_mode is None else dark_mode,
            role=existing.role,
            enabled=existing.enabled,
            last_login_at=existing.last_login_at,
        )
        self.store.update_user(username, updated)
        return updated

    @staticmethod
    def _find_user(config: AppConfig, username: str) -> PortalUserConfig | None:
        for user in config.portal.users:
            if secrets.compare_digest(user.username, username):
                return user
        return None

    @staticmethod
    def _session_secret(config: AppConfig) -> str | None:
        return config.portal.session_secret

    def _ensure_session_secret(self, config: AppConfig) -> AppConfig:
        if config.portal.session_secret:
            return config
        portal = config.portal
        portal.session_secret = secrets.token_urlsafe(48)
        return self.store.update_portal_settings(portal)

    def _build_session_cookie(self, config: AppConfig, username: str) -> str:
        secret = self._session_secret(config)
        if not secret:
            raise HTTPException(status_code=500, detail="Portal session secret is not configured")
        payload = {
            "u": username,
            "iat": int(time.time()),
        }
        encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")).decode("ascii")
        signature = hmac.new(secret.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).hexdigest()
        return f"{encoded}.{signature}"

    def _read_session_username(self, config: AppConfig, session_id: str | None) -> str | None:
        if not session_id:
            return None
        secret = self._session_secret(config)
        if not secret or "." not in session_id:
            return None
        encoded, signature = session_id.rsplit(".", 1)
        expected = hmac.new(secret.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        try:
            payload = json.loads(base64.urlsafe_b64decode(encoded.encode("ascii")).decode("utf-8"))
        except Exception:
            return None
        username = payload.get("u")
        return str(username) if username else None

    @staticmethod
    def _user_payload(user: PortalUserConfig, provider: str) -> dict[str, object]:
        payload = asdict(user)
        payload.pop("password", None)
        payload["authenticated"] = True
        payload["provider"] = provider
        payload["setup_required"] = False
        return payload
