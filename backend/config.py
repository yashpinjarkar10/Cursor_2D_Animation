import os
from pathlib import Path
from dotenv import load_dotenv
from langchain_groq import ChatGroq

load_dotenv()


GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = "openai/gpt-oss-120b"
GROQ_MODEL_FAST = "openai/gpt-oss-20b"

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
MISTRAL_EMBEDDING_MODEL = "mistral-embed"

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SECRET_KEY")

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "generated_videos"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

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


def get_llm(
    fast: bool = False,
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> ChatGroq:
    model = GROQ_MODEL_FAST if fast else GROQ_MODEL
    options = {
        "model": model,
        "temperature": temperature,
        "api_key": GROQ_API_KEY,
    }
    if max_tokens is not None:
        options["max_tokens"] = max_tokens
    return ChatGroq(
        **options,
    )