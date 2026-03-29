from __future__ import annotations

import base64
import os
import secrets
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

CONFIG_PASSPHRASE_ENV = "ASM_CONFIG_PASSPHRASE"
LOCAL_CONFIG_PASSPHRASE_FILE = ".asm-config-passphrase.env"
ENCRYPTION_METADATA_KEY = "_encryption"
ENCRYPTED_VALUE_PREFIX = "enc::"
PBKDF2_ITERATIONS = 390000
_WILDCARD = "*"
_SENSITIVE_PATHS: tuple[tuple[str, ...], ...] = (
    ("notifications", "email", "username"),
    ("notifications", "email", "password"),
    ("telemetry", "timeseries_username"),
    ("telemetry", "timeseries_password"),
    ("telemetry", "object_access_key"),
    ("telemetry", "object_secret_key"),
    ("portal", "users", _WILDCARD, "username"),
    ("portal", "users", _WILDCARD, "password"),
    ("checks", _WILDCARD, "auth", "username"),
    ("checks", _WILDCARD, "auth", "password"),
    ("checks", _WILDCARD, "auth", "token"),
    ("checks", _WILDCARD, "auth", "header_value"),
    ("checks", _WILDCARD, "browser", "storage_state"),
)


def get_config_passphrase(
    config_path: str | Path | None = None,
    create_if_missing: bool = False,
) -> str | None:
    value = os.getenv(CONFIG_PASSPHRASE_ENV)
    if value:
        return value.strip() or None

    passphrase_file = _passphrase_file(config_path)
    if passphrase_file and passphrase_file.exists():
        for line in passphrase_file.read_text(encoding="utf-8").splitlines():
            if line.startswith(f"{CONFIG_PASSPHRASE_ENV}="):
                return line.split("=", 1)[1].strip() or None

    if create_if_missing and passphrase_file:
        generated = secrets.token_urlsafe(32)
        passphrase_file.write_text(
            f"{CONFIG_PASSPHRASE_ENV}={generated}\n",
            encoding="utf-8",
        )
        return generated

    return None


def decrypt_config_payload(
    payload: dict[str, Any],
    config_path: str | Path | None = None,
) -> dict[str, Any]:
    metadata = payload.get(ENCRYPTION_METADATA_KEY)
    raw_payload = {
        key: value for key, value in payload.items() if key != ENCRYPTION_METADATA_KEY
    }
    if not isinstance(metadata, dict):
        return raw_payload
    if not _contains_encrypted_values(raw_payload):
        return raw_payload

    passphrase = get_config_passphrase(config_path)
    if not passphrase:
        raise ValueError(
            f"Configuration contains encrypted secrets. Set {CONFIG_PASSPHRASE_ENV} before starting the service."
        )

    fernet = _build_fernet(passphrase, _decode_salt(metadata))

    def decryptor(value: str) -> str:
        if not value.startswith(ENCRYPTED_VALUE_PREFIX):
            return value
        token = value.removeprefix(ENCRYPTED_VALUE_PREFIX)
        try:
            return fernet.decrypt(token.encode("utf-8")).decode("utf-8")
        except InvalidToken as exc:
            raise ValueError(
                f"Unable to decrypt configuration secrets. Verify {CONFIG_PASSPHRASE_ENV} is correct."
            ) from exc

    return _transform_sensitive_values(raw_payload, decryptor)


def encrypt_config_payload(
    payload: dict[str, Any],
    config_path: str | Path | None = None,
) -> dict[str, Any]:
    raw_payload = {
        key: value for key, value in payload.items() if key != ENCRYPTION_METADATA_KEY
    }
    if not _has_sensitive_plaintext(raw_payload):
        return raw_payload

    passphrase = get_config_passphrase(config_path, create_if_missing=True)
    if not passphrase:
        raise ValueError(
            f"Sensitive values are present in the config. Set {CONFIG_PASSPHRASE_ENV} before saving so secrets are encrypted at rest."
        )

    salt = secrets.token_bytes(16)
    fernet = _build_fernet(passphrase, salt)

    def encryptor(value: str) -> str:
        if value.startswith(ENCRYPTED_VALUE_PREFIX):
            return value
        token = fernet.encrypt(value.encode("utf-8")).decode("utf-8")
        return f"{ENCRYPTED_VALUE_PREFIX}{token}"

    encrypted_payload = _transform_sensitive_values(raw_payload, encryptor)
    encrypted_payload[ENCRYPTION_METADATA_KEY] = {
        "version": 1,
        "kdf": "pbkdf2_sha256",
        "iterations": PBKDF2_ITERATIONS,
        "salt": base64.urlsafe_b64encode(salt).decode("ascii"),
    }
    return encrypted_payload


def _build_fernet(passphrase: str, salt: bytes) -> Fernet:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    key = base64.urlsafe_b64encode(kdf.derive(passphrase.encode("utf-8")))
    return Fernet(key)


def _decode_salt(metadata: dict[str, Any]) -> bytes:
    salt = metadata.get("salt")
    if not isinstance(salt, str) or not salt:
        raise ValueError("Encrypted config is missing a valid salt value.")
    try:
        return base64.urlsafe_b64decode(salt.encode("ascii"))
    except Exception as exc:
        raise ValueError("Encrypted config contains an invalid salt value.") from exc


def _contains_encrypted_values(payload: Any) -> bool:
    if isinstance(payload, dict):
        return any(_contains_encrypted_values(value) for value in payload.values())
    if isinstance(payload, list):
        return any(_contains_encrypted_values(value) for value in payload)
    return isinstance(payload, str) and payload.startswith(ENCRYPTED_VALUE_PREFIX)


def _has_sensitive_plaintext(payload: Any, path: tuple[str, ...] = ()) -> bool:
    if isinstance(payload, dict):
        return any(
            _has_sensitive_plaintext(value, (*path, key)) for key, value in payload.items()
        )
    if isinstance(payload, list):
        return any(_has_sensitive_plaintext(value, (*path, _WILDCARD)) for value in payload)
    return bool(
        isinstance(payload, str)
        and payload
        and _path_is_sensitive(path)
        and not payload.startswith(ENCRYPTED_VALUE_PREFIX)
        and not _is_env_placeholder(payload)
    )


def _transform_sensitive_values(
    payload: Any,
    transformer,
    path: tuple[str, ...] = (),
) -> Any:
    if isinstance(payload, dict):
        return {
            key: _transform_sensitive_values(value, transformer, (*path, key))
            for key, value in payload.items()
        }
    if isinstance(payload, list):
        return [
            _transform_sensitive_values(value, transformer, (*path, _WILDCARD))
            for value in payload
        ]
    if isinstance(payload, str) and payload and _path_is_sensitive(path):
        if _is_env_placeholder(payload):
            return payload
        return transformer(payload)
    return payload


def _path_is_sensitive(path: tuple[str, ...]) -> bool:
    return any(_path_matches(pattern, path) for pattern in _SENSITIVE_PATHS)


def _path_matches(pattern: tuple[str, ...], path: tuple[str, ...]) -> bool:
    if len(pattern) != len(path):
        return False
    return all(expected == actual or expected == _WILDCARD for expected, actual in zip(pattern, path))


def _is_env_placeholder(value: str) -> bool:
    return value.startswith("${") and value.endswith("}") and len(value) > 3


def _passphrase_file(config_path: str | Path | None) -> Path | None:
    if config_path is None:
        return None
    base_path = Path(config_path)
    directory = base_path if base_path.is_dir() else base_path.parent
    return directory / LOCAL_CONFIG_PASSPHRASE_FILE
