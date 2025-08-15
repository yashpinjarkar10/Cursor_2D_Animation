import sys
import re
import asyncio
from typing import List, Dict, Any
from urllib.parse import urlparse, urldefrag
from dataclasses import dataclass

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode, MemoryAdaptiveDispatcher,DefaultMarkdownGenerator
from crawl4ai.content_filter_strategy import PruningContentFilter

@dataclass
class CrawlResult:
    url: str
    # raw_markdown: str
    filtered_markdown: str

async def crawl_recursive_internal_links(start_urls, max_depth=3, max_concurrent=10) -> List[Dict[str,Any]]:
    """Recursive crawl using logic from 5-crawl_recursive_internal_links.py. Returns list of dicts with url and markdown."""
    prune_filter = PruningContentFilter(
    threshold=0.5,
    threshold_type="fixed",  # for static webpages
    )
    md_generator = DefaultMarkdownGenerator(
        # content_source="raw_html",
        content_filter=prune_filter,
    )
    browser_config = BrowserConfig(headless=True, verbose=False)
    run_config = CrawlerRunConfig(markdown_generator=md_generator,cache_mode=CacheMode.BYPASS, stream=False)
    dispatcher = MemoryAdaptiveDispatcher(
        memory_threshold_percent=70.0,
        check_interval=1.0,
        max_session_permit=max_concurrent
    )

    visited = set()

    def normalize_url(url):
        return urldefrag(url)[0]

    current_urls = set([normalize_url(u) for u in start_urls])
    results_all = []

    async with AsyncWebCrawler(config=browser_config) as crawler:
        for depth in range(max_depth):
            urls_to_crawl = [normalize_url(url) for url in current_urls if normalize_url(url) not in visited]
            if not urls_to_crawl:
                break

            results = await crawler.arun_many(urls=urls_to_crawl, config=run_config, dispatcher=dispatcher)
            next_level_urls = set()

            for result in results:
                norm_url = normalize_url(result.url)
                visited.add(norm_url)

                if result.success and result.markdown:
                    results_all.append(
                        CrawlResult(url= result.url, 
                                    # raw_markdown= result.markdown,
                                    filtered_markdown= result.markdown.fit_markdown)
                        )
                    for link in result.links.get("internal", []):
                        next_url = normalize_url(link["href"])
                        if next_url not in visited:
                            next_level_urls.add(next_url)

            current_urls = next_level_urls

    return results_all
