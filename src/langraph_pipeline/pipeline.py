from typing import Literal
from langgraph.graph import StateGraph, START, END
from state import State
from nodes import generate_story, generate_code, run_sandbox, rag_search, web_search

def check_error(state: State) -> Literal["end", "fix", "max_attempts"]:
    """Check if there's an error and determine next step."""
    if state["error"] is None:
        return "end"
    elif state.get("attempt_count", 0) >= 3:
        return "max_attempts"
    else:
        return "fix"

def create_pipeline(llm, search_tool, supabase):
    """Create and compile the LangGraph pipeline."""
    
    # Create wrapper functions with dependencies injected
    def _generate_story(state: State) -> dict:
        return generate_story(state, llm)
    
    def _generate_code(state: State) -> dict:
        return generate_code(state, llm)
    
    def _rag_search(state: State) -> dict:
        return rag_search(state, llm, supabase)
    
    def _web_search(state: State) -> dict:
        return web_search(state, llm, search_tool)
    
    # Build the graph
    builder = StateGraph(State)

    builder.add_node("generate_story", _generate_story)
    builder.add_node("generate_code", _generate_code)
    builder.add_node("run_sandbox", run_sandbox)
    builder.add_node("rag", _rag_search)
    builder.add_node("websearch", _web_search)

    builder.add_edge(START, "generate_story")
    builder.add_edge("generate_story", "generate_code")
    builder.add_edge("generate_code", "run_sandbox")

    builder.add_conditional_edges(
        "run_sandbox",
        check_error,
        {"end": END, "fix": "rag", "max_attempts": END}
    )

    builder.add_edge("rag", "websearch")
    builder.add_edge("websearch", "generate_code")

    return builder.compile()