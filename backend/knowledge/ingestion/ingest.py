import chromadb
from langchain_huggingface import HuggingFaceEmbeddings

try:
    from .config import (
        CHROMA_DIR,
        CAPABILITIES_FILE,
        API_REGISTRY_FILE,
        EXAMPLES_FILE,
        CAPABILITIES_COLLECTION,
        APIS_COLLECTION,
        EXAMPLES_COLLECTION,
        EMBEDDING_MODEL,
        MANIM_VERSION,
    )

    from .loaders import (
        load_json,
        extract_records,
    )

    from .documents import (
        capability_document,
        capability_metadata,
        api_document,
        api_metadata,
        example_document,
        example_metadata,
    )

except ImportError:
    import sys
    from pathlib import Path

    _CURRENT_DIR = Path(__file__).resolve().parent

    if str(_CURRENT_DIR) not in sys.path:
        sys.path.insert(0, str(_CURRENT_DIR))

    from config import (
        CHROMA_DIR,
        CAPABILITIES_FILE,
        API_REGISTRY_FILE,
        EXAMPLES_FILE,
        CAPABILITIES_COLLECTION,
        APIS_COLLECTION,
        EXAMPLES_COLLECTION,
        EMBEDDING_MODEL,
        MANIM_VERSION,
    )

    from loaders import (
        load_json,
        extract_records,
    )

    from documents import (
        capability_document,
        capability_metadata,
        api_document,
        api_metadata,
        example_document,
        example_metadata,
    )

from chromadb.api.types import Documents, EmbeddingFunction, Embeddings


class LangchainEmbeddingAdapter(EmbeddingFunction[Documents]):
    """Adapts LangChain embeddings to Chroma's native EmbeddingFunction interface."""

    def __init__(self, langchain_embeddings):
        self._embeddings = langchain_embeddings

    def __call__(self, input: Documents) -> Embeddings:
        return self._embeddings.embed_documents(list(input))


def create_embedding_function():
    hf_embeddings = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
        model_kwargs={
            "device": "cpu",
        },
        encode_kwargs={
            "normalize_embeddings": True,
        },
    )

    return LangchainEmbeddingAdapter(hf_embeddings)


def create_client():
    CHROMA_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    return chromadb.PersistentClient(
        path=str(CHROMA_DIR)
    )


def reset_collection(client, name):
    try:
        client.delete_collection(name)
        print(f"Deleted existing collection: {name}")

    except Exception:
        pass


def ingest_capabilities(client, embedding_function):

    data = load_json(CAPABILITIES_FILE)
    records = extract_records(data)

    collection = client.get_or_create_collection(
        name=CAPABILITIES_COLLECTION,
        embedding_function=embedding_function,
        metadata={
            "type": "capability",
            "manim_version": MANIM_VERSION,
            "embedding_model": EMBEDDING_MODEL,
        },
    )

    ids = []
    documents = []
    metadatas = []

    for capability in records:

        capability_id = capability["id"]

        ids.append(capability_id)

        documents.append(
            capability_document(capability)
        )

        metadatas.append(
            capability_metadata(
                capability,
                manim_version=MANIM_VERSION,
            )
        )

    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
    )

    print(
        f"Capabilities ingested: {len(records)}"
    )


def ingest_apis(client, embedding_function):

    data = load_json(API_REGISTRY_FILE)

    # api_registry.json has:
    #
    # {
    #     "library": {...},
    #     "symbols": {
    #         "qualified.name": {...}
    #     }
    # }

    records = data["symbols"]

    collection = client.get_or_create_collection(
        name=APIS_COLLECTION,
        embedding_function=embedding_function,
        metadata={
            "type": "api",
            "manim_version": MANIM_VERSION,
            "embedding_model": EMBEDDING_MODEL,
        },
    )

    ids = []
    documents = []
    metadatas = []

    for api_id, api in records.items():

        ids.append(api_id)

        documents.append(
            api_document(api)
        )

        metadatas.append(
            api_metadata(
                api,
                api_id=api_id,
                manim_version=MANIM_VERSION,
            )
        )

    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
    )

    print(
        f"APIs ingested: {len(records)}"
    )


def ingest_examples(client, embedding_function):

    data = load_json(EXAMPLES_FILE)
    records = extract_records(data)

    collection = client.get_or_create_collection(
        name=EXAMPLES_COLLECTION,
        embedding_function=embedding_function,
        metadata={
            "type": "example",
            "manim_version": MANIM_VERSION,
            "embedding_model": EMBEDDING_MODEL,
        },
    )

    ids = []
    documents = []
    metadatas = []

    for example in records:

        example_id = example["id"]

        ids.append(example_id)

        documents.append(
            example_document(example)
        )

        metadatas.append(
            example_metadata(
                example,
                manim_version=MANIM_VERSION,
            )
        )

    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
    )

    print(
        f"Examples ingested: {len(records)}"
    )


def main():

    print("=" * 60)
    print("MANIM KNOWLEDGE INGESTION")
    print("=" * 60)

    print(
        f"Manim version: {MANIM_VERSION}"
    )

    print(
        f"Embedding model: {EMBEDDING_MODEL}"
    )

    print(
        f"Chroma path: {CHROMA_DIR}"
    )

    print("\nLoading embedding model...")

    embedding_function = create_embedding_function()

    client = create_client()

    print("\nResetting collections...")

    reset_collection(
        client,
        CAPABILITIES_COLLECTION,
    )

    reset_collection(
        client,
        APIS_COLLECTION,
    )

    reset_collection(
        client,
        EXAMPLES_COLLECTION,
    )

    print("\nIngesting capabilities...")

    ingest_capabilities(
        client,
        embedding_function,
    )

    print("\nIngesting APIs...")

    ingest_apis(
        client,
        embedding_function,
    )

    print("\nIngesting examples...")

    ingest_examples(
        client,
        embedding_function,
    )

    print("\n" + "=" * 60)
    print("INGESTION COMPLETE")
    print("=" * 60)

    for collection_name in [
        CAPABILITIES_COLLECTION,
        APIS_COLLECTION,
        EXAMPLES_COLLECTION,
    ]:

        collection = client.get_collection(
            collection_name
        )

        print(
            f"{collection_name}: "
            f"{collection.count()} records"
        )


if __name__ == "__main__":
    main()