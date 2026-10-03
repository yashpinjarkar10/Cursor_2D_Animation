from __future__ import annotations

from functools import lru_cache
from typing import Any

from graph.state import AnimationState
from knowledge.repository.manim_knowledge import ManimKnowledge


@lru_cache(maxsize=1)
def get_knowledge() -> ManimKnowledge:
    """Return the shared Manim knowledge service."""
    return ManimKnowledge()


def retrieve_knowledge(state: AnimationState) -> dict[str, Any]:
    """Retrieve verified implementation context for every planned scene."""
    print("Running retrieval node")

    knowledge = _safe_knowledge()
    scenes = (state.get("scene_plan") or {}).get("scenes", [])
    if knowledge is None:
        raise RuntimeError("Knowledge service unavailable during implementation retrieval")

    capability_scenes = {
        scene.get("scene_id"): scene
        for scene in (state.get("capability_plan") or {}).get("scenes", [])
        if isinstance(scene, dict)
    }

    scene_contexts: list[dict[str, Any]] = []
    queries: list[str] = []
    capabilities_selected: list[str] = []
    apis_selected: list[str] = []
    related_apis: list[dict[str, Any]] = []
    examples: list[dict[str, Any]] = []
    implementation_candidates: list[dict[str, Any]] = []

    for scene in scenes:
        if not isinstance(scene, dict):
            continue
        scene_id = scene.get("id")
        planned_scene = capability_scenes.get(scene_id, {})
        query = _scene_query(scene, state, planned_scene)
        queries.append(query)
        context = _retrieve_scene_context(knowledge, query, planned_scene)
        scene_contexts.append({"scene_id": scene_id, **context})

        for capability in context.get("capabilities", []):
            capability_id = capability.get("id")
            if capability_id and capability_id not in capabilities_selected:
                capabilities_selected.append(capability_id)
        for api in context.get("implementation_candidates", []):
            api_id = api.get("id")
            if api_id and api_id not in apis_selected:
                apis_selected.append(api_id)
                implementation_candidates.append(api)
        related_apis.extend(context.get("related_apis", []))
        examples.extend(context.get("relationship_examples", []))

    retrieved = {
        "scenes": scene_contexts,
        "apis": _unique_records(implementation_candidates),
        "examples": _unique_records(examples),
        "related_apis": _unique_relationships(related_apis),
        "relationships": _unique_relationships(related_apis),
        "implementation_candidates": _unique_records(implementation_candidates),
    }
    return {
        "retrieved_knowledge": retrieved,
        "retrieval_trace": {
            "queries": queries,
            "capabilities_selected": capabilities_selected,
            "apis_selected": apis_selected,
            "related_apis": [
                item.get("target")
                for item in retrieved["related_apis"]
                if item.get("target")
            ],
            "examples_selected": [
                item.get("id") for item in retrieved["examples"] if item.get("id")
            ],
            "implementation_candidates": apis_selected,
            "rejected_candidates": [],
        },
    }


def _retrieve_scene_context(
    knowledge: ManimKnowledge,
    query: str,
    planned_scene: dict[str, Any],
) -> dict[str, Any]:
    """Expand selected capabilities, then add bounded semantic evidence."""
    capability_records: list[dict[str, Any]] = []
    implementation_candidates: list[dict[str, Any]] = []
    related_apis: list[dict[str, Any]] = []
    relationship_examples: list[dict[str, Any]] = []
    selected_ids: list[str] = []

    for selection in planned_scene.get("capabilities", []):
        if not isinstance(selection, dict):
            continue
        capability_id = selection.get("capability_id")
        if not isinstance(capability_id, str) or capability_id in selected_ids:
            continue
        capability = knowledge.get_capability(capability_id)
        if capability is None:
            raise ValueError(f"Selected capability was not found: {capability_id}")
        selected_ids.append(capability_id)
        capability_records.append({**capability, "priority": selection.get("priority", "required")})
        expanded = knowledge.get_capability_context(capability_id)
        if capability.get("apis") and not expanded.get("apis"):
            raise ValueError(
                f"Selected capability has no verified APIs: {capability_id}"
            )
        implementation_candidates.extend(expanded.get("apis", []))
        related_apis.extend(expanded.get("related_apis", []))
        relationship_examples.extend(expanded.get("examples", []))

    semantic_context = knowledge.search_implementation_context(query)
    implementation_candidates.extend(semantic_context.get("implementation_candidates", [])[:8])
    related_apis.extend(semantic_context.get("related_apis", [])[:12])
    relationship_examples.extend(semantic_context.get("relationship_examples", [])[:6])

    return {
        "query": query,
        "capabilities": capability_records,
        "semantic_apis": semantic_context.get("semantic_apis", []),
        "semantic_examples": semantic_context.get("semantic_examples", []),
        "implementation_candidates": _unique_records(implementation_candidates),
        "related_apis": _unique_relationships(related_apis),
        "relationship_examples": _unique_records(relationship_examples),
        "api_usage": semantic_context.get("api_usage", []),
    }


def _safe_knowledge() -> ManimKnowledge | None:
    try:
        return get_knowledge()
    except Exception:
        return None


def _scene_query(
    scene: dict[str, Any],
    state: AnimationState,
    planned_scene: dict[str, Any] | None = None,
) -> str:
    intent = (state.get("scene_plan") or {}).get("project_intent") or {}
    text = " ".join(
        str(part)
        for part in [
            state.get("request"),
            state.get("mode"),
            state.get("duration"),
            state.get("aspect_ratio"),
            intent.get("topic"),
            intent.get("objective"),
            scene.get("purpose"),
            scene.get("visual_elements"),
            scene.get("actions"),
            scene.get("dependencies"),
            scene.get("constraints"),
            [capability.get("capability_id") for capability in (planned_scene or {}).get("capabilities", [])],
        ]
        if part
    )
    if any(token in text.lower() for token in ("3d", "three-dimensional", "three dimensional")):
        text += " 3D ThreeDScene camera orientation parametric curve surface"
    return text


def _unique_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    seen: set[str] = set()
    for record in records:
        record_id = record.get("id") or record.get("qualified_name")
        if not record_id or record_id in seen:
            continue
        seen.add(record_id)
        unique.append(record)
    return unique


def _unique_relationships(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for record in records:
        key = (
            str(record.get("source")),
            str(record.get("target")),
            str(record.get("relation")),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(record)
    return unique
