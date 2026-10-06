# Database service for Supabase Postgres operations
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from db.supabase_client import get_supabase

logger = logging.getLogger(__name__)


# Project domain model
class Project(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    user_id: UUID
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# Chat session domain model
class Chat(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    project_id: UUID
    user_id: UUID
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# Generation record domain model
class Generation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    chat_id: UUID
    user_id: UUID
    query: str
    mode: str
    status: str
    duration: Optional[float] = None
    aspect_ratio: Optional[str] = None
    quality: Optional[str] = None
    voiceover_enabled: Optional[bool] = None
    video_url: Optional[str] = None
    video_storage_path: Optional[str] = None
    generated_code: Optional[str] = None
    scene_class: Optional[str] = None
    attempt_count: int = 0
    error_message: Optional[str] = None
    failure_type: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


# Raised when a Supabase Postgres operation fails
class DatabaseError(Exception):
    pass


# Create a new project for a user
async def create_project(
    user_id: UUID,
    name: str,
    description: Optional[str] = None,
) -> UUID:
    try:
        supabase = get_supabase()
        result = (
            supabase.table("projects")
            .insert(
                {
                    "user_id": str(user_id),
                    "name": name,
                    "description": description,
                }
            )
            .execute()
        )
        if not result.data:
            raise DatabaseError("Insert returned no data")
        return UUID(result.data[0]["id"])
    except DatabaseError:
        raise
    except Exception as exc:
        raise DatabaseError(f"Failed to create project: {exc}") from exc


# Retrieve project by ID or return None if not found
async def get_project(project_id: UUID) -> Optional[Project]:
    try:
        supabase = get_supabase()
        result = (
            supabase.table("projects")
            .select("*")
            .eq("id", str(project_id))
            .execute()
        )
        if not result.data:
            return None
        return Project(**result.data[0])
    except Exception as exc:
        raise DatabaseError(f"Failed to get project: {exc}") from exc


# List projects owned by user ordered newest first
async def list_user_projects(user_id: UUID, limit: int = 50) -> list[Project]:
    try:
        supabase = get_supabase()
        result = (
            supabase.table("projects")
            .select("*")
            .eq("user_id", str(user_id))
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [Project(**row) for row in result.data]
    except Exception as exc:
        raise DatabaseError(f"Failed to list projects: {exc}") from exc


async def update_project(
    project_id: UUID,
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> Optional[Project]:
    """
    Partial-update a project. Only non-None fields are written.

    Returns:
        Updated Project, or None if not found.
    """
    payload: dict[str, Any] = {}
    if name is not None:
        payload["name"] = name
    if description is not None:
        payload["description"] = description

    if not payload:
        return await get_project(project_id)

    try:
        supabase = get_supabase()
        result = (
            supabase.table("projects")
            .update(payload)
            .eq("id", str(project_id))
            .execute()
        )
        if not result.data:
            return None
        return Project(**result.data[0])
    except Exception as exc:
        raise DatabaseError(f"Failed to update project: {exc}") from exc


# Delete a project and cascade delete associated chats and generations
async def delete_project(project_id: UUID) -> None:
    try:
        supabase = get_supabase()
        supabase.table("projects").delete().eq("id", str(project_id)).execute()
    except Exception as exc:
        raise DatabaseError(f"Failed to delete project: {exc}") from exc


# Create a new chat session within a project
async def create_chat(
    project_id: UUID,
    user_id: UUID,
    title: Optional[str] = None,
) -> UUID:
    try:
        supabase = get_supabase()
        result = (
            supabase.table("chats")
            .insert(
                {
                    "project_id": str(project_id),
                    "user_id": str(user_id),
                    "title": title,
                }
            )
            .execute()
        )
        if not result.data:
            raise DatabaseError("Insert returned no data")
        return UUID(result.data[0]["id"])
    except DatabaseError:
        raise
    except Exception as exc:
        raise DatabaseError(f"Failed to create chat: {exc}") from exc


# Retrieve chat session by ID or return None if not found
async def get_chat(chat_id: UUID) -> Optional[Chat]:
    try:
        supabase = get_supabase()
        result = (
            supabase.table("chats")
            .select("*")
            .eq("id", str(chat_id))
            .execute()
        )
        if not result.data:
            return None
        return Chat(**result.data[0])
    except Exception as exc:
        raise DatabaseError(f"Failed to get chat: {exc}") from exc


# List all chats in a project ordered newest first
async def list_project_chats(project_id: UUID, limit: int = 100) -> list[Chat]:
    try:
        supabase = get_supabase()
        result = (
            supabase.table("chats")
            .select("*")
            .eq("project_id", str(project_id))
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [Chat(**row) for row in result.data]
    except Exception as exc:
        raise DatabaseError(f"Failed to list chats: {exc}") from exc


# Delete a chat session and cascade delete its generations
async def delete_chat(chat_id: UUID) -> None:
    try:
        supabase = get_supabase()
        supabase.table("chats").delete().eq("id", str(chat_id)).execute()
    except Exception as exc:
        raise DatabaseError(f"Failed to delete chat: {exc}") from exc


# Create a generation record in processing state
async def create_generation(
    chat_id: UUID,
    user_id: UUID,
    query: str,
    mode: str = "create",
    duration: Optional[float] = None,
    aspect_ratio: str = "16:9",
    quality: str = "low",
    voiceover_enabled: bool = False,
    project_context: Optional[dict] = None,
) -> UUID:
    try:
        supabase = get_supabase()
        result = (
            supabase.table("generations")
            .insert(
                {
                    "chat_id": str(chat_id),
                    "user_id": str(user_id),
                    "query": query,
                    "mode": mode,
                    "duration": duration,
                    "aspect_ratio": aspect_ratio,
                    "quality": quality,
                    "voiceover_enabled": voiceover_enabled,
                    "project_context": project_context,
                    "status": "processing",
                    "started_at": datetime.utcnow().isoformat(),
                }
            )
            .execute()
        )
        if not result.data:
            raise DatabaseError("Insert returned no data")
        return UUID(result.data[0]["id"])
    except DatabaseError:
        raise
    except Exception as exc:
        raise DatabaseError(f"Failed to create generation: {exc}") from exc


# Mark a generation as succeeded with code, video URL, and generation metadata
async def update_generation_success(
    generation_id: UUID,
    code: str,
    video_url: str,
    video_storage_path: str,
    scene_class: Optional[str] = None,
    scene_plan: Optional[dict] = None,
    capability_plan: Optional[dict] = None,
    retrieval_trace: Optional[dict] = None,
    implementation_plan: Optional[dict] = None,
    attempt_count: int = 1,
) -> None:
    try:
        supabase = get_supabase()
        supabase.table("generations").update(
            {
                "status": "success",
                "generated_code": code,
                "video_url": video_url,
                "video_storage_path": video_storage_path,
                "scene_class": scene_class,
                "scene_plan": scene_plan,
                "capability_plan": capability_plan,
                "retrieval_trace": retrieval_trace,
                "implementation_plan": implementation_plan,
                "attempt_count": attempt_count,
                "completed_at": datetime.utcnow().isoformat(),
            }
        ).eq("id", str(generation_id)).execute()
    except Exception as exc:
        raise DatabaseError(f"Failed to update generation: {exc}") from exc


# Mark a generation as failed with diagnostic error details
async def update_generation_failure(
    generation_id: UUID,
    error: str,
    failure_type: str,
    attempt_count: int = 1,
) -> None:
    try:
        supabase = get_supabase()
        supabase.table("generations").update(
            {
                "status": "failed",
                "error_message": error,
                "failure_type": failure_type,
                "attempt_count": attempt_count,
                "completed_at": datetime.utcnow().isoformat(),
            }
        ).eq("id", str(generation_id)).execute()
    except Exception as exc:
        raise DatabaseError(f"Failed to update generation: {exc}") from exc


# Retrieve a generation record by ID
async def get_generation(generation_id: UUID) -> Optional[Generation]:
    try:
        supabase = get_supabase()
        result = (
            supabase.table("generations")
            .select("*")
            .eq("id", str(generation_id))
            .execute()
        )
        if not result.data:
            return None
        return Generation(**result.data[0])
    except Exception as exc:
        raise DatabaseError(f"Failed to get generation: {exc}") from exc


# List all generations for a chat ordered newest first
async def list_chat_generations(chat_id: UUID, limit: int = 50) -> list[Generation]:
    try:
        supabase = get_supabase()
        result = (
            supabase.table("generations")
            .select("*")
            .eq("chat_id", str(chat_id))
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [Generation(**row) for row in result.data]
    except Exception as exc:
        raise DatabaseError(f"Failed to list generations: {exc}") from exc


# Upsert a user record on successful authentication
async def ensure_user_exists(
    user_id: UUID, email: str, display_name: Optional[str] = None
) -> None:
    try:
        supabase = get_supabase()
        supabase.table("users").upsert(
            {
                "id": str(user_id),
                "email": email,
                "display_name": display_name,
            }
        ).execute()
    except Exception as exc:
        logger.warning(f"ensure_user_exists failed for {user_id}: {exc}")
