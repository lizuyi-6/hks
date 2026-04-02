from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[4]
DEFAULT_SQLITE_URL = f"sqlite:///{(ROOT_DIR / 'apps' / 'api' / 'test.db').as_posix()}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    app_secret_key: str = "change-me"
    access_token_expire_minutes: int = 120
    database_url: str = DEFAULT_SQLITE_URL
    redis_url: str = "redis://localhost:6379/0"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "noreply@a1plus.local"
    worker_poll_interval: int = 5
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

    provider_trademark_search_mode: str = "real"
    provider_enterprise_lookup_mode: str = "real"
    provider_public_web_search_mode: str = "real"
    provider_knowledge_base_mode: str = "real"
    provider_llm_mode: str = "real"
    provider_document_render_mode: str = "real"
    provider_notification_mode: str = "real"
    provider_monitoring_mode: str = "real"
    provider_submission_guide_mode: str = "real"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.generated_dir.mkdir(parents=True, exist_ok=True)
    return settings

