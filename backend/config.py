import os
from pathlib import Path
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "").strip().strip('"').strip("'")
GEMINI_MODEL = "gemini-3.8-flash"
GEMINI_MODEL_FAST = "gemini-3.5-flash-lite"

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SECRET_KEY")

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "generated_videos"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MAX_REPAIR_ATTEMPTS = 3
MANIM_TIMEOUT = 120
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]

# Returns configured Gemini chat model
def get_llm(fast: bool = False, temperature: float = 0.2) -> ChatGoogleGenerativeAI:
    model = GEMINI_MODEL_FAST if fast else GEMINI_MODEL
    return ChatGoogleGenerativeAI(
        model=model,
        google_api_key=GOOGLE_API_KEY,
        temperature=temperature,
    )
