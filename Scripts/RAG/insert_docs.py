import sys
import asyncio
from crawl_recursive import crawl_recursive_internal_links
from utils import process_doc,insert_chunk

async def insert_docs_into_supabase(website :str = "https://docs.manim.community/en/stable/reference.html",max_depth: int = 5, max_concurrent: int = 10):
    """Inserts crawled documents into Supabase."""
    crawl_results = await crawl_recursive_internal_links([website], max_depth=max_depth, max_concurrent=max_concurrent)
    if not crawl_results:
        print("No documents found to insert.")
        sys.exit(1)
    
    print(f"Inserting {len(crawl_results)} docs into Supabase collection...")
    # tasks = [process_chunk(i, crawl_result) for i, crawl_result in enumerate(crawl_results)]
    # processed_chunks = await asyncio.gather(*tasks)
    # insert_tasks = [insert_chunk(chunk) for chunk in processed_chunks]
    # await asyncio.gather(*insert_tasks)
    async def process_and_insert(crawl_result):
        chunks = await process_doc(crawl_result)
        await asyncio.gather(*(insert_chunk(chunk) for chunk in chunks if chunk))

    await asyncio.gather(*(process_and_insert( result) for  result in crawl_results))


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Insert crawled documents into Supabase.")
    parser.add_argument("--website", type=str,default="https://docs.manim.community/en/stable/reference.html" ,help="Website URL to crawl and insert documents from.")
    parser.add_argument("--max-depth", type=int, default=3, help="Maximum recursion depth for crawling.")
    parser.add_argument("--max-concurrent", type=int, default=10, help="Maximum concurrent browser sessions.")
    args = parser.parse_args()

    if not args.website.startswith("http"):
        print("Please provide a valid website URL starting with http or https.")
        sys.exit(1)

    asyncio.run(insert_docs_into_supabase(website=args.website, max_depth=args.max_depth, max_concurrent=args.max_concurrent))
