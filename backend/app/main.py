from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers.chat import router as chat_router

settings = get_settings()

# uv run python -m uvicorn app.main:app --reload
app = FastAPI(title="Marketplace Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
