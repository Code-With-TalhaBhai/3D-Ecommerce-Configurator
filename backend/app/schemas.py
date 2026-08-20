from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    # The caller sends the full conversation so far; the graph runs fresh
    # per request (no server-side session store yet).
    messages: list[ChatMessage] = Field(..., min_length=1)


class ChatResponse(BaseModel):
    reply: str
    on_topic: bool
