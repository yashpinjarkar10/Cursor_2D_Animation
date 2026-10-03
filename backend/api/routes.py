from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse

from api.schemas import (
    EditRequest,
    GenerateRequest,
    ProjectSummary,
    RenderRequest,
    SceneDetail,
    SceneSummary,
)
from config import OUTPUT_DIR
from graph.graph import graph, initial_state
from graph.nodes.renderer import render_code
from graph.nodes.retrieval import get_knowledge
from graph.nodes.validator import validate_code

router = APIRouter()

_scene_results: dict[str, SceneDetail] = {}
_project_scenes: dict[str, list[str]] = {}


@router.post("/projects/{project_id}/generate", response_model=SceneDetail)
async def generate(
    project_id: UUID,
    request: GenerateRequest,
) -> SceneDetail:
    """Generate and render a scene."""
    if request.project_id != project_id:
        raise HTTPException(status_code=400, detail="Body project_id must match path project_id")

    return await generate_scene(project_id, request)


@router.post("/scenes/{scene_id}/render", response_model=SceneDetail)
async def render(
    scene_id: UUID,
    request: RenderRequest,
) -> SceneDetail:
    """Validator -> renderer. No planning or generation."""
    return await render_scene(scene_id, request)


@router.post("/scenes/{scene_id}/edit")
async def edit(scene_id: UUID, request: EditRequest) -> None:
    """Edit scenes once the code-editor workflow is implemented."""
    raise HTTPException(status_code=501, detail="Edit workflow is not implemented yet.")


@router.get("/projects/{project_id}/scenes", response_model=list[SceneSummary])
async def list_scenes(project_id: UUID) -> list[SceneSummary]:
    """All scenes/videos for a project."""
    return await fetch_scenes(project_id)


@router.get("/projects", response_model=list[ProjectSummary])
async def list_projects() -> list[ProjectSummary]:
    """All known in-memory projects."""
    return await fetch_projects()


@router.get("/scenes/{scene_id}", response_model=SceneDetail)
async def get_scene(scene_id: UUID) -> SceneDetail:
    """Current code, video URL, and version count for one scene."""
    return await fetch_scene(scene_id)


async def generate_scene(
    project_id: UUID,
    request: GenerateRequest,
) -> SceneDetail:
    scene_id = str(uuid4())
    _project_scenes.setdefault(str(project_id), []).append(scene_id)
    try:
        return await _run_generate(project_id, scene_id, request)
    except Exception:
        _project_scenes[str(project_id)].remove(scene_id)
        raise


async def render_scene(scene_id: UUID, request: RenderRequest) -> SceneDetail:
    return await _run_render(str(scene_id), request)


async def fetch_scenes(project_id: UUID) -> list[SceneSummary]:
    scene_ids = _project_scenes.get(str(project_id), [])
    return [
        SceneSummary(
            scene_id=scene_id,
            project_id=str(project_id),
            name=_scene_results.get(scene_id).name if scene_id in _scene_results else None,
            video_url=_scene_results.get(scene_id).video_url if scene_id in _scene_results else None,
        )
        for scene_id in scene_ids
    ]


async def fetch_projects() -> list[ProjectSummary]:
    return [ProjectSummary(project_id=project_id) for project_id in _project_scenes]


async def fetch_scene(scene_id: UUID) -> SceneDetail:
    scene = _scene_results.get(str(scene_id))
    if not scene:
        raise HTTPException(
            status_code=501,
            detail="Scene persistence is not implemented yet; only scenes created during this process are available.",
        )
    return scene


@router.get("/storage/buckets")
async def storage_buckets() -> list[Any]:
    """Return Supabase storage buckets."""
    from db.supabase_bucket import list_buckets

    try:
        return list_buckets()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Supabase storage request failed: {exc}") from exc


@router.get("/video/{filename}")
async def video(filename: str) -> FileResponse:
    """Serve a generated video file."""
    path = _safe_output_path(filename)
    if not path.exists() or path.suffix.lower() != ".mp4":
        raise HTTPException(status_code=404, detail="Video file not found")
    return FileResponse(path=path, media_type="video/mp4", filename=path.name)


@router.get("/get_code/{filename}", response_class=PlainTextResponse)
async def get_code(filename: str) -> str:
    """Return saved generated code."""
    path = _safe_output_path(filename)
    if path.suffix.lower() != ".py":
        path = path.with_suffix(".py")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Code file not found")
    return path.read_text(encoding="utf-8")


@router.get("/")
async def health() -> dict[str, Any]:
    """Return API and knowledge health."""
    try:
        knowledge_health = get_knowledge().health()
    except Exception as exc:
        knowledge_health = {"status": "error", "error": str(exc)}

    return {
        "service": "Manim Animation API",
        "version": "3.1.0",
        "status": "running",
        "endpoints": {
            "POST /projects/{project_id}/generate": "Generate an animation",
            "POST /scenes/{scene_id}/render": "Render scene code",
            "POST /scenes/{scene_id}/edit": "Edit scene code",
            "GET /projects/{project_id}/scenes": "List project scenes",
            "GET /projects": "List projects",
            "GET /scenes/{scene_id}": "Read scene details",
            "GET /storage/buckets": "List Supabase storage buckets",
        },
        "knowledge": knowledge_health,
    }


async def _run_generate(
    project_id: UUID,
    scene_id: str,
    request: GenerateRequest,
) -> SceneDetail:
    state = initial_state(
        request.query,
        mode=request.mode,
        voiceover_enabled=request.voiceover_enabled,
        duration=request.duration,
        aspect_ratio=request.aspect_ratio,
        project_context=request.project_context,
        render_config={"quality": request.quality, "duration": request.duration},
    )
    final_state: dict[str, Any] = dict(state)
    async for update in graph.astream(state, stream_mode="updates"):
        node_output = next(iter(update.values()))
        if isinstance(node_output, dict):
            final_state.update(node_output)

    execution = final_state.get("execution_result") or {}
    if execution.get("status") != "success" or not final_state.get("final_video"):
        raise HTTPException(status_code=500, detail=_final_error(final_state) or "Generation failed")

    scene = SceneDetail(
        scene_id=scene_id,
        project_id=str(project_id),
        name=final_state.get("scene_class") or "Scene1",
        video_url=_public_video_path(final_state.get("final_video")),
        code=final_state.get("generated_code"),
        duration=execution.get("duration"),
        version_count=1,
    )
    _scene_results[scene_id] = scene
    return scene


async def _run_render(scene_id: str, request: RenderRequest) -> SceneDetail:
    state = {
        "generated_code": request.code,
        "scene_class": request.scene_name,
        "render_config": {"quality": request.quality},
        "attempt_count": 0,
        "max_attempts": 0,
    }
    state.update(validate_code(state))
    validation = state.get("validation_result") or {}
    if validation.get("status") != "pass":
        errors = validation.get("errors") or [{"message": "Validation failed"}]
        first = errors[0]
        detail = first.get("message") if isinstance(first, dict) else str(first)
        raise HTTPException(status_code=400, detail=detail)

    state.update(await asyncio.to_thread(render_code, state))
    execution = state.get("execution_result") or {}
    if execution.get("status") != "success":
        raise HTTPException(status_code=500, detail=execution.get("error") or "Render failed")

    current = _scene_results.get(scene_id)
    scene = SceneDetail(
        scene_id=scene_id,
        project_id=current.project_id if current else None,
        name=request.scene_name,
        video_url=_public_video_path(state.get("final_video")),
        code=request.code,
        duration=execution.get("duration"),
        version_count=(current.version_count + 1) if current else 1,
    )
    _scene_results[scene_id] = scene
    return scene


def _safe_output_path(filename: str) -> Path:
    return OUTPUT_DIR / Path(filename).name


def _public_video_path(path: str | None) -> str | None:
    if not path:
        return None
    return f"generated_videos/{Path(path).name}"


def _final_error(state: dict[str, Any]) -> str | None:
    if state.get("error"):
        return str(state["error"])

    execution = state.get("execution_result") or {}
    if execution.get("error"):
        return str(execution["error"])

    validation = state.get("validation_result") or {}
    errors = validation.get("errors") or []
    if errors:
        first = errors[0]
        if isinstance(first, dict):
            return str(first.get("message") or first)
        return str(first)

    return None
