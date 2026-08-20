from functools import lru_cache

from langchain_groq import ChatGroq

from app.config import get_settings


@lru_cache
def get_llm(temperature: float = 0.0) -> ChatGroq:
    settings = get_settings()
    return ChatGroq(
        model=settings.groq_model,
        api_key=settings.groq_api_key,
        temperature=temperature,
    )
