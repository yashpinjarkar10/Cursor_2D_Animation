import os
import tempfile
from pathlib import Path
from dotenv import load_dotenv
from langchain_nvidia_ai_endpoints import ChatNVIDIA

load_dotenv()


NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")
MODEL = "nvidia/nemotron-3-super-120b-a12b"
MODEL_FAST = "nvidia/nemotron-3-super-120b-a12b"

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
MISTRAL_EMBEDDING_MODEL = "mistral-embed"

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SECRET_KEY")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
SUPABASE_BUCKET_NAME = os.getenv("SUPABASE_BUCKET_NAME", "Rendered-videos")

BASE_DIR = Path(__file__).resolve().parent

# Temporary local storage for video rendering
TEMP_VIDEO_DIR = Path(os.getenv("TEMP_VIDEO_DIR", tempfile.gettempdir())) / "manim_renders"
TEMP_VIDEO_DIR.mkdir(parents=True, exist_ok=True)

MAX_REPAIR_ATTEMPTS = 3
MANIM_TIMEOUT = 120
DEFAULT_GENERATION_MAX_TOKENS = 4000
DEFAULT_REPAIR_MAX_TOKENS = 4000
KNOWLEDGE_CAPABILITY_LIMIT = 10
KNOWLEDGE_API_LIMIT = 12
KNOWLEDGE_EXAMPLE_LIMIT = 6
KNOWLEDGE_APIS_PER_CAPABILITY = 8
KNOWLEDGE_EXAMPLES_PER_API = 3
KNOWLEDGE_RELATED_APIS_PER_API = 5
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]


# Return configured NVIDIA Chat LLM instance
def get_llm(
    fast: bool = False,
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> ChatNVIDIA:
    model = MODEL_FAST if fast else MODEL
    options = {
        "model": model,
        "temperature": temperature,
        "api_key": NVIDIA_API_KEY,
    }
    if max_tokens is not None:
        options["max_tokens"] = max_tokens
    return ChatNVIDIA(
        **options,
    )