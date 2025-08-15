import argparse
import sys
import re
import asyncio
from typing import List, Dict, Any
from urllib.parse import urlparse, urldefrag
from xml.etree import ElementTree
import requests
from crawl_recursive import crawl_recursive_internal_links
from utils import process_chunk,insert_chunk

async def insert_docs_into_supabase(website :str = "https://docs.manim.community/en/stable/reference.html",max_depth: int = 5, max_concurrent: int = 10):
    """Inserts crawled documents into Supabase."""
    crawl_results = await crawl_recursive_internal_links([website], max_depth=max_depth, max_concurrent=max_concurrent)
    if not crawl_results:
        print("No documents found to insert.")
        sys.exit(1)
    
    print(f"Inserting {len(crawl_results)} chunks into Supabase collection...")
    tasks = [process_chunk(i, crawl_result) for i, crawl_result in enumerate(crawl_results)]
    processed_chunks = await asyncio.gather(*tasks)
    insert_tasks = [insert_chunk(chunk) for chunk in processed_chunks]
    await asyncio.gather(*insert_tasks)
    # async def process_and_insert(i, crawl_result):
    #     chunk = await process_chunk(i, crawl_result)
    #     await insert_chunk(chunk)

    # await asyncio.gather(*(process_and_insert(i, result) for i, result in enumerate(crawl_results)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Insert crawled documents into Supabase.")
    parser.add_argument("--website", type=str, help="Website URL to crawl and insert documents from.")
    parser.add_argument("--max-depth", type=int, default=5, help="Maximum recursion depth for crawling.")
    parser.add_argument("--max-concurrent", type=int, default=10, help="Maximum concurrent browser sessions.")
    args = parser.parse_args()

    if not args.website.startswith("http"):
        print("Please provide a valid website URL starting with http or https.")
        sys.exit(1)

    asyncio.run(insert_docs_into_supabase(website=args.website, max_depth=args.max_depth, max_concurrent=args.max_concurrent))