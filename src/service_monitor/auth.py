from __future__ import annotations

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
        self.sessions: dict[str, str] = {}

    def authenticate_optional(self, session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE)) -> dict[str, object]:
        config: AppConfig = self.config_getter()
        if not config.portal.enabled:
            return {
                "authenticated": True,
                "username": "anonymous",
                "first_name": "",
                "last_name": "",
                "role": "admin",
                "provider": "disabled",
                "last_login_at": None,
            }

        if config.portal.provider == "oci":
            return {
                "authenticated": False,
                "provider": "oci",
                "role": "read_only",
                "username": "",
            }

        if not session_id:
            return {"authenticated": False, "provider": config.portal.provider, "role": "read_only"}

        username = self.sessions.get(session_id)
        if not username:
            return {"authenticated": False, "provider": config.portal.provider, "role": "read_only"}

        user = self._find_user(config, username)
        if user is None or not user.enabled:
            self.sessions.pop(session_id, None)
            return {"authenticated": False, "provider": config.portal.provider, "role": "read_only"}

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

        user = self._find_user(config, username)
        if user is None or not user.enabled or not secrets.compare_digest(user.password, password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
            )

        session_id = secrets.token_urlsafe(32)
        self.sessions[session_id] = user.username
        updated_config = self.store.set_user_last_login(user.username, time.time())
        updated_user = self._find_user(updated_config, user.username) or user
        response.set_cookie(
            key=SESSION_COOKIE,
            value=session_id,
            httponly=True,
            samesite="lax",
            secure=False,
            path="/",
        )
        return self._user_payload(updated_user, provider=config.portal.provider)

    def logout(self, response: Response, session_id: str | None) -> None:
        if session_id:
            self.sessions.pop(session_id, None)
        response.delete_cookie(SESSION_COOKIE, path="/")

    def register(
        self,
        username: str,
        password: str,
        first_name: str,
        last_name: str,
    ) -> PortalUserConfig:
        if self.store.find_user(username) is not None:
            raise HTTPException(status_code=400, detail=f"User '{username}' already exists")
        user = PortalUserConfig(
            username=username,
            password=password,
            first_name=first_name,
            last_name=last_name,
            role="read_only",
            enabled=True,
        )
        self.store.add_user(user)
        return user

    def reset_password(self, username: str, password: str) -> PortalUserConfig:
        existing = self.store.find_user(username)
        if existing is None:
            raise HTTPException(status_code=404, detail=f"User '{username}' was not found")
        updated = PortalUserConfig(
            username=existing.username,
            password=password,
            first_name=existing.first_name,
            last_name=existing.last_name,
            role=existing.role,
            enabled=existing.enabled,
            last_login_at=existing.last_login_at,
        )
        self.store.update_user(username, updated)
        return updated

    def update_profile(
        self,
        username: str,
        first_name: str,
        last_name: str,
        password: str | None,
    ) -> PortalUserConfig:
        existing = self.store.find_user(username)
        if existing is None:
            raise HTTPException(status_code=404, detail=f"User '{username}' was not found")
        updated = PortalUserConfig(
            username=existing.username,
            password=password or existing.password,
            first_name=first_name,
            last_name=last_name,
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
    def _user_payload(user: PortalUserConfig, provider: str) -> dict[str, object]:
        payload = asdict(user)
        payload.pop("password", None)
        payload["authenticated"] = True
        payload["provider"] = provider
        return payload
