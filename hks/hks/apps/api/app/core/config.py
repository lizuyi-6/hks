from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[4]
DEFAULT_SQLITE_URL = f"sqlite:///{(ROOT_DIR / 'apps' / 'api' / 'test.db').as_posix()}"

# Placeholder value for ``app_secret_key``. The API refuses to start in any
# non-development environment while this sentinel is in effect, forcing
# operators to provide a real secret via ``APP_SECRET_KEY``.
DEFAULT_APP_SECRET_KEY = "change-me"  # noqa: S105 - intentional placeholder
MIN_APP_SECRET_KEY_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    app_secret_key: str = DEFAULT_APP_SECRET_KEY
    access_token_expire_minutes: int = 120
    database_url: str = DEFAULT_SQLITE_URL
    redis_url: str = "redis://localhost:6379/0"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "noreply@a1plus.local"
    smtp_use_tls: bool = True
    worker_poll_interval: int = 5
    # How long a job is allowed to stay in ``processing`` before the
    # reclaim loop assumes the worker crashed and requeues it. Must be
    # greater than the slowest LLM call + document rendering we perform,
    # or we'll double-execute long diagnosis / trademark jobs.
    worker_job_timeout_seconds: int = 900

    tianyancha_api_key: str = ""
    bing_search_api_key: str = ""
    bing_search_endpoint: str = "https://api.bing.microsoft.com/v7.0/search"
    generated_dir: Path = Field(default=ROOT_DIR / "apps" / "api" / ".generated")
    knowledge_base_dir: Path = Field(default=ROOT_DIR / "knowledge-base")

    feature_monitoring_public_search: bool = False
    feature_monitoring_authorized_api: bool = False
    feature_monitoring_authorized_scrape: bool = False
    feature_competitors: bool = False
    feature_contract_review: bool = False
    feature_patent_assist: bool = False
    feature_policy_digest: bool = False
    feature_due_diligence: bool = False

    # 画像匹配重排模式：rules | embedding
    profile_matching_mode: str = "rules"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    _validate_secret_key(settings)
    settings.generated_dir.mkdir(parents=True, exist_ok=True)
    return settings


def _validate_secret_key(settings: Settings) -> None:
    """Refuse to boot with the placeholder JWT signing key outside development.

    A real deployment MUST set ``APP_SECRET_KEY`` to a long, high-entropy
    value. Leaving the shipped default lets any attacker who knows the
    default forge arbitrary JWTs (including admin tokens).
    """
    env = (settings.app_env or "").strip().lower()
    is_dev = env in {"", "dev", "development", "local", "test", "testing"}
    if settings.app_secret_key == DEFAULT_APP_SECRET_KEY:
        if not is_dev:
            raise RuntimeError(
                "APP_SECRET_KEY is still the default placeholder "
                f"({DEFAULT_APP_SECRET_KEY!r}); set a strong secret before "
                f"running in {settings.app_env!r}."
            )
        return
    if not is_dev and len(settings.app_secret_key) < MIN_APP_SECRET_KEY_LENGTH:
        raise RuntimeError(
            "APP_SECRET_KEY must be at least "
            f"{MIN_APP_SECRET_KEY_LENGTH} characters in {settings.app_env!r}."
        )
