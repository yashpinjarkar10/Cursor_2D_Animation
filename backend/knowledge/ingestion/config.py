from pathlib import Path


# backend/
BACKEND_DIR = Path(__file__).resolve().parents[2]

# backend/knowledge/
KNOWLEDGE_DIR = BACKEND_DIR / "knowledge"

# backend/knowledge/static/
STATIC_DIR = KNOWLEDGE_DIR / "static"

# backend/knowledge/chroma/
CHROMA_DIR = KNOWLEDGE_DIR / "chroma"


# Static knowledge files
CAPABILITIES_FILE = STATIC_DIR / "capabilities.json"
API_REGISTRY_FILE = STATIC_DIR / "api_registry.json"
EXAMPLES_FILE = STATIC_DIR / "examples_with_apis.json"
EXAMPLES_BASIC_FILE = STATIC_DIR / "examples.json"


# Chroma collections
CAPABILITIES_COLLECTION = "manim_capabilities"
APIS_COLLECTION = "manim_apis"
EXAMPLES_COLLECTION = "manim_examples"


# Pin this to the embedding model used by the project.
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

MANIM_VERSION = "0.19.0"