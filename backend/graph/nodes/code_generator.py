from __future__ import annotations

import json
import logging
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from config import DEFAULT_GENERATION_MAX_TOKENS, get_llm
from graph.state import AnimationState
from prompts import CODE_GENERATION_PROMPT

logger = logging.getLogger(__name__)


def generate_code(state: AnimationState) -> dict[str, Any]:
    """Generate executable Manim Python code."""
    scene_class = state.get("scene_class") or "Scene1"

    print("Running code generation...")

    try:
        llm = get_llm(temperature=0.15, max_tokens=DEFAULT_GENERATION_MAX_TOKENS)
        impl_plan = state.get("implementation_plan") or {}
        generation_input = {
            "scene_class": scene_class,
            "request": state.get("request"),
            "mode": state.get("mode", "create"),
            "duration": state.get("duration"),
            "aspect_ratio": state.get("aspect_ratio", "16:9"),
            "voiceover_enabled": state.get("voiceover_enabled", False),
            "implementation_plan": _compact_implementation_plan(impl_plan),
        }
        logger.info("Code generation payload size: %d characters", len(json.dumps(generation_input)))
        response = llm.invoke(
            [
                SystemMessage(content=CODE_GENERATION_PROMPT),
                HumanMessage(
                    content=json.dumps(generation_input, ensure_ascii=False)
                ),
            ]
        )
        code = _strip_code_fence(str(response.content))
        if not _looks_like_scene_code(code):
            raise ValueError("LLM returned no complete Manim Scene implementation")
    except Exception as exc:
        logger.error("Code generation failed: %s", exc, exc_info=True)
        return {
            "generated_code": None,
            "scene_class": scene_class,
            "last_error": str(exc),
            "error": f"Code generation failed: {exc}",
            "failure_type": "generation",
            "repair_target": "code_generator",
        }

    if "from manim import" not in code:
        code = "from manim import *\n\n" + code

    return {"generated_code": code, "scene_class": scene_class}


def _compact_knowledge(
    knowledge: dict[str, Any],
    implementation_plan: dict[str, Any],
) -> dict[str, Any]:
    verified_apis = [
        _compact_api(api)
        for scene in implementation_plan.get("scenes", [])
        for api in scene.get("verified_apis", [])
    ]
    official_examples = [
        _compact_example(example)
        for scene in implementation_plan.get("scenes", [])
        for example in scene.get("reference_examples", [])[:1]
    ]
    spatial_budgets = [
        {
            "scene_id": scene.get("scene_id"),
            "spatial_budget": scene.get("spatial_budget") or scene.get("layout_blueprint", {}),
            "visual_pattern": scene.get("visual_pattern"),
        }
        for scene in implementation_plan.get("scenes", [])
    ]
    return {
        "verified_apis": _unique_selected(verified_apis)[:8],
        "spatial_budgets": spatial_budgets,
        "official_examples": _unique_selected(official_examples)[:1],
    }


def _compact_implementation_plan(plan: dict[str, Any]) -> dict[str, Any]:
    """Keep the generator prompt bounded while retaining implementation evidence."""
    compact_scenes = []
    for scene in plan.get("scenes", [])[:8]:
        compact_scenes.append(
            {
                "scene_id": scene.get("scene_id"),
                "section_name": scene.get("section_name", scene.get("scene_id", "Act")),
                "scene_type": scene.get("scene_type", "2d"),
                "selected_capabilities": scene.get("selected_capabilities", [])[:6],
                "base_scene": scene.get("base_scene"),
                "required_components": [
                    {
                        "purpose": component.get("purpose"),
                        "requirement": str(component.get("requirement", ""))[:180],
                        "api_ids": component.get("api_ids", [])[:12],
                    }
                    for component in scene.get("required_components", [])[:4]
                    if isinstance(component, dict)
                ],
                "spatial_budget": scene.get("spatial_budget") or scene.get("layout_blueprint", {}),
                "visual_pattern": scene.get("visual_pattern"),
                "staging_transition": scene.get("staging_transition", {}),
                "verified_apis": [
                    _compact_api(api)
                    for api in scene.get("verified_apis", [])[:8]
                    if isinstance(api, dict)
                ],
                "supporting_apis": [
                    _compact_api(api)
                    for api in scene.get("supporting_apis", [])[:4]
                    if isinstance(api, dict)
                ],
                "reference_examples": [
                    _compact_example(example)
                    for example in scene.get("reference_examples", [])[:2]
                    if isinstance(example, dict)
                ],
                "constraints": scene.get("constraints", [])[:8],
            }
        )
    return {
        "target_class": plan.get("target_class", "Scene1"),
        "base_class": plan.get("base_class", "Scene"),
        "helper_methods": plan.get("helper_methods", []),
        "scenes": compact_scenes,
    }


def _compact_scene_plan(plan: dict[str, Any]) -> dict[str, Any]:
    return {
        "project_intent": plan.get("project_intent", {}),
        "global_visual_direction": plan.get("global_visual_direction", {}),
        "scenes": [
            {
                "id": scene.get("id"),
                "purpose": str(scene.get("purpose", ""))[:180],
                "duration": scene.get("duration"),
                "visual_elements": scene.get("visual_elements", [])[:5],
                "actions": scene.get("actions", [])[:5],
                "staging_transition": scene.get("staging_transition", {
                    "clear_mode": "fade_out_all",
                    "persistent_elements": [],
                    "transition_note": "Clear temporary objects between acts",
                }),
            }
            for scene in plan.get("scenes", [])[:8]
            if isinstance(scene, dict)
        ],
    }


def _compact_capability_plan(plan: dict[str, Any]) -> dict[str, Any]:
    return {
        "scenes": [
            {
                "scene_id": scene.get("scene_id"),
                "capabilities": scene.get("capabilities", [])[:4],
                "implementation_requirements": [
                    {
                        "target": item.get("target"),
                        "requirement": str(item.get("requirement", ""))[:180],
                    }
                    for item in scene.get("implementation_requirements", [])[:4]
                    if isinstance(item, dict)
                ],
                "constraints": scene.get("constraints", [])[:6],
            }
            for scene in plan.get("scenes", [])[:8]
            if isinstance(scene, dict)
        ]
    }


def _compact_trace(trace: dict[str, Any]) -> dict[str, Any]:
    return {
        "capabilities_selected": trace.get("capabilities_selected", [])[:20],
        "apis_selected": trace.get("apis_selected", [])[:30],
        "examples_selected": trace.get("examples_selected", [])[:10],
        "rejected_candidates": trace.get("rejected_candidates", [])[:20],
    }


def _compact_api(api: dict[str, Any]) -> dict[str, Any]:
    result = _select(
        api,
        [
            "id",
            "name",
            "qualified_name",
            "kind",
            "signature",
            "parameters",
            "methods",
            "description",
            "constraints",
        ],
    )
    if isinstance(result.get("parameters"), list):
        result["parameters"] = result["parameters"][:20]
    if isinstance(result.get("methods"), list):
        result["methods"] = result["methods"][:12]
    if isinstance(result.get("description"), str):
        result["description"] = result["description"][:900]
    return result


def _compact_example(example: dict[str, Any]) -> dict[str, Any]:
    result = _select(example, ["id", "title"])
    if example.get("code"):
        code = str(example["code"])
        # Truncate only on complete-line boundaries to avoid injecting
        # invalid mid-expression Python into the LLM context.
        if len(code) > 600:
            lines = code.splitlines(keepends=True)
            truncated, total = [], 0
            for line in lines:
                if total + len(line) > 600:
                    break
                truncated.append(line)
                total += len(line)
            code = "".join(truncated)
        result["code"] = code
    return result


def _unique_selected(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    seen: set[str] = set()
    for record in records:
        record_id = record.get("id") or record.get("qualified_name")
        if not record_id or record_id in seen:
            continue
        seen.add(record_id)
        unique.append(record)
    return unique


def _select(record: dict[str, Any], keys: list[str]) -> dict[str, Any]:
    selected = {}
    for key in keys:
        if key not in record:
            continue
        value = record[key]
        if isinstance(value, str) and len(value) > 1800:
            value = value[:1800]
        if isinstance(value, list):
            value = value[:20]
        selected[key] = value
    return selected


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:python)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    return text


def _looks_like_scene_code(code: str) -> bool:
    import re
    valid_bases = (
        "Scene",
        "ThreeDScene",
        "SpecialThreeDScene",
        "MovingCameraScene",
        "ZoomedScene",
        "LinearTransformationScene",
        "VectorScene",
    )
    # Match class definitions with any valid base, allowing whitespace and qualified names
    pattern = r"class\s+\w+\s*\([^)]*(?:" + "|".join(valid_bases) + r")[^)]*\)"
    return (
        len(code.strip()) >= 50
        and bool(re.search(pattern, code))
        and "def construct" in code
    )
