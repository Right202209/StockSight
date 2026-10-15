from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # "development" | "production" | "test". Production flips the strict
    # defaults below (no mock fallback, no API docs).
    environment: str = "development"

    openai_api_key: str = "sk-missing"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"

    # Vite may be opened as either localhost or 127.0.0.1 during local dev.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    database_url: str = "sqlite:///./stocksight.db"
    quote_cache_ttl: int = 30

    # "yfinance" → try Yahoo (preferred). Falls back to "mock" on failure.
    # "mock" → always return deterministic mock data (offline demo).
    stock_data_provider: str = "yfinance"

    # When False, a failed live fetch raises instead of silently returning
    # mock data. Production should set this to False (render.yaml).
    allow_mock_fallback: bool = True

    # Quote cache: bounded LRU, per-process (see quote.py).
    quote_cache_max_entries: int = 512

    # LLM client tuning. The SDK default timeout is 10 minutes — far longer
    # than any user will wait, and it pins a worker thread the whole time.
    llm_timeout_seconds: float = 20.0
    llm_max_tokens: int = 300
    # "json_object" (broad provider support) or "json_schema" (OpenAI
    # Structured Outputs; stricter, but not every compatible provider has it).
    llm_response_format: str = "json_object"

    # Abuse / cost controls. 0 disables a limit.
    rate_limit_analyze_per_min: int = 10
    rate_limit_quote_per_min: int = 60
    analyze_daily_cap: int = 0

    # Reuse a recent analysis when the same cached quote is analyzed again.
    analysis_reuse: bool = False

    enable_api_docs: bool = True

    # "sqlite" (default) or "supabase"
    storage_backend: str = "sqlite"

    # Supabase — only required when storage_backend == "supabase".
    # The service_role key (NOT the publishable / anon key) belongs here so
    # the backend can bypass RLS per PRD §10.6.
    supabase_url: str = ""
    supabase_service_key: str = ""

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in {"production", "prod"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sqlite_path(self) -> str:
        prefix = "sqlite:///"
        if not self.database_url.startswith(prefix):
            raise ValueError(f"Only sqlite:// URLs supported, got {self.database_url}")
        return self.database_url[len(prefix):]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
