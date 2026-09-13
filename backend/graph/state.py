from __future__ import annotations

from typing import Any, TypedDict


class AnimationState(TypedDict, total=False):
    request: str
    normalized_request: dict[str, Any]
    request_type: str
    project_context: dict[str, Any] | None

    scene_plan: dict[str, Any] | None
    capability_plan: dict[str, Any] | None
    retrieved_knowledge: dict[str, Any] | None

    generated_code: str | None
    scene_class: str
    code_path: str | None

    validation_result: dict[str, Any] | None
    execution_result: dict[str, Any] | None
    render_config: dict[str, Any]

    attempt_count: int
    max_attempts: int
    last_error: str | None
    failure_type: str | None
    repair_target: str | None

    final_video: str | None
    error: str | None

    voiceover_enabled: bool
    voiceover_config: dict[str, Any] | None
