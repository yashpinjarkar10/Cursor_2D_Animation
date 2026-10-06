# Storage service for uploading and managing rendered videos in Supabase Storage
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Optional
from uuid import UUID

from db.supabase_bucket import upload_file_to_bucket, public_file_url
from config import SUPABASE_BUCKET_NAME

logger = logging.getLogger(__name__)


# Raised when storage operations fail
class StorageError(Exception):
    pass


# Upload video to Supabase Storage with exponential backoff retry and return public CDN URL
async def upload_video(
    generation_id: UUID,
    local_path: Path,
    max_retries: int = 3,
) -> str:
    if not local_path.exists():
        raise StorageError(f"Video file not found: {local_path}")
    
    if not local_path.suffix.lower() == ".mp4":
        raise StorageError(f"Expected .mp4 file, got: {local_path.suffix}")
    
    storage_filename = f"{generation_id}.mp4"
    
    for attempt in range(max_retries):
        try:
            upload_file_to_bucket(
                SUPABASE_BUCKET_NAME,
                str(local_path),
                storage_filename
            )
            return public_file_url(SUPABASE_BUCKET_NAME, storage_filename)
        except Exception as exc:
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)
                continue
            raise StorageError(
                f"Failed to upload video after {max_retries} attempts: {exc}"
            ) from exc
    
    raise StorageError("Upload failed")


# Delete video file from Supabase Storage bucket
async def delete_video(generation_id: UUID) -> None:
    storage_filename = f"{generation_id}.mp4"
    try:
        from db.supabase_client import get_supabase
        supabase = get_supabase()
        supabase.storage.from_(SUPABASE_BUCKET_NAME).remove([storage_filename])
    except Exception as exc:
        logger.warning(f"Failed to delete video {storage_filename}: {exc}")


# Retrieve public URL for an uploaded video file
async def get_video_url(generation_id: UUID) -> Optional[str]:
    storage_filename = f"{generation_id}.mp4"
    try:
        return public_file_url(SUPABASE_BUCKET_NAME, storage_filename)
    except Exception:
        return None


# Clean up temporary local file after upload
async def delete_local_file(path: Path) -> None:
    try:
        if path.exists() and path.is_file():
            path.unlink()
    except Exception as exc:
        logger.warning(f"Failed to delete local file {path}: {exc}")
