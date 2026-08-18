from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from app.agent.agent_node import call_agent
from app.agent.guardrail import classify_topic, refuse
from app.agent.state import ChatState
from app.agent.tools import TOOLS


def _route_on_topic(state: ChatState) -> str:
    return "agent" if state.get("on_topic") else "refuse"


def build_graph():
    graph = StateGraph(ChatState)
    graph.add_node("guardrail", classify_topic)
    graph.add_node("agent", call_agent)
    graph.add_node("tools", ToolNode(TOOLS))
    graph.add_node("refuse", refuse)

    graph.add_edge(START, "guardrail")
    graph.add_conditional_edges("guardrail", _route_on_topic, {"agent": "agent", "refuse": "refuse"})
    graph.add_conditional_edges("agent", tools_condition, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")
    graph.add_edge("refuse", END)

    return graph.compile()


chat_graph = build_graph()
