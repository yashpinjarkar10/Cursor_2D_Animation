from __future__ import annotations

from typing import Literal

from langgraph.graph import END, START, StateGraph

from config import MAX_REPAIR_ATTEMPTS
from graph.nodes.capability_planner import plan_capabilities
from graph.nodes.code_generator import generate_code
from graph.nodes.normalization import normalize_request
from graph.nodes.renderer import render_code
from graph.nodes.repair import repair_code
from graph.nodes.retrieval import retrieve_knowledge
from graph.nodes.scene_director import direct_scene
from graph.nodes.validator import validate_code
from graph.state import AnimationState


def build_graph():
    """Build the Manim animation LangGraph workflow."""
    builder = StateGraph(AnimationState)
    builder.add_node("normalization", normalize_request)
    builder.add_node("scene_director", direct_scene)
    builder.add_node("capability_planner", plan_capabilities)
    builder.add_node("retrieval", retrieve_knowledge)
    builder.add_node("code_generator", generate_code)
    builder.add_node("validator", validate_code)
    builder.add_node("renderer", render_code)
    builder.add_node("repair", repair_code)

    builder.add_edge(START, "normalization")
    builder.add_edge("normalization", "scene_director")
    builder.add_edge("scene_director", "capability_planner")
    builder.add_edge("capability_planner", "retrieval")
    builder.add_edge("retrieval", "code_generator")
    builder.add_edge("code_generator", "validator")
    builder.add_conditional_edges(
        "validator",
        _route_after_validation,
        {"renderer": "renderer", "repair": "repair", "end": END},
    )
    builder.add_conditional_edges(
        "renderer",
        _route_after_render,
        {"repair": "repair", "end": END},
    )
    builder.add_conditional_edges(
        "repair",
        _route_after_repair,
        {"validator": "validator", "end": END},
    )
    return builder.compile()


def initial_state(
    request: str,
    project_context: dict | None = None,
    render_config: dict | None = None,
) -> AnimationState:
    """Create the default state for a generation run."""
    return {
        "request": request,
        "project_context": project_context,
        "scene_plan": None,
        "capability_plan": None,
        "retrieved_knowledge": None,
        "generated_code": None,
        "scene_class": "Scene1",
        "code_path": None,
        "validation_result": None,
        "execution_result": None,
        "render_config": render_config or {},
        "attempt_count": 0,
        "max_attempts": MAX_REPAIR_ATTEMPTS,
        "last_error": None,
        "failure_type": None,
        "repair_target": None,
        "final_video": None,
        "error": None,
        "voiceover_enabled": False,
        "voiceover_config": None,
    }


def _route_after_validation(state: AnimationState) -> Literal["renderer", "repair", "end"]:
    validation = state.get("validation_result") or {}
    if validation.get("status") == "pass":
        return "renderer"
    if int(state.get("attempt_count", 0)) >= int(state.get("max_attempts", MAX_REPAIR_ATTEMPTS)):
        return "end"
    return "repair"


def _route_after_render(state: AnimationState) -> Literal["repair", "end"]:
    execution = state.get("execution_result") or {}
    if execution.get("status") == "success":
        return "end"
    if int(state.get("attempt_count", 0)) >= int(state.get("max_attempts", MAX_REPAIR_ATTEMPTS)):
        return "end"
    return "repair"


def _route_after_repair(state: AnimationState) -> Literal["validator", "end"]:
    if state.get("error"):
        return "end"
    if int(state.get("attempt_count", 0)) > int(state.get("max_attempts", MAX_REPAIR_ATTEMPTS)):
        return "end"
    return "validator"


graph = build_graph()
