from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Same Supabase Postgres pooled connection string the Next.js app uses
    # (see ../.env DATABASE_URL). The chatbot only ever reads from it.
    database_url: str

    # Groq (fast LPU inference, open-weight models) credentials for the
    # LangGraph agent's LLM calls. Not to be confused with xAI's "Grok" —
    # different company, different models. See console.groq.com for keys
    # and the current model roster (models get deprecated fairly often).
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
