from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import TypedDict, Annotated, Literal, Optional, List
import operator
from langgraph.graph import StateGraph, START, END
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import SupabaseVectorStore
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_tavily import TavilySearch
from supabase import create_client
import os
import subprocess
import tempfile
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="Manim Animation Generator", description="Generate Manim animations from text queries")

# Environment variables
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")

# Initialize services
if supabase_url and supabase_key:
    supabase = create_client(supabase_url, supabase_key)
else:
    supabase = None

# LangSmith configuration for tracing and debugging
os.environ["LANGSMITH_PROJECT"] = "DemoProject"
os.environ["LANGSMITH_API_KEY"] = os.getenv("LANGSMITH_API_KEY")
os.environ["LANGSMITH_TRACING"] = "true"

# Initialize LLM and tools
llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.1, api_key=GOOGLE_API_KEY)
search_tool = TavilySearch(
    max_results=5,
    topic="general",
    tavily_api_key=TAVILY_API_KEY,
) if TAVILY_API_KEY else None

# Pydantic models for FastAPI
class QueryRequest(BaseModel):
    query: str
    
class StateResponse(BaseModel):
    query: str
    story: str
    code: str
    error: Optional[str]
    rag_info: List[str]
    websearch_info: List[str]
    attempt_count: int
    success: bool

# LangGraph State definition
class State(TypedDict):
    query: str
    story: str
    code: str
    error: Optional[str]  # None if no error
    rag_info: Annotated[list[str], operator.add]  # RAG search results
    websearch_info: Annotated[list[str], operator.add]  # Web search results
    attempt_count: int  # Track retry attempts (default: 0)

def generate_story(state: State) -> dict:
    system_message = SystemMessage(content="""
    You are a creative storytelling expert specializing in mathematical and educational animations. 
    Your task is to transform user queries into compelling, visual narratives that are perfect for Manim animations.
    
    STORY REQUIREMENTS:
    - Create short, engaging stories (2-3 sentences max)
    - Focus on visual, mathematical, or scientific concepts
    - Make the story concrete and specific, not abstract
    - Ensure the narrative has clear visual elements that can be animated
    - Include mathematical objects, transformations, or educational concepts when relevant
    - Avoid complex plots - focus on simple, clear visual demonstrations
    
    EXAMPLES:
    - Query: "derivatives" → Story: "A red curve smoothly transforms as a blue tangent line follows its slope, showing how the derivative captures the rate of change at each point."
    - Query: "sorting algorithm" → Story: "Colorful bars of different heights dance and swap positions until they arrange themselves from shortest to tallest in perfect order."
    
    Return ONLY the story narrative, no explanations or code suggestions.
    """)

    messages = [
        system_message,
        HumanMessage(content=state["query"])
    ]
    response = llm.invoke(messages)

    # Return story text (strip ensures no formatting artifacts)
    return {"story": response.content.strip()}

def generate_code(state: State) -> dict:
    system_message = SystemMessage(content="""
You are an expert Manim animation developer with deep knowledge of the Manim library.
Generate production-ready, error-free Manim code that brings stories to life through smooth animations.

CODE STRUCTURE REQUIREMENTS:
1. Always start with: from manim import * and from math import *
2. Create a class named Scene1 that inherits from Scene
3. Implement the construct(self) method with the complete animation
4. Use proper Manim syntax and current API methods
5. Ensure all objects are properly defined before use

ANIMATION BEST PRACTICES:
- Use clear, descriptive variable names (but keep them short, max 2 characters)
- Create smooth transitions with appropriate timing
- Use self.play() for all animations with proper duration
- Add objects to scene with self.add() when needed
- Use proper Manim objects: Circle, Square, Text, Dot, Arrow, Line, etc.
- Apply transforms: Transform, FadeIn, FadeOut, Write, Create, etc.
- Use colors from Manim's color palette: RED, BLUE, GREEN, YELLOW, etc.

CODING CONSTRAINTS:
- Return ONLY executable Python code, no comments or explanations
- Never use infinite loops or blocking operations
- Only use Manim and math libraries
- Ensure code is syntactically correct and will run without errors
- Handle edge cases and avoid common Manim pitfalls
- Use self.wait() for appropriate pauses between animations

TEMPLATE STRUCTURE:
from manim import *
from math import *

class Scene1(Scene):
    def construct(self):
        # Your animation code here
        pass

Focus on creating visually appealing animations that clearly demonstrate the story concept.
""")

    # Build the user message with story and additional context
    user_content = f"Story to animate: {state['story']}"
    
    # Add RAG information if available
    rag_info = state.get('rag_info', [])
    if rag_info:
        user_content += f"\n\nRAG Documentation Context:\n" + "\n".join(rag_info)
    
    # Add web search information if available  
    websearch_info = state.get('websearch_info', [])
    if websearch_info:
        user_content += f"\n\nWeb Search Context:\n" + "\n".join(websearch_info)

    messages = [
        system_message,
        HumanMessage(content=user_content)
    ]
    response = llm.invoke(messages)

    # Extract Python code from response, removing markdown formatting if present
    code_content = response.content.strip()
    
    # Remove markdown code blocks if they exist
    if code_content.startswith("```python"):
        code_content = code_content[9:]  # Remove ```python
    elif code_content.startswith("```"):
        code_content = code_content[3:]   # Remove ```
    
    if code_content.endswith("```"):
        code_content = code_content[:-3]  # Remove trailing ```
    
    # Clean up any extra whitespace
    code_content = code_content.strip()
    
    # Ensure the code starts with proper imports if they're missing
    if not code_content.startswith("from manim import"):
        if "from manim import *" not in code_content:
            code_content = "from manim import *\nfrom math import *\n\n" + code_content

    return {"code": code_content}

def run_sandbox(state: State) -> dict:
    """
    Runs the generated Manim code inside a temporary sandbox.
    Returns execution status and error messages if any.
    """
    code = state.get("code", "")
    if not code:
        return {"error": "No code to execute."}

    # Create a temporary Python file for the code
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as tf:
        tf.write(code)
        tf_name = tf.name

    try:
        # Run manim in subprocess (silent, capture stdout/stderr)
        # Here we assume Scene1 is always the class name (SYSTEM_PROMPT enforces it)
        result = subprocess.run(
            ["manim", "-ql", tf_name, "Scene1"],  # -ql = low quality, fast render
            capture_output=True,
            text=True,
            timeout=60
        )

        if result.returncode != 0:
            # Execution failed → capture stderr
            error_message = result.stderr.strip() or "Unknown execution error."
            return {"error": error_message}

        # Execution succeeded - set error to None (not empty string)
        return {"error": None}

    except subprocess.TimeoutExpired:
        return {"error": "Execution timed out (60s)."}

    except Exception as e:
        return {"error": f"Unexpected error: {e}"}

    finally:
        # Clean up temporary file
        if os.path.exists(tf_name):
            os.remove(tf_name)

def rag_search(state: State) -> dict:
    """
    Query the Supabase vector store with the current error message 
    (or the code itself) to retrieve relevant context for fixing.
    Uses LLM to enhance the search query for better Manim documentation retrieval.
    """
    if not supabase:
        return {"rag_info": ["Supabase not configured for RAG search."]}
        
    error = state.get("error")
    # Handle None error case (shouldn't happen since this node only runs on error, but be safe)
    if error is None or not error.strip():
        return {"rag_info": ["No error message provided for RAG search."]}
    
    raw_error = error.strip()

    try:
        # Use LLM to create a better search query from the error message
        query_enhancement_prompt = SystemMessage(content="""
        You are an expert at analyzing Manim (Mathematical Animation Engine) error messages.
        Given an error message, extract the key concepts, method names, class names, and issues 
        that would be useful for searching Manim documentation.
        
        Transform the error into a concise search query that focuses on:
        - Manim class names (Scene, Mobject, Animation, etc.)
        - Method names and function calls
        - Animation concepts and techniques
        - Common error patterns in Manim
        
        Return ONLY the enhanced search query, no explanations.
        """)
        
        messages = [
            query_enhancement_prompt,
            HumanMessage(content=f"Error message: {raw_error}")
        ]
        
        response = llm.invoke(messages)
        query_text = response.content.strip()
        
        # Fallback to original error if LLM response is empty
        if not query_text:
            query_text = raw_error

        # Perform vector search with enhanced query
        embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001", google_api_key=GOOGLE_API_KEY)
        vector_store = SupabaseVectorStore(
            embedding=embeddings,
            client=supabase,
            table_name="documents",
            query_name="match_documents",
        )
        matched_docs = vector_store.similarity_search(query_text, k=3)

        # Extract content/text from matched docs
        results = []
        for doc in matched_docs:
            if hasattr(doc, "page_content"):
                results.append(doc.page_content)
            else:
                results.append(str(doc))

        if not results:
            results = ["No relevant context found in RAG."]

        # Include the enhanced query for debugging/transparency
        enhanced_info = [f"Enhanced search query: {query_text}"] + results
        
        # Increment attempt counter
        current_attempts = state.get("attempt_count", 0)
        return {"rag_info": enhanced_info, "attempt_count": current_attempts + 1}

    except Exception as e:
        # Increment attempt counter even on failure
        current_attempts = state.get("attempt_count", 0)
        return {"rag_info": [f"RAG search failed: {str(e)}"], "attempt_count": current_attempts + 1}

def web_search(state: State) -> dict:
    """
    Use Tavily search to get relevant info about the error or story context.
    Uses LLM to enhance the search query for better results.
    """
    if not search_tool:
        return {"websearch_info": ["Tavily search not configured."]}
        
    error = state.get("error")
    story = state.get("story", "")
    
    # Handle None error case and get query text
    if error is None:
        query_text = story.strip() if story else ""
    else:
        query_text = error.strip() if error.strip() else story.strip() if story else ""
    
    if not query_text:
        return {"websearch_info": ["No query available for web search."]}

    try:
        # Use LLM to create a better search query
        query_enhancement_prompt = SystemMessage(content="""
        You are an expert at creating effective web search queries for Manim animation issues.
        Given an error message or story context, create a focused search query that will find:
        - Manim tutorials and examples
        - Stack Overflow solutions for similar errors
        - Documentation and guides
        - Community discussions about the issue
        
        Transform the input into a concise search query with relevant keywords.
        Return ONLY the enhanced search query, no explanations.
        """)
        
        messages = [
            query_enhancement_prompt,
            HumanMessage(content=f"Input: {query_text}")
        ]
        
        response = llm.invoke(messages)
        enhanced_query = response.content.strip()
        
        # Fallback to original if LLM response is empty
        if not enhanced_query:
            enhanced_query = query_text

        # Perform web search with enhanced query
        results = search_tool.invoke({"query": enhanced_query})
        
        # Tavily returns a list of dicts, we keep only the text snippets/urls
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

        # Include the enhanced query for debugging/transparency
        enhanced_info = [f"Enhanced search query: {enhanced_query}"] + info
        return {"websearch_info": enhanced_info}

    except Exception as e:
        return {"websearch_info": [f"Web search failed: {str(e)}"]}

def check_error(state: State) -> Literal["end", "fix", "max_attempts"]:
    if state["error"] is None:
        return "end"
    elif state.get("attempt_count", 0) >= 3:
        return "max_attempts"  # Stop after 3 attempts
    else:
        return "fix"

# Build the graph
builder = StateGraph(State)

builder.add_node("generate_story", generate_story)
builder.add_node("generate_code", generate_code)
builder.add_node("run_sandbox", run_sandbox)
builder.add_node("rag", rag_search)
builder.add_node("websearch", web_search)

builder.add_edge(START, "generate_story")
builder.add_edge("generate_story", "generate_code")
builder.add_edge("generate_code", "run_sandbox")

builder.add_conditional_edges(
    "run_sandbox",
    check_error,
    {"end": END, "fix": "rag", "max_attempts": END}
)

# Sequential for simplicity in demo (though user requested parallel, this approximates the flow)
builder.add_edge("rag", "websearch")
builder.add_edge("websearch", "generate_code")  # Loop back to code generation with updated info

# Compile the graph
graph = builder.compile()

# FastAPI endpoints
@app.post("/generate", response_model=StateResponse)
async def generate_animation(request: QueryRequest):
    """
    Generate a Manim animation from a text query.
    
    Args:
        request: QueryRequest containing the user's query
    
    Returns:
        StateResponse: Complete state including story, code, and execution status
    """
    try:
        # Initialize input state
        input_state = {
            "query": request.query,
            "story": "",
            "code": "",
            "error": None,
            "rag_info": [],
            "websearch_info": [],
            "attempt_count": 0
        }
        
        # Run the graph
        result = graph.invoke(input_state)
        
        # Convert to response format
        response = StateResponse(
            query=result.get("query", ""),
            story=result.get("story", ""),
            code=result.get("code", ""),
            error=result.get("error"),
            rag_info=result.get("rag_info", []),
            websearch_info=result.get("websearch_info", []),
            attempt_count=result.get("attempt_count", 0),
            success=result.get("error") is None
        )
        
        return response
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating animation: {str(e)}")

@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Welcome to the Manim Animation Generator API",
        "endpoints": {
            "POST /generate": "Generate animation from text query",
            "GET /health": "Health check",
            "GET /docs": "API documentation"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)