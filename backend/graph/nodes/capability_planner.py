from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from config import DEFAULT_GENERATION_MAX_TOKENS, get_llm
from graph.nodes.retrieval import get_knowledge
from graph.state import AnimationState
from graph.utils import build_scene_query, load_json
from prompts import CAPABILITY_PLANNER_PROMPT

logger = logging.getLogger(__name__)


def plan_capabilities(state: AnimationState) -> dict[str, Any]:
    """Map storyboard scenes to targeted Manim semantic capabilities."""
    scene_plan = state.get("scene_plan") or {}
    scenes = scene_plan.get("scenes", [])
    if not scenes:
        return {"capability_plan": {"scenes": []}}

    print(f"Planning semantic capabilities for {len(scenes)} scenes...")

    candidate_context = _build_candidate_context(scenes, state)

    try:
        llm = get_llm(fast=False, temperature=0.1, max_tokens=DEFAULT_GENERATION_MAX_TOKENS)
        response = llm.invoke(
            [
                SystemMessage(content=CAPABILITY_PLANNER_PROMPT),
                HumanMessage(
                    content=json.dumps(
                        {
                            "scene_plan": scene_plan,
                            "candidate_capabilities_by_scene": candidate_context.get("scenes", []),
                        },
                        ensure_ascii=False,
                    )
                ),
            ]
        )
        raw_plan = load_json(str(response.content))
        capability_plan = _coerce_capability_plan(raw_plan, scenes, candidate_context)
        return {"capability_plan": capability_plan}

    except Exception as exc:
        logger.error(f"Capability planning failed: {exc}", exc_info=True)
        # Explicit error reporting without pretending to have intelligence
        raise RuntimeError(f"Capability planning failed: {exc}") from exc


def _build_candidate_context(
    scenes: list[dict[str, Any]],
    state: AnimationState,
) -> dict[str, Any]:
    """Discover a small, bounded set of candidate capabilities per scene."""
    try:
        knowledge = get_knowledge()
    except Exception as exc:
        logger.error(f"Failed to access knowledge repository: {exc}")
        raise RuntimeError(f"Capability discovery failed: {exc}") from exc

    scene_contexts = []
    for scene in scenes:
        if not isinstance(scene, dict):
            continue

        query = build_scene_query(scene, state.get("request", ""), state.get("mode"))
        # Retrieve candidate semantic capabilities only. Do not manufacture
        # capability IDs when retrieval misses: that would hide a knowledge
        # quality problem and make the planner appear grounded when it is not.
        raw_candidates = knowledge.search_capabilities(query, top_k=8)
        compact_candidates = [
            {
                "id": c.get("id"),
                "name": c.get("name"),
                "description": c.get("description", ""),
            }
            for c in raw_candidates
            if c.get("id")
        ]

        scene_contexts.append(
            {
                "scene_id": scene.get("id"),
                "candidate_capabilities": compact_candidates,
            }
        )

        if not compact_candidates:
            raise ValueError(
                f"No grounded capability candidates found for scene {scene.get('id')!r}."
            )

    return {"scenes": scene_contexts}


def _coerce_capability_plan(
    capability_plan: dict[str, Any],
    scenes: list[dict[str, Any]],
    candidate_context: dict[str, Any],
) -> dict[str, Any]:
    """Enforce strict grounding invariant: every chosen capability must exist in candidates."""
    if not isinstance(capability_plan, dict) or not isinstance(capability_plan.get("scenes"), list):
        raise ValueError("Capability plan returned invalid structure or missing 'scenes' list.")

    context_by_scene = {
        item.get("scene_id"): item
        for item in candidate_context.get("scenes", [])
        if isinstance(item, dict)
    }

    returned_by_id: dict[str, dict[str, Any]] = {}
    for scene in capability_plan["scenes"]:
        if not isinstance(scene, dict):
            continue
        scene_id = scene.get("scene_id") or scene.get("id")
        if scene_id in context_by_scene:
            returned_by_id[scene_id] = scene

    expected_ids = [
        item.get("scene_id")
        for item in candidate_context.get("scenes", [])
        if isinstance(item, dict) and item.get("scene_id")
    ]
    missing_ids = [scene_id for scene_id in expected_ids if scene_id not in returned_by_id]
    if missing_ids:
        raise ValueError(f"Capability plan omitted storyboard scenes: {missing_ids}")

    try:
        knowledge = get_knowledge()
    except Exception:
        knowledge = None

    validated_scenes = []
    for scene_id in expected_ids:
        scene = returned_by_id[scene_id]

        context = context_by_scene.get(scene_id, {})
        allowed_capabilities = {
            item.get("id"): item
            for item in context.get("candidate_capabilities", [])
            if item.get("id")
        }

        # Filter strictly: only capabilities present in candidates are permitted.
        accepted_capabilities = []
        raw_caps = scene.get("capabilities") or scene.get("semantic_capabilities") or []
        for cap in raw_caps:
            if not isinstance(cap, dict):
                continue
            cap_id = cap.get("capability_id") or cap.get("id")
            if cap_id in allowed_capabilities:
                if knowledge is not None:
                    cap_record = knowledge.get_capability(cap_id)
                    if cap_record and not cap_record.get("apis"):
                        continue
                accepted_capabilities.append(
                    {
                        "capability_id": cap_id,
                        "priority": cap.get("priority") if cap.get("priority") in {"required", "optional"} else "required",
                        "reason": str(cap.get("reason") or "").strip(),
                    }
                )

        if not accepted_capabilities:
            raise ValueError(
                f"Capability planner selected no grounded capabilities for scene {scene_id!r}."
            )

        cleaned_scene = {
            "scene_id": scene_id,
            "duration": scene.get("duration", 4),
            "capabilities": accepted_capabilities,
            "implementation_requirements": [
                requirement
                for requirement in scene.get("implementation_requirements", [])
                if isinstance(requirement, dict)
            ],
            "constraints": [str(constraint) for constraint in scene.get("constraints", [])],
        }
        validated_scenes.append(cleaned_scene)

    return {"scenes": validated_scenes}




