from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from config import MANIM_TIMEOUT, TEMP_VIDEO_DIR
from graph.state import AnimationState

QUALITY_FLAGS = {"low": "-ql", "medium": "-qm", "high": "-qh"}
QUALITY_DIRS = {"low": "480p15", "medium": "720p30", "high": "1080p60"}


def render_code(state: AnimationState) -> dict[str, Any]:
    """Render validated Manim code with the CLI."""
    code = state.get("generated_code") or ""
    scene_class = state.get("scene_class") or "Scene1"
    render_config = state.get("render_config") or {}
    quality = render_config.get("quality", "low")
    timeout = int(render_config.get("timeout") or MANIM_TIMEOUT)
    
    # Get generation_id from state for temp filename
    generation_id = state.get("generation_id")

    print("Rendering the video")

    if not code.strip():
        return _failure("No generated code to render", "runtime")

    TEMP_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()

    with tempfile.TemporaryDirectory(prefix="manim_render_") as temp_dir:
        temp_path = Path(temp_dir)
        source_path = temp_path / "scene.py"
        source_path.write_text(code, encoding="utf-8")
        media_dir = temp_path / "media"

        command = [
            sys.executable,
            "-m",
            "manim",
            QUALITY_FLAGS.get(quality, "-ql"),
            "--media_dir",
            str(media_dir),
            str(source_path),
            scene_class,
        ]

        try:
            result = subprocess.run(
                command,
                cwd=temp_path,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            return _failure(f"Manim execution timed out ({timeout} seconds)", "runtime")
        except Exception as exc:
            return _failure(f"Could not run Manim: {exc}", "runtime")

        elapsed = time.perf_counter() - started
        if result.returncode != 0:
            raw_error = result.stderr.strip() or result.stdout.strip() or "Manim render failed"
            error = _summarize_error(raw_error)
            return _failure(error, "runtime", result.stdout, result.stderr, elapsed)

        expected_path = media_dir / "videos" / source_path.stem / QUALITY_DIRS.get(quality, "480p15") / f"{scene_class}.mp4"
        if not expected_path.exists():
            matches = list(media_dir.rglob(f"{scene_class}.mp4"))
            expected_path = matches[0] if matches else expected_path

        if not expected_path.exists():
            return _failure(f"Video file not found at expected path: {expected_path}", "runtime", result.stdout, result.stderr, elapsed)

        # Save to temp directory with generation_id as filename
        if generation_id:
            video_path = TEMP_VIDEO_DIR / f"{generation_id}.mp4"
        else:
            # Fallback to timestamp if no generation_id
            timestamp = int(time.time() * 1000)
            video_path = TEMP_VIDEO_DIR / f"animation_{timestamp}.mp4"
        
        shutil.copy2(expected_path, video_path)

    execution_result = {
        "status": "success",
        "video_path": str(video_path),
        "duration": elapsed,
        "logs": result.stdout,
        "stderr": result.stderr,
        "error": None,
    }
    return {
        "execution_result": execution_result,
        "final_video": str(video_path),
        "error": None,
        "last_error": None,
        "failure_type": None,
        "repair_target": None,
    }


def _failure(
    message: str,
    failure_type: str,
    logs: str = "",
    stderr: str = "",
    duration: float | None = None,
) -> dict[str, Any]:
    return {
        "execution_result": {
            "status": "error",
            "video_path": None,
            "code_path": None,
            "duration": duration,
            "logs": logs,
            "stderr": stderr,
            "error": message,
        },
        "last_error": message,
        "failure_type": failure_type,
        "repair_target": "renderer",
    }


def _summarize_error(error: str) -> str:
    """Keep the actionable traceback tail while preserving the original error."""
    lines = [line.strip() for line in error.splitlines() if line.strip()]
    if not lines:
        return "Manim render failed"
    traceback_lines = [
        line
        for line in lines
        if "Error:" in line or line.startswith(("File ", "NameError", "TypeError", "AttributeError", "ValueError"))
    ]
    if traceback_lines:
        return "\n".join(traceback_lines[-12:])
    return "\n".join(lines[-12:])
