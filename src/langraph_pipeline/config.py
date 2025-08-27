# ===================================================================
# CONFIGURATION MODULE
# ===================================================================
"""
Configuration module for the 2D Animation Pipeline.

This module handles all environment setup, API keys, and configuration
settings required for the animation generation pipeline.
"""

import os
import getpass
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

# ===================================================================
# ENVIRONMENT SETUP
# ===================================================================

def setup_environment():
    """
    Setup environment variables and configuration.
    
    Loads environment variables from .env file and configures
    LangSmith tracing for debugging.
    """
    # Load environment variables
    load_dotenv()

    # LangSmith configuration for tracing and debugging
    os.environ["LANGSMITH_PROJECT"] = "TestProject"
    os.environ["LANGSMITH_API_KEY"] = os.getenv("LANGSMITH_API_KEY")
    os.environ["LANGSMITH_TRACING"] = "true"

    # Ensure Tavily API key is available
    if not os.environ.get("TAVILY_API_KEY"):
        os.environ["TAVILY_API_KEY"] = getpass.getpass("Tavily API key:\n")

def get_api_keys():
    """
    Retrieve and validate API keys from environment.
    
    Returns:
        dict: Dictionary containing all required API keys and URLs
    """
    return {
        'google_api_key': os.getenv("GOOGLE_API_KEY"),
        'tavily_api_key': os.getenv("TAVILY_API_KEY"),
        'supabase_url': os.environ.get("SUPABASE_URL"),
        'supabase_key': os.environ.get("SUPABASE_SERVICE_KEY")
    }

def setup_directories():
    """
    Create necessary directories for the pipeline.
    
    Creates directories for generated scenes and rendered videos
    if they don't already exist.
    """
    os.makedirs("generated_scenes", exist_ok=True)
    os.makedirs("rendered_videos", exist_ok=True)

def initialize_llm():
    """
    Initialize and return the Google Gemini LLM instance.
    
    Returns:
        ChatGoogleGenerativeAI: Configured LLM instance
    """
    api_keys = get_api_keys()
    
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0.1,
        api_key=api_keys['google_api_key']
    )

# ===================================================================
# CONFIGURATION CONSTANTS
# ===================================================================

# Manim code generation system prompt
MANIM_SYSTEM_PROMPT = (
    "You are a Manim expert with access to both web search.\n"
    "Generate complete, working Manim code for the given scene description.\n\n"
    "IMPORTANT:\n"
    "- If the scene involves current topics or recent developments, use the search tool first\n"
    "- Use the provided Manim documentation context for accurate API usage\n"
    "- Combine both sources of information for the best possible code\n\n"
    "The code should:\n"
    "1. Import necessary Manim components\n"
    "3. Include a construct method with the animation\n"
    "4. Be syntactically correct and runnable\n"
    "5. Use appropriate Manim objects and animations\n\n"
    "CODING REQUIREMENTS:\n"
    "- Return ONLY the Python code, no explanations\n"
    "- Write Manim scripts for animations in Python. Generate code, not text\n"
    "- Never explain code. Never add functions. Never add comments\n"
    "- Never create infinite loops. Never use libraries other than Manim/math\n"
    "- Only complete the code block. Use variables with length of maximum 2 characters\n"
    "- At the end use 'self.play' for proper animation\n\n"
    "Template structure:\n"
    "from manim import *\nfrom math import *\n\nclass Scene1(Scene):\n    def construct(self):\n        pass\n"
)

# Scene generation system prompt
SCENE_GENERATION_PROMPT = """
You are an educational content creator. Given a topic, break it down into multiple(Number of Scence depend on topic) smaller scenes 
that can be animated to explain the concept clearly. Each scene should be a brief description 
of what should be shown.

Return only a numbered list of scene descriptions, one per line.
Example format:
1. Introduction to the concept
2. Show the main formula
3. Demonstrate with an example
4. Animation of the concept
5. And So on..
"""