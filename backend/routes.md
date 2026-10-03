from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, Field
from uuid import UUID


# ---------- Shared ----------

JobStatus = Literal["queued", "running", "success", "error"]


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    video_url: str | None = None      # Supabase URL,
    code: str | None = None           # plain text, returned inline
    scene_id: str | None = None
    duration: float | None = None
    attempts: int = 0
    error: str | None = None


# ---------- Generate (NL -> new scene) ----------

class GenerateRequest(BaseModel):
    project_id: UUID
    query: str = Field(..., min_length=1)
    duration: int = Field(default=30, gt=0, le=30)
    quality: Literal["low", "medium", "high"] = "low"


@router.post("/projects/{project_id}/generate", response_model=JobResponse, status_code=202)
async def generate(project_id: UUID, request: GenerateRequest, user: User = Depends(get_current_user)) -> JobResponse:
    """Kick off full NL -> scene pipeline. Returns immediately with a job_id."""
    job_id = await enqueue_generation_job(
        project_id=project_id, user_id=user.id,
        query=request.query, duration=request.duration, quality=request.quality,
    )
    return JobResponse(job_id=job_id, status="queued")


# ---------- Render (user-edited code -> video, skips planning) ----------

class RenderRequest(BaseModel):
    code: str = Field(..., min_length=1)
    scene_name: str = "Scene1"
    quality: Literal["low", "medium", "high"] = "low"


@router.post("/scenes/{scene_id}/render", response_model=JobResponse, status_code=202)
async def render(scene_id: UUID, request: RenderRequest, user: User = Depends(get_current_user)) -> JobResponse:
    """Validator -> renderer -> repair only. No planning, no generation."""
    job_id = await enqueue_render_job(scene_id=scene_id, user_id=user.id, code=request.code, quality=request.quality)
    return JobResponse(job_id=job_id, status="queued")


# ---------- AI edit (chat instruction -> patched code -> re-render) ----------

class EditRequest(BaseModel):
    instruction: str = Field(..., min_length=1)
    quality: Literal["low", "medium", "high"] = "low"


@router.post("/scenes/{scene_id}/edit", response_model=JobResponse, status_code=202)
async def edit(scene_id: UUID, request: EditRequest, user: User = Depends(get_current_user)) -> JobResponse:
    """Existing code + instruction -> code_editor node -> validator -> renderer -> repair."""
    job_id = await enqueue_edit_job(scene_id=scene_id, user_id=user.id, instruction=request.instruction, quality=request.quality)
    return JobResponse(job_id=job_id, status="queued")


# ---------- Job polling ----------

@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, user: User = Depends(get_current_user)) -> JobResponse:
    return await fetch_job_status(job_id, user_id=user.id)


# ---------- Listing ----------

@router.get("/projects/{project_id}/scenes")
async def list_scenes(project_id: UUID, user: User = Depends(get_current_user)) -> list[SceneSummary]:
    """All scenes/videos for a project."""
    return await fetch_scenes(project_id, user_id=user.id)


@router.get("/projects")
async def list_projects(user: User = Depends(get_current_user)) -> list[ProjectSummary]:
    """All of the current user's projects."""
    return await fetch_projects(user_id=user.id)


@router.get("/scenes/{scene_id}")
async def get_scene(scene_id: UUID, user: User = Depends(get_current_user)) -> SceneDetail:
    """Current code, video URL, and version count for one scene."""
    return await fetch_scene(scene_id, user_id=user.id)

Every mutation route returns 202 Accepted + a job_id, never the result directly — consistent contract, and your frontend only needs one polling component for generate, render, and edit.
scene_plan / capability_plan are dropped from the default response — they're debug info, not something the frontend needs on every poll. Expose them through a separate GET /jobs/{job_id}/debug if you want them for your own inspection, so the main response stays lean.

The edit route assumes a new code_editor graph node you haven't built yet (existing code + instruction → patched code). That's the one new piece of graph work this design requires — everything else reuses your existing nodes.



