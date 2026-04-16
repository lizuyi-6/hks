from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets

import jwt

from apps.api.app.core.config import get_settings


settings = get_settings()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000
    )
    return f"{salt}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    salt, expected = password_hash.split("$", maxsplit=1)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000
    )
    return hmac.compare_digest(expected, digest.hex())


def create_access_token(subject: str, tenant_id: str | None = None, role: str = "member") -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload: dict = {"sub": subject, "exp": expires_at, "role": role}
    if tenant_id:
        payload["tid"] = tenant_id
    return jwt.encode(payload, settings.app_secret_key, algorithm="HS256")


def create_refresh_token(subject: str, tenant_id: str | None = None) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    payload: dict = {"sub": subject, "exp": expires_at, "type": "refresh"}
    if tenant_id:
        payload["tid"] = tenant_id
    return jwt.encode(payload, settings.app_secret_key, algorithm="HS256")


def create_password_reset_token(subject: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    payload = {"sub": subject, "exp": expires_at, "type": "reset"}
    return jwt.encode(payload, settings.app_secret_key, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.app_secret_key, algorithms=["HS256"])


def decode_token_allow_expired(token: str) -> dict | None:
    """Decode token, allowing recently expired tokens for refresh."""
    try:
        return jwt.decode(token, settings.app_secret_key, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        # Allow refresh within a grace period of 30 minutes after expiry
        try:
            payload = jwt.decode(
                token,
                settings.app_secret_key,
                algorithms=["HS256"],
                options={"verify_exp": False},
            )
            exp = datetime.fromtimestamp(payload.get("exp", 0), tz=timezone.utc)
            if datetime.now(timezone.utc) - exp > timedelta(minutes=30):
                return None
            return payload
        except jwt.InvalidTokenError:
            return None
    except jwt.InvalidTokenError:
        return None
