import os
import random
from typing import List, Dict, Any
from dataclasses import dataclass
import re
from crawl_recursive import CrawlResult
from urllib.parse import urlparse
from supabase import create_client, Client
from langchain_google_genai import GoogleGenerativeAIEmbeddings
import asyncio
from dotenv import load_dotenv

load_dotenv()

# Ensure the API key is loaded from the .env file
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GOOGLE_API_DELAY = 4  # Rate limiting delay between Google API calls
supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY")
)

@dataclass
class ProcessedChunk:
    url: str
    chunk_number: int
    title: str
    content: str
    metadata: Dict[str, Any]
    embedding: List[float]

async def get_embedding(text: str) -> List[float]:
    """Get embedding vector from gemini with retry logic."""
    max_retries = 3
    base_delay = 2  # seconds
    for attempt in range(max_retries):
        try:
            embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001",  google_api_key=GOOGLE_API_KEY)
            vector = embeddings.embed_query(text)
            await asyncio.sleep(GOOGLE_API_DELAY)  # Rate limiting delay
            return vector
        except Exception as e:
            print(f"Attempt {attempt + 1} failed to get embedding: {e}")
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                print(f"Retrying in {delay:.2f} seconds...")
                await asyncio.sleep(delay)
            else:
                print("Max retries reached. Returning zero vector.")
                return [0] * 768  # Return zero vector on final error
            
async def insert_chunk(chunk: ProcessedChunk):
    """Insert a processed chunk into Supabase."""
    try:
        data = {
            "url": chunk.url,
            "chunk_number": chunk.chunk_number,
            "title": chunk.title,
            "content": chunk.content,
            "metadata": chunk.metadata,
            "embedding": chunk.embedding
        }
        result = supabase.table("manim_docs").insert(data).execute()
        print(f"Inserted chunk {chunk.chunk_number} for {chunk.url}")
        return result
    except Exception as e:
        print(f"Error inserting chunk: {e}")
        return None


async def extract_section_info(url:str,chunk: str) -> Dict[str, Any]:
    """Extracts headers and stats from a chunk."""
    headers = re.findall(r'^(#+)\s+([^\[]+)', chunk, re.MULTILINE)
    header_str = '; '.join([ h[1] for h in headers]) if headers else ''

    match = re.search(r'Qualified name:\s*(.+)', chunk)
    relative_path = match.group(1).strip().strip('`') if match else None
    if not relative_path and 'reference' in url:
        relative_path = urlparse(url).path.split('/')[-1]
        if relative_path.endswith('.html'):
            relative_path = relative_path[:-5]
    return {
        "headers": header_str,
        "relative_import_path": relative_path,
        "char_count": len(chunk),
        "word_count": len(chunk.split())
    }      

async def process_chunk( chunk_number: int,crawl_result:CrawlResult) -> ProcessedChunk:
    """Process a single chunk of text."""
    chunk= crawl_result.filtered_markdown
    url = crawl_result.url
    embedding = await get_embedding(chunk)
    meta = await extract_section_info(url, chunk)
    meta["chunk_index"] = chunk_number
    meta["source"] = url
    
    return ProcessedChunk(
        title=meta["headers"],
        url=url,
        chunk_number=chunk_number,
        metadata=meta,
        content=chunk,
        embedding=embedding
    )

