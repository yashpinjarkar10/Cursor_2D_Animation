import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_tavily import TavilySearch
from supabase import create_client

def setup_environment():
    """Setup environment variables and configurations."""
    load_dotenv()
    
    # LangSmith configuration for tracing and debugging
    os.environ["LANGSMITH_PROJECT"] = "DemoProject"
    os.environ["LANGSMITH_API_KEY"] = os.getenv("LANGSMITH_API_KEY")
    os.environ["LANGSMITH_TRACING"] = "true"

def get_api_keys():
    """Get all required API keys from environment."""
    return {
        "GOOGLE_API_KEY": os.getenv("GOOGLE_API_KEY"),
        "TAVILY_API_KEY": os.getenv("TAVILY_API_KEY"),
        "supabase_url": os.environ.get("SUPABASE_URL"),
        "supabase_key": os.environ.get("SUPABASE_SERVICE_KEY")
    }

def initialize_services():
    """Initialize LLM, search tool, and database client."""
    api_keys = get_api_keys()
    
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0.1, 
        api_key=api_keys["GOOGLE_API_KEY"]
    )
    
    search_tool = TavilySearch(
        max_results=5,
        topic="general",
        tavily_api_key=api_keys["TAVILY_API_KEY"],
    )
    
    supabase = create_client(
        api_keys["supabase_url"], 
        api_keys["supabase_key"]
    )
    
    return llm, search_tool, supabase