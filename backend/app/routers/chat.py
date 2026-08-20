from fastapi import APIRouter
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from app.agent.graph import chat_graph
from app.schemas import ChatMessage, ChatRequest, ChatResponse

router = APIRouter(prefix="/chat", tags=["chat"])


def _to_lc_messages(messages: list[ChatMessage]) -> list[BaseMessage]:
    return [HumanMessage(content=m.content) if m.role == "user" else AIMessage(content=m.content) for m in messages]


@router.post("", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    result = await chat_graph.ainvoke({"messages": _to_lc_messages(payload.messages), "on_topic": None})
    last = result["messages"][-1]
    return ChatResponse(reply=last.content, on_topic=bool(result.get("on_topic")))
