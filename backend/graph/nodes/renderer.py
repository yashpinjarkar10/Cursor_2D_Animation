from __future__ import annotations

import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from config import MANIM_TIMEOUT, OUTPUT_DIR
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

    if not code.strip():
        return _failure("No generated code to render", "runtime")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()

    with tempfile.TemporaryDirectory(prefix="manim_render_") as temp_dir:
        temp_path = Path(temp_dir)
        source_path = temp_path / "scene.py"
        source_path.write_text(code, encoding="utf-8")
        media_dir = temp_path / "media"

        command = [
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
            error = result.stderr.strip() or result.stdout.strip() or "Manim render failed"
            return _failure(error, "runtime", result.stdout, result.stderr, elapsed)

        expected_path = media_dir / "videos" / source_path.stem / QUALITY_DIRS.get(quality, "480p15") / f"{scene_class}.mp4"
        if not expected_path.exists():
            matches = list(media_dir.rglob(f"{scene_class}.mp4"))
            expected_path = matches[0] if matches else expected_path

        if not expected_path.exists():
            return _failure(f"Video file not found at expected path: {expected_path}", "runtime", result.stdout, result.stderr, elapsed)

        timestamp = int(time.time() * 1000)
        video_path = OUTPUT_DIR / f"animation_{timestamp}.mp4"
        code_path = OUTPUT_DIR / f"code_{timestamp}.py"
        shutil.copy2(expected_path, video_path)
        code_path.write_text(code, encoding="utf-8")

    execution_result = {
        "status": "success",
        "video_path": str(video_path),
        "code_path": str(code_path),
        "duration": elapsed,
        "logs": result.stdout,
        "stderr": result.stderr,
        "error": None,
    }
    return {
        "execution_result": execution_result,
        "final_video": str(video_path),
        "code_path": str(code_path),
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
            "status": "failure",
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
