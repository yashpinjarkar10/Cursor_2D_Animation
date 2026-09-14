from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from config import get_llm
from graph.nodes.retrieval import get_knowledge
from graph.state import AnimationState
from prompts import CAPABILITY_PLANNER_PROMPT


def plan_capabilities(state: AnimationState) -> dict[str, Any]:
    """Map storyboard scenes to targeted Manim capabilities."""
    scene_plan = state.get("scene_plan") or {}
    scenes = scene_plan.get("scenes", [])
    candidate_context = _build_candidate_context(scenes)

    try:
        llm = get_llm(temperature=0.2)
        response = llm.invoke(
            [
                SystemMessage(content=CAPABILITY_PLANNER_PROMPT),
                HumanMessage(
                    content=json.dumps(
                        {
                            "scene_plan": scene_plan,
                            "candidate_context": candidate_context,
                        },
                        ensure_ascii=False,
                    )
                ),
            ]
        )
        capability_plan = _load_json(str(response.content))
    except Exception as exc:
        capability_plan = _fallback_capability_plan(scenes, candidate_context)
        capability_plan["_warning"] = str(exc)

    return {"capability_plan": _coerce_capability_plan(capability_plan, scenes, candidate_context)}


def _build_candidate_context(scenes: list[dict[str, Any]]) -> dict[str, Any]:
    try:
        knowledge = get_knowledge()
    except Exception as exc:
        return {"warning": str(exc), "scenes": []}

    scene_contexts = []
    for scene in scenes:
        query = _scene_query(scene)
        capabilities = knowledge.search_capabilities(query, top_k=5)
        api_candidates: list[dict[str, Any]] = []
        examples: list[dict[str, Any]] = []

        for result in capabilities[:3]:
            capability_id = result.get("id")
            if not capability_id:
                continue
            context = knowledge.get_capability_context(capability_id, max_apis=5, max_examples_per_api=1)
            api_candidates.extend(context.get("apis", [])[:5])
            examples.extend(context.get("examples", [])[:2])

        if not api_candidates:
            api_candidates.extend(knowledge.search_apis(query, top_k=5))
        if not examples:
            examples.extend(knowledge.search_examples(query, top_k=2))

        scene_contexts.append(
            {
                "scene_id": scene.get("id"),
                "query": query,
                "capabilities": _compact_records(capabilities, ["id", "name", "description", "apis", "examples"]),
                "api_candidates": _compact_records(api_candidates, ["id", "name", "kind", "signature", "description"]),
                "examples": _compact_records(examples, ["id", "title", "description", "code"]),
            }
        )

    return {"scenes": scene_contexts}


def _fallback_capability_plan(
    scenes: list[dict[str, Any]],
    candidate_context: dict[str, Any],
) -> dict[str, Any]:
    context_by_scene = {item.get("scene_id"): item for item in candidate_context.get("scenes", [])}
    planned_scenes = []

    for scene in scenes:
        context = context_by_scene.get(scene.get("id"), {})
        capabilities = [
            {
                "capability_id": capability.get("id"),
                "priority": "required",
                "reason": "Relevant to the scene requirement.",
                "targets": scene.get("visual_elements", []),
            }
            for capability in context.get("capabilities", [])[:3]
            if capability.get("id")
        ]
        api_candidates = [
            api.get("id")
            for api in context.get("api_candidates", [])
            if api.get("id")
        ][:8]
        examples = [
            example.get("id")
            for example in context.get("examples", [])
            if example.get("id")
        ][:4]
        planned_scenes.append(
            {
                "scene_id": scene.get("id"),
                "duration": scene.get("duration"),
                "capabilities": capabilities,
                "implementation_requirements": [
                    {
                        "target": ", ".join(map(str, scene.get("visual_elements", []))) or "main visual",
                        "requirement": "; ".join(map(str, scene.get("actions", []))) or scene.get("purpose", ""),
                    }
                ],
                "api_candidates": api_candidates,
                "examples": examples,
                "constraints": ["Use Manim 0.19.0 APIs verified by retrieval."],
            }
        )

    return {"scenes": planned_scenes}


def _coerce_capability_plan(
    capability_plan: dict[str, Any],
    scenes: list[dict[str, Any]],
    candidate_context: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(capability_plan.get("scenes"), list) or not capability_plan["scenes"]:
        return _fallback_capability_plan(scenes, candidate_context)

    for scene in capability_plan["scenes"]:
        if not isinstance(scene, dict):
            continue
        scene.setdefault("capabilities", [])
        scene.setdefault("implementation_requirements", [])
        scene.setdefault("api_candidates", [])
        scene.setdefault("examples", [])
        scene.setdefault("constraints", [])
    return capability_plan


def _scene_query(scene: dict[str, Any]) -> str:
    return " ".join(
        str(part)
        for part in [
            scene.get("purpose"),
            scene.get("visual_elements"),
            scene.get("actions"),
        ]
        if part
    )


def _compact_records(records: list[dict[str, Any]], keys: list[str]) -> list[dict[str, Any]]:
    compacted = []
    seen: set[str] = set()
    for record in records:
        record_id = record.get("id") or record.get("name")
        if record_id in seen:
            continue
        seen.add(record_id)
        compacted.append({key: _trim(record.get(key)) for key in keys if key in record})
    return compacted


def _trim(value: Any) -> Any:
    if isinstance(value, str) and len(value) > 1200:
        return value[:1200]
    if isinstance(value, list):
        return value[:12]
    return value


def _load_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    match = re.search(r"\{.*\}", text, re.S)
    return json.loads(match.group(0) if match else text)
