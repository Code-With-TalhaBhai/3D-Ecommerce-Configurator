from typing import Annotated, Optional, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class ChatState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    # Set by the guardrail node; routes to the agent or to a canned refusal.
    on_topic: Optional[bool]
