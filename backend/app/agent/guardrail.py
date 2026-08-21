from langchain_core.messages import AIMessage, SystemMessage
from pydantic import BaseModel, Field

from app.agent.llm import get_llm
from app.agent.prompts import GUARDRAIL_SYSTEM_PROMPT
from app.agent.state import ChatState

REFUSAL_MESSAGE = (
    "I can only help with questions about this marketplace — products, "
    "prices, stock, categories, vendors, and active promo codes. Ask me "
    "something about the store and I'll look it up!"
)


class TopicVerdict(BaseModel):
    on_topic: bool = Field(
        description="True if the user's latest message is about this store's "
        "products, prices, stock, categories, vendors, or promo codes."
    )


def classify_topic(state: ChatState) -> dict:
    """Guardrail node: classifies the latest user turn before any tool runs."""
    last_user_message = next(m for m in reversed(state["messages"]) if m.type == "human")
    classifier = get_llm().with_structured_output(TopicVerdict)
    verdict: TopicVerdict = classifier.invoke(
        [SystemMessage(content=GUARDRAIL_SYSTEM_PROMPT), *state["messages"][:-1], last_user_message]
    )
    return {"on_topic": verdict.on_topic}


def refuse(state: ChatState) -> dict:
    return {"messages": [AIMessage(content=REFUSAL_MESSAGE)]}
