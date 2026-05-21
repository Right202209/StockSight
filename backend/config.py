from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openai_api_key: str = "sk-missing"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"

    cors_origins: str = "http://localhost:5173"

    database_url: str = "sqlite:///./stocksight.db"
    quote_cache_ttl: int = 30

    # "yfinance" → try Yahoo (preferred). Falls back to "mock" on failure.
    # "mock" → always return deterministic mock data (offline demo).
    stock_data_provider: str = "yfinance"

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
