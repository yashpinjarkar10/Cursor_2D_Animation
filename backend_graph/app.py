"""
Manim Video Generation API
A FastAPI application that generates Manim animations from text queries using LangGraph.
"""

import os
import sys
import tempfile
import subprocess
import shutil
import base64
from pathlib import Path
from typing import TypedDict, Annotated, Optional, List
from dotenv import load_dotenv

# FastAPI imports
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

# LangGraph and LangChain imports
from langgraph.graph import StateGraph, START, END
from typing import Literal
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

# Import prompts from separate module
from prompts import (
    STORY_GENERATION_PROMPT,
    SYNTAX_QUESTIONS_PROMPT,
    CODE_GENERATION_PROMPT,
    CODE_FIXING_PROMPT,
    FALLBACK_SYNTAX_QUESTIONS
)

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="Manim Video Generator",
    description="Generate educational Manim animations from text queries using LangGraph and RAG",
    version="2.0.0"
)

# Environment variables
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if GOOGLE_API_KEY:
    GOOGLE_API_KEY = GOOGLE_API_KEY.strip().strip('"').strip("'")

# Initialize LLMs - different models for different tasks
# Fast model for simple tasks (story, questions)
llm_fast = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.3,
    api_key=GOOGLE_API_KEY
)

# Better model for code generation (needs to follow complex instructions)
llm_code = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.2,  # Lower temperature for more deterministic code
    api_key=GOOGLE_API_KEY
)


# Get the directory where this script is located
SCRIPT_DIR = Path(__file__).parent.resolve()

# Initialize ChromaDB vector store for RAG
CHROMA_DB_PATH = str(SCRIPT_DIR / "chroma_db_manim")
embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2",
    model_kwargs={'device': 'cpu'},
    encode_kwargs={'normalize_embeddings': True}
) 

# Load vector store
try:
    vectorstore = Chroma(
        persist_directory=CHROMA_DB_PATH,
        embedding_function=embeddings,
        collection_name="manim_docs"
    )
    print("✓ ChromaDB vector store loaded successfully")
except Exception as e:
    print(f"⚠ Warning: Could not load ChromaDB vector store: {e}")
    vectorstore = None

# Create output directory for videos
OUTPUT_DIR = Path("./generated_videos")
OUTPUT_DIR.mkdir(exist_ok=True)

# Pydantic models for API
class QueryRequest(BaseModel):
    query: str

# LangGraph State definition
class State(TypedDict):
    query: str
    story: str
    syntax_questions: List[str]
    rag_responses: List[str]
    code: str
    video_path: Optional[str]
    error: Optional[str]
    attempt_count: int
    temp_file_path: Optional[str]


# ============================================================================
# NODE 1: Generate Story
# ============================================================================
def generate_story(state: State) -> dict:
    """
    Generate an educational story/narrative for the animation based on user query.
    The story should describe how to visually demonstrate the concept using Manim.
    """
    print("\n[Node 1] Generating story...")
    
    system_message = SystemMessage(content=STORY_GENERATION_PROMPT)

    messages = [
        system_message,
        HumanMessage(content=f"User query: {state['query']}")
    ]
    
    try:
        response = llm_fast.invoke(messages)  # Use fast model for story
        story = response.content.strip()
        print(f"✓ Story generated: {story[:100]}...")
        return {"story": story}
    except Exception as e:
        print(f"✗ Error generating story: {e}")
        return {"story": f"Simple animation for: {state['query']}", "error": str(e)}


# ============================================================================
# NODE 2: Generate Syntax Questions
# ============================================================================
def generate_syntax_questions(state: State) -> dict:
    """
    Generate 4-5 specific syntax questions about Manim implementation
    that can be answered by RAG search of documentation.
    """
    print("\n[Node 2] Generating syntax questions...")
    
    system_message = SystemMessage(content=SYNTAX_QUESTIONS_PROMPT)

    messages = [
        system_message,
        HumanMessage(content=f"Story: {state['story']}")
    ]
    
    try:
        response = llm_fast.invoke(messages)  # Use fast model for questions
        questions_text = response.content.strip()
        
        # Parse questions into list
        questions = []
        for line in questions_text.split('\n'):
            line = line.strip()
            if line and (line[0].isdigit() or line.startswith('-') or line.startswith('•')):
                # Remove numbering and bullets
                question = line.lstrip('0123456789.-•) ').strip()
                if question:
                    questions.append(question)
        
        # Ensure we have 5-6 questions with positioning and cleanup
        if len(questions) < 5:
            questions.extend([
                "How to create basic shapes in Manim?",
                "How to animate objects in Manim?",
                "How to use colors in Manim?",
                "How to position objects using shift, move_to, next_to, to_edge in Manim?",
                "How to use FadeOut and remove objects from scene in Manim?",
                "How to use VGroup to organize multiple objects in Manim?"
            ])
        
        questions = questions[:6]  # Limit to 6 questions
        
        print(f"✓ Generated {len(questions)} syntax questions")
        for i, q in enumerate(questions, 1):
            print(f"  {i}. {q}")
        
        return {"syntax_questions": questions}
    
    except Exception as e:
        print(f"✗ Error generating syntax questions: {e}")
        # Fallback questions
        return {
            "syntax_questions": FALLBACK_SYNTAX_QUESTIONS,
            "error": str(e)
        }


# ============================================================================
# NODE 3: RAG Search
# ============================================================================
def rag_search(state: State) -> dict:
    """
    Search ChromaDB documentation for answers to syntax questions.
    Returns relevant documentation snippets for each question.
    """
    print("\n[Node 3] Performing RAG search...")
    
    if not vectorstore:
        print("⚠ ChromaDB not available, skipping RAG search")
        return {
            "rag_responses": ["ChromaDB not available - using general Manim knowledge"]
        }
    
    syntax_questions = state.get("syntax_questions", [])
    rag_responses = []
    
    for i, question in enumerate(syntax_questions, 1):
        print(f"  Searching for: {question}")
        try:
            # Search for top 2 most relevant documents for each question
            results = vectorstore.similarity_search(question, k=2)
            
            if results:
                # Combine results for this question
                answer = f"Q{i}: {question}\n"
                for j, doc in enumerate(results, 1):
                    answer += f"Answer {j}: {doc.page_content[:450]}...\n"

                rag_responses.append(answer)
                print(f"    ✓ Found {len(results)} relevant docs")
            else:
                rag_responses.append(f"Q{i}: {question}\nNo specific documentation found.")
                print(f"    ⚠ No results found")
                
        except Exception as e:
            print(f"    ✗ Error searching: {e}")
            rag_responses.append(f"Q{i}: {question}\nSearch error: {str(e)}")
    
    print(f"✓ RAG search completed with {len(rag_responses)} responses")
    return {"rag_responses": rag_responses}


# ============================================================================
# NODE 4: Generate Code
# ============================================================================
def generate_code(state: State) -> dict:
    """
    Generate complete Manim code using the story, syntax questions, and RAG responses.
    """
    print("\n[Node 4] Generating Manim code...")
    
    system_message = SystemMessage(content=CODE_GENERATION_PROMPT)

    # Build comprehensive context for code generation
    user_content = f"""
USER QUERY: {state['query']}

STORY/NARRATIVE TO ANIMATE:
{state['story']}

SYNTAX DOCUMENTATION (from RAG search):
{chr(10).join(state.get('rag_responses', []))}

Generate the complete, executable Manim code following the template structure.
Make sure the animation clearly demonstrates the concept from the story.
"""

    messages = [system_message, HumanMessage(content=user_content)]
    
    try:
        response = llm_code.invoke(messages)  # Use better model for code generation
        code_content = response.content.strip()
        
        # Clean up markdown formatting
        if code_content.startswith("```python"):
            code_content = code_content[9:]
        elif code_content.startswith("```"):
            code_content = code_content[3:]
        
        if code_content.endswith("```"):
            code_content = code_content[:-3]
        
        code_content = code_content.strip()
        
        # Ensure proper imports exist
        if "from manim import" not in code_content:
            code_content = "from manim import *\nfrom math import *\n\n" + code_content
        
        print(f"✓ Code generated ({len(code_content)} characters)")
        print("Code preview:")
        print(code_content[:200] + "...\n")
        
        return {"code": code_content}
    
    except Exception as e:
        print(f"✗ Error generating code: {e}")
        # Fallback basic code
        fallback_code = f"""from manim import *
from math import *

class Scene1(Scene):
    def construct(self):
        text = Text("{state['query']}")
        self.play(Write(text))
        self.wait(2)
"""
        return {"code": fallback_code, "error": str(e)}


# ============================================================================
# NODE 5: Execute Manim
# ============================================================================
def execute_manim(state: State) -> dict:
    """
    Execute the generated Manim code and save the video output.
    """
    print("\n[Node 5] Executing Manim code...")
    
    code = state.get("code", "")
    if not code:
        error_msg = "No code to execute"
        print(f"✗ {error_msg}")
        return {"error": error_msg}
    
    # Create temporary Python file
    temp_file = tempfile.NamedTemporaryFile(
        mode='w',
        suffix='.py',
        delete=False,
        dir='.',
        encoding='utf-8'
    )
    
    try:
        # Write code to temp file
        temp_file.write(code)
        temp_file.close()
        temp_file_path = temp_file.name
        
        print(f"  Created temp file: {temp_file_path}")
        
        # Save the code to a permanent file as well
        code_output_path = OUTPUT_DIR / f"generated_code_{Path(temp_file_path).stem}.py"
        with open(code_output_path, 'w', encoding='utf-8') as f:
            f.write(code)
        print(f"  Saved code to: {code_output_path}")
        
        # Execute Manim
        print(f"  Running: manim -ql {temp_file_path} Scene1")
        result = subprocess.run(
            ["manim", "-ql", temp_file_path, "Scene1"],
            capture_output=True,
            text=True,
            timeout=120  # 2 minutes timeout
        )
        
        if result.returncode != 0:
            error_msg = result.stderr.strip() or "Unknown execution error"
            print(f"✗ Manim execution failed:")
            print(result.stderr)
            return {
                "error": error_msg,
                "temp_file_path": temp_file_path
            }
        
        # Find the generated video
        # Manim outputs to media/videos/{filename}/480p15/Scene1.mp4
        video_pattern = Path("media/videos")
        
        # Search for the generated video
        temp_filename = Path(temp_file_path).stem
        expected_video_dir = video_pattern / temp_filename / "480p15"
        expected_video_path = expected_video_dir / "Scene1.mp4"
        
        if expected_video_path.exists():
            # Copy video to output directory
            final_video_path = OUTPUT_DIR / f"animation_{temp_filename}.mp4"
            shutil.copy2(expected_video_path, final_video_path)
            
            print(f"✓ Video generated successfully: {final_video_path}")
            
            # Clean up temp file
            try:
                os.remove(temp_file_path)
            except:
                pass
            
            return {
                "video_path": str(final_video_path),
                "error": None,
                "temp_file_path": None
            }
        else:
            error_msg = f"Video file not found at expected path: {expected_video_path}"
            print(f"✗ {error_msg}")
            return {
                "error": error_msg,
                "temp_file_path": temp_file_path
            }
    
    except subprocess.TimeoutExpired:
        error_msg = "Manim execution timed out (120 seconds)"
        print(f"✗ {error_msg}")
        return {
            "error": error_msg,
            "temp_file_path": temp_file.name
        }
    
    except Exception as e:
        error_msg = f"Unexpected error during execution: {str(e)}"
        print(f"✗ {error_msg}")
        return {
            "error": error_msg,
            "temp_file_path": temp_file.name if 'temp_file' in locals() else None
        }


# ============================================================================
# NODE 6: Review and Fix Code
# ============================================================================
def review_code(state: State) -> dict:
    """
    Review the failed code, fix it using LLM with error context, and execute once.
    This node only runs when execute_manim encounters an error.
    """
    print("\n[Node 6] Reviewing and fixing code...")
    
    current_code = state.get("code", "")
    error_message = state.get("error", "")
    
    if not current_code or not error_message:
        print("✗ No code or error message to review")
        return {"error": "No code or error message available for review"}
    
    print(f"  Error to fix: {error_message[:200]}...")
    
    system_message = SystemMessage(content=CODE_FIXING_PROMPT)

    user_content = f"""CURRENT CODE (WITH ERROR):
{current_code}

ERROR MESSAGE:
{error_message}

Fix the code to resolve this error. Return the complete corrected code.
"""

    messages = [system_message, HumanMessage(content=user_content)]
    
    try:
        response = llm_code.invoke(messages)  # Use better model for code fixing
        fixed_code = response.content.strip()
        
        # Clean up markdown formatting
        if fixed_code.startswith("```python"):
            fixed_code = fixed_code[9:]
        elif fixed_code.startswith("```"):
            fixed_code = fixed_code[3:]
        
        if fixed_code.endswith("```"):
            fixed_code = fixed_code[:-3]
        
        fixed_code = fixed_code.strip()
        
        # Ensure proper imports
        if "from manim import" not in fixed_code:
            fixed_code = "from manim import *\nfrom math import *\n\n" + fixed_code
        
        print(f"✓ Code fixed ({len(fixed_code)} characters)")
        print("Fixed code preview:")
        print(fixed_code[:200] + "...\n")
        
        # Now execute the fixed code (ONE TIME ONLY)
        print("  Executing fixed code...")
        
        # Create temporary Python file
        temp_file = tempfile.NamedTemporaryFile(
            mode='w',
            suffix='.py',
            delete=False,
            dir='.',
            encoding='utf-8'
        )
        
        try:
            temp_file.write(fixed_code)
            temp_file.close()
            temp_file_path = temp_file.name
            
            print(f"  Created temp file: {temp_file_path}")
            
            # Save the fixed code
            code_output_path = OUTPUT_DIR / f"generated_code_{Path(temp_file_path).stem}.py"
            with open(code_output_path, 'w', encoding='utf-8') as f:
                f.write(fixed_code)
            print(f"  Saved fixed code to: {code_output_path}")
            
            # Execute Manim
            print(f"  Running: manim -ql {temp_file_path} Scene1")
            result = subprocess.run(
                ["manim", "-ql", temp_file_path, "Scene1"],
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode != 0:
                error_msg = result.stderr.strip() or "Unknown execution error after fix"
                print(f"✗ Fixed code still failed:")
                print(result.stderr)
                return {
                    "code": fixed_code,
                    "error": f"Fix attempt failed: {error_msg}",
                    "temp_file_path": temp_file_path
                }
            
            # Find the generated video
            video_pattern = Path("media/videos")
            temp_filename = Path(temp_file_path).stem
            expected_video_dir = video_pattern / temp_filename / "480p15"
            expected_video_path = expected_video_dir / "Scene1.mp4"
            
            if expected_video_path.exists():
                final_video_path = OUTPUT_DIR / f"animation_{temp_filename}.mp4"
                shutil.copy2(expected_video_path, final_video_path)
                
                print(f"✓ Fixed code executed successfully! Video: {final_video_path}")
                
                # Clean up temp file
                try:
                    os.remove(temp_file_path)
                except:
                    pass
                
                return {
                    "code": fixed_code,
                    "video_path": str(final_video_path),
                    "error": None,
                    "temp_file_path": None
                }
            else:
                error_msg = f"Video file not found at expected path: {expected_video_path}"
                print(f"✗ {error_msg}")
                return {
                    "code": fixed_code,
                    "error": error_msg,
                    "temp_file_path": temp_file_path
                }
        
        except subprocess.TimeoutExpired:
            error_msg = "Fixed code execution timed out (120 seconds)"
            print(f"✗ {error_msg}")
            return {
                "code": fixed_code,
                "error": error_msg,
                "temp_file_path": temp_file.name
            }
        
        except Exception as e:
            error_msg = f"Unexpected error during fixed code execution: {str(e)}"
            print(f"✗ {error_msg}")
            return {
                "code": fixed_code,
                "error": error_msg,
                "temp_file_path": temp_file.name if 'temp_file' in locals() else None
            }
    
    except Exception as e:
        print(f"✗ Error fixing code: {e}")
        return {
            "error": f"Failed to fix code: {str(e)}"
        }


# ============================================================================
# Conditional Routing Function
# ============================================================================
def check_execution_status(state: State) -> Literal["review_code", "end"]:
    """
    Check if execute_manim had an error.
    - If error exists: route to review_code node
    - If no error: route to end
    """
    error = state.get("error")
    
    if error is not None and error.strip():
        print(f"\n[Routing] Error detected, routing to review_code node")
        return "review_code"
    else:
        print(f"\n[Routing] No error, routing to END")
        return "end"


# ============================================================================
# Build LangGraph Workflow
# ============================================================================
def build_graph():
    """
    Build the LangGraph workflow connecting all nodes.
    """
    builder = StateGraph(State)
    
    # Add nodes
    builder.add_node("generate_story", generate_story)
    builder.add_node("generate_syntax_questions", generate_syntax_questions)
    builder.add_node("rag_search", rag_search)
    builder.add_node("generate_code", generate_code)
    builder.add_node("execute_manim", execute_manim)
    builder.add_node("review_code", review_code)
    
    # Define workflow edges
    builder.add_edge(START, "generate_story")
    builder.add_edge("generate_story", "generate_syntax_questions")
    builder.add_edge("generate_syntax_questions", "rag_search")
    builder.add_edge("rag_search", "generate_code")
    builder.add_edge("generate_code", "execute_manim")
    
    # Conditional routing after execute_manim
    builder.add_conditional_edges(
        "execute_manim",
        check_execution_status,
        {
            "review_code": "review_code",
            "end": END
        }
    )
    
    # review_code always goes to END (no retry loop)
    builder.add_edge("review_code", END)
    
    return builder.compile()

# Compile the graph
graph = build_graph()
print("✓ LangGraph workflow compiled successfully")


# ============================================================================
# FastAPI Endpoints
# ============================================================================
@app.post("/generate")
async def generate_video(request: QueryRequest):
    """
    Generate a Manim animation video from a text query.
    
    This endpoint:
    1. Generates an educational story from the query
    2. Creates syntax questions for RAG search
    3. Searches documentation for implementation details
    4. Generates Manim code
    5. Executes the code and returns the video file directly
    """
    print(f"\n{'='*80}")
    print(f"NEW REQUEST: {request.query}")
    print(f"{'='*80}")
    
    try:
        # Initialize state
        initial_state = {
            "query": request.query,
            "story": "",
            "syntax_questions": [],
            "rag_responses": [],
            "code": "",
            "video_path": None,
            "error": None,
            "attempt_count": 0,
            "temp_file_path": None
        }
        
        # Run the graph
        final_state = graph.invoke(initial_state)
        
        # Check if video was generated successfully
        if final_state.get("error") is None and final_state.get("video_path"):
            video_path = Path(final_state["video_path"])
            
            if video_path.exists():
                print(f"\n✓ SUCCESS: Returning video file {video_path}")
                
                
                # Return the video file directly with custom headers for metadata
                return FileResponse(
                    path=video_path,
                    media_type="video/mp4",
                    filename=f"animation_{request.query[:30].replace(' ', '_')}.mp4",
                    headers={
                        "X-Query": final_state.get("query", ""),
                        "X-Success": "true",
                        "X-Code-File-Path": str(OUTPUT_DIR / f"generated_code_{Path(video_path).stem.replace('animation_', '')}.py")
                    }
                )
            else:
                print(f"\n✗ FAILED: Video file not found at {video_path}")
                raise HTTPException(status_code=500, detail="Video file not found after generation")
        else:
            # Error occurred during generation
            error_msg = final_state.get("error", "Unknown error occurred")
            print(f"\n✗ FAILED: {error_msg}")
            raise HTTPException(status_code=500, detail=error_msg)
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"\n✗ EXCEPTION: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/get_code/{filename}")
async def get_code(filename: str):
    """
    Retrieve the generated Manim code for a specific animation.
    
    Args:
        filename: The filename of the generated code (e.g., 'generated_code_tmpxxx.py' or just 'tmpxxx')
    
    Returns:
        The generated Python code content
    """
    # Handle both full filename and just the temp name
    if not filename.endswith('.py'):
        filename = f"generated_code_{filename}.py"
    
    if not filename.startswith('generated_code_'):
        filename = f"generated_code_{filename}"
    
    code_path = OUTPUT_DIR / filename
    
    if not code_path.exists():
        # Try to find a matching file
        matching_files = list(OUTPUT_DIR.glob(f"*{filename.replace('generated_code_', '').replace('.py', '')}*.py"))
        if matching_files:
            code_path = matching_files[0]
        else:
            raise HTTPException(status_code=404, detail=f"Code file not found: {filename}")
    
    try:
        with open(code_path, 'r', encoding='utf-8') as f:
            code_content = f.read()
        
        return {
            "filename": code_path.name,
            "code": code_content,
            "path": str(code_path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading code file: {str(e)}")


@app.get("/")
async def root():
    """
    Health check and API information.
    """
    return {
        "service": "Manim Video Generator API",
        "version": "2.0.0",
        "status": "running",
        "endpoints": {
            "POST /generate": "Generate video from text query (returns video file directly)",
            "GET /get_code/{filename}": "Retrieve generated Manim code by filename",
            "GET /": "API information (this page)"
        },
        "chromadb_status": "loaded" if vectorstore else "not available"
    }


# ============================================================================
# Main Entry Point
# ============================================================================
if __name__ == "__main__":
    import uvicorn
    
    print("\n" + "="*80)
    print("🎬 MANIM VIDEO GENERATOR API")
    print("="*80)
    print(f"ChromaDB: {'✓ Loaded' if vectorstore else '✗ Not available'}")
    print(f"Output Directory: {OUTPUT_DIR.absolute()}")
    print(f"LLM Fast (story/questions): gemini-2.5-flash-lite")
    print(f"LLM Code (generation/fixing): gemini-2.5-flash")
    print("="*80 + "\n")
    
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
