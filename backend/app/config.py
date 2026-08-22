from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Same Supabase Postgres pooled connection string the Next.js app uses
    # (see ../.env DATABASE_URL). The chatbot only ever reads from it.
    database_url: str

    # Groq credentials for the LangGraph agent's LLM calls.
    groq_api_key: str = ""
    groq_model: str

    cors_origins: list[str]


@lru_cache
def get_settings() -> Settings:
    return Settings()
