from __future__ import annotations

from pathlib import Path
from typing import Any

from db.supabase_client import get_supabase


def list_buckets() -> list[Any]:
    return get_supabase().storage.list_buckets()


def get_bucket(bucket_name: str) -> Any:
    return get_supabase().storage.get_bucket(bucket_name)


def upload_file_to_bucket(bucket_name: str, file_path: str, file_name: str) -> Any:
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    with path.open("rb") as file:
        return get_supabase().storage.from_(bucket_name).upload(file_name, file)


def public_file_url(bucket_name: str, file_name: str) -> str:
    return str(get_supabase().storage.from_(bucket_name).get_public_url(file_name))
