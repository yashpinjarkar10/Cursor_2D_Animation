"""
Script to convert manim_docs.txt to vector embeddings using ChromaDB
and HuggingFace embeddings (local, no API required).

This script should be run from the project root directory to generate
the chroma_db_manim vector store.
"""

import os
from pathlib import Path
from langchain_community.document_loaders import TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings


def main():
    # Get the directory where this script is located
    script_dir = Path(__file__).parent
    docs_file = script_dir / "manim_docs.txt"
    
    # Output directory is in the parent (project root)
    output_dir = script_dir.parent / "chroma_db_manim"
    
    print(f"Loading {docs_file}...")
    
    # Load the document
    loader = TextLoader(str(docs_file), encoding="utf-8")
    documents = loader.load()
    
    print(f"Document loaded. Total characters: {len(documents[0].page_content)}")
    
    # Split the document into chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=700,
        chunk_overlap=150,
        length_function=len,
        separators=["\n\n", "\n", " ", ""]
    )
    
    splits = text_splitter.split_documents(documents)
    print(f"Document split into {len(splits)} chunks")
    
    # Initialize embeddings (using local HuggingFace model - no API required)
    print("Initializing HuggingFace embeddings (running locally)...")
    print("Downloading model if not cached... This may take a moment on first run.")
    embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2",
        model_kwargs={'device': 'cpu'},
        encode_kwargs={'normalize_embeddings': True}
    )
    
    # Create ChromaDB vector store
    print("Creating ChromaDB vector store...")
    vectorstore = Chroma.from_documents(
        documents=splits,
        embedding=embeddings,
        persist_directory=str(output_dir),
        collection_name="manim_docs"
    )
    
    print(f"✓ Successfully created vector store with {len(splits)} documents")
    print(f"✓ Vector store persisted to: {output_dir}")
    
    # Test query
    print("\nTesting vector store with a sample query...")
    test_query = "How to create a circle in Manim?"
    results = vectorstore.similarity_search(test_query, k=3)
    
    print(f"\nQuery: '{test_query}'")
    print(f"Found {len(results)} relevant chunks:")
    for i, doc in enumerate(results, 1):
        print(f"\n--- Result {i} ---")
        print(doc.page_content[:200] + "...")
    
    return vectorstore


if __name__ == "__main__":
    vectorstore = main()
    print("\n✓ Script completed successfully!")
