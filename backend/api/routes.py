from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse

from api.schemas import GenerateRequest, GenerateResponse, RenderRequest, RenderResponse
from config import OUTPUT_DIR
from graph.graph import graph, initial_state
from graph.nodes.renderer import render_code
from graph.nodes.retrieval import get_knowledge
from graph.nodes.validator import validate_code

router = APIRouter()


@router.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest) -> GenerateResponse:
    """Run the full generation pipeline and return metadata."""
    state = initial_state(request.query, request.project_context)
    final_state = graph.invoke(state)
    execution = final_state.get("execution_result") or {}
    status = "success" if execution.get("status") == "success" and final_state.get("final_video") else "error"
    error = _final_error(final_state)

    return GenerateResponse(
        status=status,
        video_path=_public_video_path(final_state.get("final_video")),
        code=final_state.get("generated_code"),
        code_path=_public_code_path(final_state.get("code_path")),
        scene_plan=final_state.get("scene_plan"),
        capability_plan=final_state.get("capability_plan"),
        duration=execution.get("duration"),
        attempts=int(final_state.get("attempt_count", 0)),
        error=error if status == "error" else None,
    )


@router.post("/render", response_model=RenderResponse)
async def render(request: RenderRequest) -> RenderResponse:
    """Render provided Manim code and return metadata."""
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
        return RenderResponse(
            status="error",
            error=(validation.get("errors") or [{"message": "Validation failed"}])[0]["message"],
        )

    state.update(render_code(state))
    execution = state.get("execution_result") or {}
    status = "success" if execution.get("status") == "success" else "error"
    return RenderResponse(
        status=status,
        video_path=_public_video_path(state.get("final_video")),
        code_path=_public_code_path(state.get("code_path")),
        duration=execution.get("duration"),
        attempts=0,
        error=execution.get("error") if status == "error" else None,
    )


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
        "version": "3.0.0",
        "status": "running",
        "endpoints": {
            "POST /generate": "Generate animation metadata",
            "POST /render": "Render provided Manim code",
            "GET /video/{filename}": "Download generated video",
            "GET /get_code/{filename}": "Read generated code",
        },
        "knowledge": knowledge_health,
    }


def _safe_output_path(filename: str) -> Path:
    return OUTPUT_DIR / Path(filename).name


def _public_video_path(path: str | None) -> str | None:
    if not path:
        return None
    return f"generated_videos/{Path(path).name}"


def _public_code_path(path: str | None) -> str | None:
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
