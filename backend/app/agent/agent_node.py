from langchain_core.messages import SystemMessage

from app.agent.llm import get_llm
from app.agent.prompts import AGENT_SYSTEM_PROMPT
from app.agent.state import ChatState
from app.agent.tools import TOOLS


def call_agent(state: ChatState) -> dict:
    llm = get_llm().bind_tools(TOOLS)
    response = llm.invoke([SystemMessage(content=AGENT_SYSTEM_PROMPT), *state["messages"]])
    return {"messages": [response]}
