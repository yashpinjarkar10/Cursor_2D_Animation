from __future__ import annotations

from typing import Any, Literal, TypedDict


class StagingTransition(TypedDict, total=False):
    clear_mode: Literal["fade_out_all", "keep_persistent", "transform_to_next"]
    persistent_elements: list[str]
    transition_note: str


class StoryboardScene(TypedDict, total=False):
    id: str
    purpose: str
    duration: float
    visual_elements: list[str]
    actions: list[str]
    staging_transition: StagingTransition
    narration: str | None
    dependencies: list[str]


class ScenePlan(TypedDict, total=False):
    request_type: str
    project_intent: dict[str, Any]
    duration: dict[str, Any]
    global_visual_direction: dict[str, Any]
    scenes: list[StoryboardScene]
    global_timeline: dict[str, Any]


class SpatialBudget(TypedDict, total=False):
    zones: dict[str, dict[str, Any]]
    coordinate_anchors: dict[str, list[float] | str]
    margins: dict[str, float]
    layout_rules: list[str]


class ImplementationScene(TypedDict, total=False):
    scene_id: str
    section_name: str
    scene_type: Literal["2d", "3d", "moving_camera"]
    selected_capabilities: list[str]
    base_scene: dict[str, Any]
    required_components: list[dict[str, Any]]
    spatial_budget: SpatialBudget
    visual_pattern: dict[str, Any] | None
    staging_transition: StagingTransition
    verified_apis: list[dict[str, Any]]
    supporting_apis: list[dict[str, Any]]
    reference_examples: list[dict[str, Any]]
    constraints: list[str]


class ImplementationPlan(TypedDict, total=False):
    target_class: str
    base_class: str
    helper_methods: list[str]
    scenes: list[ImplementationScene]
    global_rules: list[str]


class ValidationError(TypedDict, total=False):
    type: str
    message: str
    line: int | None


class ValidationResult(TypedDict, total=False):
    status: Literal["pass", "fail"]
    errors: list[ValidationError]
    warnings: list[dict[str, Any]]


class ExecutionResult(TypedDict, total=False):
    status: Literal["success", "error"]
    stdout: str
    stderr: str
    exit_code: int
    video_path: str | None
    traceback: str | None


class AnimationState(TypedDict, total=False):
    request: str
    mode: str
    voiceover_enabled: bool
    duration: float | None
    aspect_ratio: str

    project_context: dict[str, Any] | None

    scene_plan: ScenePlan | None
    capability_plan: dict[str, Any] | None
    retrieved_knowledge: dict[str, Any] | None
    implementation_plan: ImplementationPlan | None
    retrieval_trace: dict[str, Any] | None
    repair_knowledge: dict[str, Any] | None

    generated_code: str | None
    scene_class: str
    code_path: str | None
    validation_result: ValidationResult | None
    execution_result: ExecutionResult | None
    render_config: dict[str, Any]

    attempt_count: int
    max_attempts: int
    last_error: str | None
    failure_type: str | None
    repair_target: str | None

    final_video: str | None
    error: str | None

    voiceover_config: dict[str, Any] | None
