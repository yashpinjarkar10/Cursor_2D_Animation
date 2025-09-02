from typing import TypedDict, Annotated, Optional
import operator

class State(TypedDict):
    """State definition for the LangGraph pipeline."""
    query: str
    story: str
    code: str
    error: Optional[str]  # None if no error
    rag_info: Annotated[list[str], operator.add]  # RAG search results
    websearch_info: Annotated[list[str], operator.add]  # Web search results
    attempt_count: int  # Track retry attempts (default: 0)

def create_initial_state(query: str) -> State:
    """Create initial state for the pipeline."""
    return {
        "query": query,
        "story": "",
        "code": "",
        "error": None,
        "rag_info": [],
        "websearch_info": [],
        "attempt_count": 0
    }