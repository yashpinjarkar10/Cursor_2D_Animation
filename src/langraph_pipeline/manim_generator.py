# ===================================================================
# MANIM CODE GENERATOR MODULE
# ===================================================================
"""
Manim code generation module for the 2D Animation Pipeline.

This module handles the generation of Manim animation code using
RAG (Retrieval Augmented Generation) and web search tools.
"""

import asyncio
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_community.vectorstores import SupabaseVectorStore
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_tavily import TavilySearch
from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from supabase import create_client
from config import get_api_keys, MANIM_SYSTEM_PROMPT
from state import State

# ===================================================================
# MANIM CODE GENERATION FUNCTIONS
# ===================================================================

async def generate_manim_code(scene_description, scene_number):
    """
    Generate Manim code for a single scene using web search + Supabase RAG tools.
    
    This function creates a complete Manim animation script for a given scene
    by leveraging both web search for current information and RAG for Manim
    documentation context.
    
    Args:
        scene_description: Description of the scene to animate
        scene_number: Scene number for identification
        
    Returns:
        Dictionary containing scene number, description, and generated code
    """
    # Get API keys and configuration
    api_keys = get_api_keys()
    
    # ===== TOOL SETUP =====
    
    # Web search tool for current information
    search_tool = TavilySearch(max_results=2)

    # Supabase RAG retriever setup with graceful fallback
    retriever = setup_rag_retriever(api_keys)

    @tool("manim_docs_search")
    def manim_docs_search(query: str) -> str:
        """Search Manim documentation from Supabase vector store and return relevant context."""
        try:
            if retriever is None:
                return "RAG not available: Supabase retriever is not configured."
            docs = retriever.invoke(query)
            return "\n\n".join([d.page_content for d in docs]) if docs else ""
        except Exception as e:
            return f"RAG error: {str(e)}"

    # ===== LANGGRAPH SETUP =====
    
    tools = [search_tool, manim_docs_search]
    
    # Import LLM here to avoid circular imports
    from config import initialize_llm
    llm = initialize_llm()
    llm_with_tools = llm.bind_tools(tools=tools)

    # Local LangGraph setup for tool-enabled LLM processing
    def _llm_node(state):
        result = llm_with_tools.invoke(state["messages"])
        return {"messages": [result]}

    _tool_node = ToolNode(tools)
    _graph_builder = StateGraph(State)
    _graph_builder.add_node("llm_node", _llm_node)
    _graph_builder.add_node("tools", _tool_node)
    _graph_builder.set_entry_point("llm_node")
    _graph_builder.add_conditional_edges("llm_node", tools_condition)
    _graph_builder.add_edge("tools", "llm_node")
    _rag_graph = _graph_builder.compile()

    # ===== CODE GENERATION =====
    
    _resp = _rag_graph.invoke({
        "messages": [
            SystemMessage(content=MANIM_SYSTEM_PROMPT),
            HumanMessage(content=f"Scene {scene_number}: {scene_description}"),
        ]
    })

    # Extract final AI message content as the code
    code_text = extract_code_from_response(_resp)

    return {
        "scene_number": scene_number,
        "description": scene_description,
        "code": (code_text or "").strip(),
    }

async def process_all_scenes(state):
    """
    Process all scenes in parallel to generate Manim code.
    
    Takes the list of scene descriptions and generates Manim code
    for each scene concurrently to improve performance.
    
    Args:
        state: Current pipeline state containing the scenes list
        
    Returns:
        Dictionary with updated manim_codes list
    """
    scenes = state["scenes"]
    
    # Create tasks for parallel processing
    tasks = [
        generate_manim_code(scene, i+1) 
        for i, scene in enumerate(scenes)
    ]
    
    # Execute all tasks in parallel
    results = await asyncio.gather(*tasks)
    
    return {"manim_codes": results}

# ===================================================================
# HELPER FUNCTIONS
# ===================================================================

def setup_rag_retriever(api_keys):
    """
    Setup Supabase RAG retriever with graceful fallback.
    
    Args:
        api_keys: Dictionary containing API keys and URLs
        
    Returns:
        Retriever instance or None if setup fails
    """
    retriever = None
    try:
        if api_keys['supabase_url'] and api_keys['supabase_key'] and api_keys['google_api_key']:
            _supabase = create_client(api_keys['supabase_url'], api_keys['supabase_key'])
            _embeddings = GoogleGenerativeAIEmbeddings(
                model="models/embedding-001",
                google_api_key=api_keys['google_api_key'],
            )
            _vector_store = SupabaseVectorStore(
                embedding=_embeddings,
                client=_supabase,
                table_name="documents",
                query_name="match_documents",
            )
            retriever = _vector_store.as_retriever(search_kwargs={"k": 4})
    except Exception:
        retriever = None
    
    return retriever

def extract_code_from_response(response):
    """
    Extract the final AI message content as code from LangGraph response.
    
    Args:
        response: Response from LangGraph execution
        
    Returns:
        str: Extracted code content
    """
    code_text = ""
    try:
        from langchain_core.messages import AIMessage
        for m in reversed(response.get("messages", [])):
            if isinstance(m, AIMessage):
                code_text = m.content or ""
                break
        if not code_text and response.get("messages"):
            last = response["messages"][-1]
            code_text = getattr(last, "content", "") or ""
    except Exception:
        if response.get("messages"):
            last = response["messages"][-1]
            code_text = getattr(last, "content", "") or ""
    
    return code_text