from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import chromadb
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings
from langchain_huggingface import HuggingFaceEmbeddings

from knowledge.ingestion.documents import safe_json_dumps

logger = logging.getLogger(__name__)


class LangchainEmbeddingAdapter(EmbeddingFunction[Documents]):
    """Adapts LangChain embeddings to Chroma's native EmbeddingFunction interface."""

    def __init__(self, langchain_embeddings: Any) -> None:
        self._embeddings = langchain_embeddings

    def __call__(self, input: Documents) -> Embeddings:
        return self._embeddings.embed_documents(list(input))


# -------------------------------------------------------------------
# Paths
# -------------------------------------------------------------------

KNOWLEDGE_DIR = Path(__file__).resolve().parents[1]
CHROMA_DIR = KNOWLEDGE_DIR / "chroma"

# -------------------------------------------------------------------
# Collection names
# -------------------------------------------------------------------

CAPABILITIES_COLLECTION = "manim_capabilities"
APIS_COLLECTION = "manim_apis"
EXAMPLES_COLLECTION = "manim_examples"

# -------------------------------------------------------------------
# Embedding model
# -------------------------------------------------------------------

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# Specific fields in each collection's metadata that were serialized as JSON strings
CAPABILITY_JSON_FIELDS = {
    "apis",
    "examples",
    "intent_patterns",
    "constraints",
    "merged_from",
}

API_JSON_FIELDS = {
    "parameters",
    "base_classes",
    "methods",
}

EXAMPLE_JSON_FIELDS = {
    "ref_classes",
    "apis",
    "api_usage",
    "variable_types",
    "api_references",
}


def _deserialize_metadata(
    metadata: dict[str, Any] | None,
    json_fields: set[str],
) -> dict[str, Any]:
    """
    Safely deserializes fields known to contain JSON strings into their native
    Python structures (lists, dicts). Leaves normal strings untouched.
    """
    if not metadata:
        return {}

    import json

    result: dict[str, Any] = {}
    for key, value in metadata.items():
        if key in json_fields and isinstance(value, str):
            if value.strip() == "":
                result[key] = []
                continue
            try:
                result[key] = json.loads(value)
            except Exception as e:
                logger.warning(
                    f"Failed to deserialize JSON metadata field '{key}': {e}"
                )
                result[key] = value
        else:
            result[key] = value

    return result


class ChromaKnowledgeRepository:
    """
    Read-only runtime interface over the static Manim Chroma knowledge base.

    Provides both:
    1. Exact get methods (get_capability, get_api, get_example) returning
       clean, fully deserialized dictionary records representing the actual knowledge.
    2. Semantic search methods (search_capabilities, search_apis, search_examples)
       returning formatted results with distance and deserialized records.
    """

    def __init__(
        self,
        chroma_path: str | Path = CHROMA_DIR,
        embedding_model: str = EMBEDDING_MODEL,
    ) -> None:
        self.chroma_path = Path(chroma_path)

        hf_embeddings = HuggingFaceEmbeddings(
            model_name=embedding_model,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
        self.embedding_function = LangchainEmbeddingAdapter(hf_embeddings)

        self.client = chromadb.PersistentClient(path=str(self.chroma_path))

        self.capabilities = self.client.get_collection(
            name=CAPABILITIES_COLLECTION,
            embedding_function=self.embedding_function,
        )

        self.apis = self.client.get_collection(
            name=APIS_COLLECTION,
            embedding_function=self.embedding_function,
        )

        self.examples = self.client.get_collection(
            name=EXAMPLES_COLLECTION,
            embedding_function=self.embedding_function,
        )

    # ================================================================
    # CAPABILITIES
    # ================================================================

    def search_capabilities(
        self,
        query: str,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        if limit <= 0:
            return []

        results = self.capabilities.query(
            query_texts=[query],
            n_results=limit,
        )

        return self._format_results(results, CAPABILITY_JSON_FIELDS)

    def get_capability(
        self,
        capability_id: str,
    ) -> dict[str, Any] | None:
        if not capability_id:
            return None

        result = self.capabilities.get(
            ids=[capability_id],
        )

        if not result or not result.get("ids") or len(result["ids"]) == 0:
            return None

        metadata = result["metadatas"][0] if result.get("metadatas") else {}
        clean_record = _deserialize_metadata(metadata, CAPABILITY_JSON_FIELDS)
        clean_record["id"] = result["ids"][0]
        if result.get("documents") and result["documents"]:
            clean_record["_document"] = result["documents"][0]

        return clean_record

    # ================================================================
    # APIs
    # ================================================================

    def search_apis(
        self,
        query: str,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        if limit <= 0:
            return []

        results = self.apis.query(
            query_texts=[query],
            n_results=limit,
        )

        return self._format_results(results, API_JSON_FIELDS)

    def get_api(
        self,
        api_id: str,
    ) -> dict[str, Any] | None:
        if not api_id:
            return None

        result = self.apis.get(
            ids=[api_id],
        )

        if not result or not result.get("ids") or len(result["ids"]) == 0:
            return None

        metadata = result["metadatas"][0] if result.get("metadatas") else {}
        clean_record = _deserialize_metadata(metadata, API_JSON_FIELDS)
        clean_record["id"] = result["ids"][0]
        if result.get("documents") and result["documents"]:
            clean_record["_document"] = result["documents"][0]

        return clean_record

    # ================================================================
    # EXAMPLES
    # ================================================================

    def search_examples(
        self,
        query: str,
        limit: int = 3,
    ) -> list[dict[str, Any]]:
        if limit <= 0:
            return []

        results = self.examples.query(
            query_texts=[query],
            n_results=limit,
        )

        return self._format_results(results, EXAMPLE_JSON_FIELDS)

    def get_example(
        self,
        example_id: str,
    ) -> dict[str, Any] | None:
        if not example_id:
            return None

        result = self.examples.get(
            ids=[example_id],
        )

        if not result or not result.get("ids") or len(result["ids"]) == 0:
            return None

        metadata = result["metadatas"][0] if result.get("metadatas") else {}
        clean_record = _deserialize_metadata(metadata, EXAMPLE_JSON_FIELDS)
        clean_record["id"] = result["ids"][0]
        if result.get("documents") and result["documents"]:
            clean_record["_document"] = result["documents"][0]

        return clean_record

    # ================================================================
    # UTILITY
    # ================================================================

    @staticmethod
    def _format_results(
        results: dict,
        json_fields: set[str],
    ) -> list[dict[str, Any]]:
        if not results or not results.get("ids") or not results["ids"]:
            return []

        ids = results.get("ids", [[]])[0]
        documents = results.get("documents", [[]])[0] if results.get("documents") else []
        metadatas = results.get("metadatas", [[]])[0] if results.get("metadatas") else []
        distances = results.get("distances", [[]])[0] if results.get("distances") else []

        formatted: list[dict[str, Any]] = []

        for i, record_id in enumerate(ids):
            raw_meta = metadatas[i] if i < len(metadatas) and metadatas[i] else {}
            deserialized_meta = _deserialize_metadata(raw_meta, json_fields)

            doc = documents[i] if i < len(documents) else None
            dist = distances[i] if i < len(distances) else None

            # Combined record representation: all deserialized metadata keys are promoted
            # to top-level while also retaining "id", "document", "metadata", and "distance"
            record = dict(deserialized_meta)
            record["id"] = record_id
            record["document"] = doc
            record["metadata"] = deserialized_meta
            record["distance"] = dist

            formatted.append(record)

        return formatted

    # ================================================================
    # HEALTH CHECK
    # ================================================================

    def health(self) -> dict[str, Any]:
        return {
            "chroma_path": str(self.chroma_path),
            "capabilities": self.capabilities.count(),
            "apis": self.apis.count(),
            "examples": self.examples.count(),
        }


# Alias for backward compatibility
ChromaRepository = ChromaKnowledgeRepository