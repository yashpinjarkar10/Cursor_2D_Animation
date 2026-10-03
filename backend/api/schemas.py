from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


Quality = Literal["low", "medium", "high"]
RequestMode = Literal["create", "modify", "extend", "remove", "restructure"]


class GenerateRequest(BaseModel):
    project_id: UUID
    query: str = Field(..., min_length=1)
    mode: RequestMode = "create"
    voiceover_enabled: bool = False
    duration: float = Field(default=30, gt=0, le=30)
    aspect_ratio: str = "16:9"
    quality: Quality = "low"
    project_context: dict[str, Any] | None = None


class RenderRequest(BaseModel):
    code: str = Field(..., min_length=1)
    scene_name: str = "Scene1"
    quality: Quality = "low"


class EditRequest(BaseModel):
    instruction: str = Field(..., min_length=1)
    quality: Quality = "low"


class ProjectSummary(BaseModel):
    project_id: str
    name: str | None = None


class SceneSummary(BaseModel):
    scene_id: str
    project_id: str | None = None
    name: str | None = None
    video_url: str | None = None


class SceneDetail(SceneSummary):
    code: str | None = None
    duration: float | None = None
    version_count: int = 0

