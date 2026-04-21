"""Persistent CLI configuration stored at `~/.a1plus/config.json`.

Fields: `token`, `api_url`, `email`, `last_session_id`.

Override the config directory with `A1PLUS_CONFIG_DIR` (useful for tests).
Token resolution order (outside this module): `--token` > `A1PLUS_TOKEN` > config file.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

_CONFIG_FILENAME = "config.json"
_DEFAULT_DIR_NAME = ".a1plus"


def config_dir() -> Path:
    override = os.getenv("A1PLUS_CONFIG_DIR")
    if override:
        return Path(override)
    return Path.home() / _DEFAULT_DIR_NAME


def config_path() -> Path:
    return config_dir() / _CONFIG_FILENAME


def load() -> dict[str, Any]:
    path = config_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save(data: dict[str, Any]) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    # Restrict to owner-read/write when the OS supports it (skips on Windows).
    try:
        os.chmod(path, 0o600)
    except (OSError, NotImplementedError):
        pass


def update(**changes: Any) -> dict[str, Any]:
    data = load()
    for key, value in changes.items():
        if value is None:
            data.pop(key, None)
        else:
            data[key] = value
    save(data)
    return data


def clear_token() -> dict[str, Any]:
    return update(token=None, email=None)


def resolve_token(cli_token: str | None) -> str | None:
    """Pick the first non-empty token from CLI > env > config file."""
    if cli_token:
        return cli_token
    env_token = os.getenv("A1PLUS_TOKEN")
    if env_token:
        return env_token
    return load().get("token")


def resolve_api_url(cli_api_url: str | None, default: str) -> str:
    if cli_api_url and cli_api_url != default:
        return cli_api_url
    env_url = os.getenv("A1PLUS_API_URL")
    if env_url:
        return env_url
    return load().get("api_url") or default
