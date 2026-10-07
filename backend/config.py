from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    openai_timeout_seconds: float = Field(default=20.0, gt=0, le=120)
    analyze_concurrency: int = Field(default=2, ge=1, le=20)

    # Vite may be opened as either localhost or 127.0.0.1 during local dev.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    database_url: str = "sqlite:///./stocksight.db"
    quote_cache_ttl: int = Field(default=30, ge=0, le=3600)
    quote_timeout_seconds: float = Field(default=10.0, gt=0, le=60)
    max_request_bytes: int = Field(default=64 * 1024, ge=1024, le=1024 * 1024)
    analyze_rate_limit: int = Field(default=10, ge=1, le=1000)
    rate_limit_window_seconds: int = Field(default=60, ge=1, le=3600)
    analyze_daily_limit: int = Field(default=500, ge=1, le=100_000)

    # "yfinance" → try Yahoo (preferred). Falls back to "mock" on failure.
    # "mock" → always return deterministic mock data (offline demo).
    stock_data_provider: Literal["yfinance", "mock"] = "yfinance"

    # "sqlite" (default) or "supabase"
    storage_backend: Literal["sqlite", "supabase"] = "sqlite"

    # Supabase — only required when storage_backend == "supabase".
    # The service_role key (NOT the publishable / anon key) belongs here so
    # the backend can bypass RLS per PRD §10.6.
    supabase_url: str = ""
    supabase_service_key: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @field_validator("cors_origins")
    @classmethod
    def _validate_cors_origins(cls, value: str) -> str:
        origins = [origin.strip() for origin in value.split(",") if origin.strip()]
        if not origins or "*" in origins:
            raise ValueError("CORS_ORIGINS must contain one or more explicit origins")
        normalized = []
        for origin in origins:
            parsed = urlparse(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.hostname in {None, "*"}
                or parsed.path not in {"", "/"}
                or parsed.query
                or parsed.fragment
                or parsed.username
                or parsed.password
            ):
                raise ValueError(f"Invalid CORS origin: {origin!r}")
            try:
                port = parsed.port
            except ValueError as exc:
                raise ValueError(f"Invalid CORS origin: {origin!r}") from exc
            host = parsed.hostname or ""
            if ":" in host:
                host = f"[{host}]"
            normalized.append(f"{parsed.scheme}://{host}{f':{port}' if port else ''}")
        return ",".join(dict.fromkeys(normalized))

    @field_validator("database_url")
    @classmethod
    def _validate_database_url(cls, value: str) -> str:
        if not value.startswith("sqlite:///") or value == "sqlite:///":
            raise ValueError("DATABASE_URL must be a non-empty sqlite:/// URL")
        return value

    @property
    def sqlite_path(self) -> str:
        prefix = "sqlite:///"
        if not self.database_url.startswith(prefix):
            raise ValueError(f"Only sqlite:// URLs supported, got {self.database_url}")
        return self.database_url[len(prefix):]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
