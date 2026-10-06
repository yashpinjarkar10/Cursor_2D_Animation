from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Any

from db.supabase_client import get_supabase


# List all storage buckets in the Supabase project
def list_buckets() -> list[Any]:
    return get_supabase().storage.list_buckets()


# Retrieve bucket metadata by bucket name
def get_bucket(bucket_name: str) -> Any:
    return get_supabase().storage.get_bucket(bucket_name)


# Upload a local file to the designated Supabase bucket
def upload_file_to_bucket(bucket_name: str, file_path: str, file_name: str) -> Any:
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    mime_type, _ = mimetypes.guess_type(str(path))
    content_type = mime_type or "video/mp4"

    with path.open("rb") as file:
        return get_supabase().storage.from_(bucket_name).upload(
            file_name,
            file,
            file_options={"content-type": content_type, "upsert": "true"},
        )


# Get public HTTPS URL for a file in a storage bucket
def public_file_url(bucket_name: str, file_name: str) -> str:
    return str(get_supabase().storage.from_(bucket_name).get_public_url(file_name))
