from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    query: str = Field(..., min_length=1)
    project_context: dict[str, Any] | None = None


class RenderRequest(BaseModel):
    code: str = Field(..., min_length=1)
    scene_name: str = "Scene1"
    quality: Literal["low", "medium", "high"] = "low"


class GenerateResponse(BaseModel):
    status: Literal["success", "error"]
    video_path: str | None = None
    code: str | None = None
    code_path: str | None = None
    scene_plan: dict[str, Any] | None = None
    capability_plan: dict[str, Any] | None = None
    duration: float | None = None
    attempts: int = 0
    error: str | None = None


class RenderResponse(BaseModel):
    status: Literal["success", "error"]
    video_path: str | None = None
    code_path: str | None = None
    duration: float | None = None
    attempts: int = 0
    error: str | None = None
