import tempfile
import subprocess
import os
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import SupabaseVectorStore
from state import State
from prompts import (
    STORY_GENERATION_PROMPT, 
    CODE_GENERATION_PROMPT,
    RAG_QUERY_ENHANCEMENT_PROMPT,
    WEB_SEARCH_ENHANCEMENT_PROMPT
)
from config import get_api_keys

def generate_story(state: State, llm) -> dict:
    """Generate a story from the query."""
    system_message = SystemMessage(content=STORY_GENERATION_PROMPT)
    messages = [system_message, HumanMessage(content=state["query"])]
    response = llm.invoke(messages)
    return {"story": response.content.strip()}

def generate_code(state: State, llm) -> dict:
    """Generate Manim code from the story and context."""
    system_message = SystemMessage(content=CODE_GENERATION_PROMPT)
    
    user_content = f"Story to animate: {state['story']}"
    
    # Add RAG information if available
    rag_info = state.get('rag_info', [])
    if rag_info:
        user_content += f"\n\nRAG Documentation Context:\n" + "\n".join(rag_info)
    
    # Add web search information if available  
    websearch_info = state.get('websearch_info', [])
    if websearch_info:
        user_content += f"\n\nWeb Search Context:\n" + "\n".join(websearch_info)

    messages = [system_message, HumanMessage(content=user_content)]
    response = llm.invoke(messages)
    return {"code": response.content.strip()}

def run_sandbox(state: State) -> dict:
    """Run the generated Manim code in a sandbox."""
    code = state.get("code", "")
    if not code:
        return {"error": "No code to execute."}

    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as tf:
        tf.write(code)
        tf_name = tf.name

    try:
        result = subprocess.run(
            ["manim", "-ql", tf_name, "Scene1"],
            capture_output=True,
            text=True,
            timeout=60
        )

        if result.returncode != 0:
            error_message = result.stderr.strip() or "Unknown execution error."
            return {"error": error_message}

        return {"error": None}

    except subprocess.TimeoutExpired:
        return {"error": "Execution timed out (60s)."}
    except Exception as e:
        return {"error": f"Unexpected error: {e}"}
    finally:
        if os.path.exists(tf_name):
            os.remove(tf_name)

def rag_search(state: State, llm, supabase) -> dict:
    """Search RAG database for relevant context."""
    error = state.get("error")
    if error is None or not error.strip():
        return {"rag_info": ["No error message provided for RAG search."]}
    
    raw_error = error.strip()

    try:
        # Enhance search query using LLM
        query_enhancement_prompt = SystemMessage(content=RAG_QUERY_ENHANCEMENT_PROMPT)
        messages = [query_enhancement_prompt, HumanMessage(content=f"Error message: {raw_error}")]
        response = llm.invoke(messages)
        query_text = response.content.strip() or raw_error

        # Perform vector search
        api_keys = get_api_keys()
        embeddings = GoogleGenerativeAIEmbeddings(
            model="models/embedding-001", 
            google_api_key=api_keys["GOOGLE_API_KEY"]
        )
        vector_store = SupabaseVectorStore(
            embedding=embeddings,
            client=supabase,
            table_name="documents",
            query_name="match_documents",
        )
        matched_docs = vector_store.similarity_search(query_text, k=3)

        results = []
        for doc in matched_docs:
            if hasattr(doc, "page_content"):
                results.append(doc.page_content)
            else:
                results.append(str(doc))

        if not results:
            results = ["No relevant context found in RAG."]

        enhanced_info = [f"Enhanced search query: {query_text}"] + results
        current_attempts = state.get("attempt_count", 0)
        return {"rag_info": enhanced_info, "attempt_count": current_attempts + 1}

    except Exception as e:
        current_attempts = state.get("attempt_count", 0)
        return {"rag_info": [f"RAG search failed: {str(e)}"], "attempt_count": current_attempts + 1}

def web_search(state: State, llm, search_tool) -> dict:
    """Perform web search for relevant information."""
    error = state.get("error")
    story = state.get("story", "")
    
    query_text = error.strip() if error and error.strip() else story.strip()
    
    if not query_text:
        return {"websearch_info": ["No query available for web search."]}

    try:
        # Enhance search query using LLM
        query_enhancement_prompt = SystemMessage(content=WEB_SEARCH_ENHANCEMENT_PROMPT)
        messages = [query_enhancement_prompt, HumanMessage(content=f"Input: {query_text}")]
        response = llm.invoke(messages)
        enhanced_query = response.content.strip() or query_text

        # Perform web search
        results = search_tool.invoke({"query": enhanced_query})
        
        info = []
        for r in results:
            if isinstance(r, dict):
                snippet = r.get("content") or r.get("snippet") or str(r)
                url = r.get("url", "")
                entry = f"{snippet} (Source: {url})" if url else snippet
                info.append(entry)
            else:
                info.append(str(r))

        if not info:
            info = ["No useful results found in web search."]

        enhanced_info = [f"Enhanced search query: {enhanced_query}"] + info
        return {"websearch_info": enhanced_info}

    except Exception as e:
        return {"websearch_info": [f"Web search failed: {str(e)}"]}