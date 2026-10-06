from __future__ import annotations

from typing import Any

from supabase import Client, create_client

from config import SUPABASE_KEY, SUPABASE_URL


# Initialize and return authenticated Supabase admin client
def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY must be set")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# Lazy proxy to defer Supabase client initialization until first access
class _LazySupabase:
    def __getattr__(self, name: str) -> Any:
        return getattr(get_supabase(), name)


# Global Supabase client instance
supabase: Client = _LazySupabase()  # type: ignore[assignment]
