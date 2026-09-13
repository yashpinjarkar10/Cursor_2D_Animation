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
    """Resolve planned capabilities into exact APIs and examples."""
    capability_plan = state.get("capability_plan") or {}
    knowledge = _safe_knowledge()

    if knowledge is None:
        return {
            "retrieved_knowledge": {
                "apis": [],
                "examples": [],
                "related_apis": [],
                "relationships": [],
                "warning": "Knowledge service unavailable",
            }
        }

    apis: list[dict[str, Any]] = []
    examples: list[dict[str, Any]] = []
    related_apis: list[dict[str, Any]] = []
    relationships: list[dict[str, Any]] = []
    seen_apis: set[str] = set()
    seen_examples: set[str] = set()
    seen_capabilities: set[str] = set()

    for scene in capability_plan.get("scenes", []):
        if not isinstance(scene, dict):
            continue

        for capability in scene.get("capabilities", []):
            capability_id = capability.get("capability_id") if isinstance(capability, dict) else None
            if not capability_id or capability_id in seen_capabilities:
                continue
            seen_capabilities.add(capability_id)
            context = knowledge.get_capability_context(capability_id, max_apis=8, max_examples_per_api=2)
            _extend_unique_apis(apis, context.get("apis", []), seen_apis)
            _extend_unique_examples(examples, context.get("examples", []), seen_examples)
            related_apis.extend(context.get("related_apis", []))

        for api_id in scene.get("api_candidates", []):
            if not isinstance(api_id, str) or api_id in seen_apis:
                continue
            api = knowledge.get_api(api_id)
            if api:
                seen_apis.add(api_id)
                apis.append(api)
            for relationship in knowledge.get_related_apis(api_id)[:5]:
                related_apis.append(relationship)
                target = relationship.get("target")
                if target and target not in seen_apis:
                    related_api = knowledge.get_api(target)
                    if related_api:
                        seen_apis.add(target)
                        apis.append(related_api)
            for example_id in knowledge.get_api_examples(api_id)[:2]:
                example = knowledge.get_example(example_id)
                if example and example_id not in seen_examples:
                    seen_examples.add(example_id)
                    examples.append(example)
                usage = knowledge.get_api_usage_in_example(api_id, example_id)
                relationships.extend(usage)

        if not scene.get("api_candidates"):
            query = " ".join(
                str(part)
                for part in [
                    scene.get("scene_id"),
                    scene.get("constraints"),
                    scene.get("implementation_requirements"),
                ]
                if part
            )
            for api in knowledge.search_apis(query, top_k=5):
                api_id = api.get("id")
                if api_id and api_id not in seen_apis:
                    seen_apis.add(api_id)
                    apis.append(api)

    return {
        "retrieved_knowledge": {
            "apis": apis[:40],
            "examples": examples[:15],
            "related_apis": related_apis[:40],
            "relationships": relationships[:40],
        }
    }


def _safe_knowledge() -> ManimKnowledge | None:
    try:
        return get_knowledge()
    except Exception:
        return None


def _extend_unique_apis(target: list[dict[str, Any]], records: list[dict[str, Any]], seen: set[str]) -> None:
    for record in records:
        api_id = record.get("id")
        if api_id and api_id not in seen:
            seen.add(api_id)
            target.append(record)


def _extend_unique_examples(target: list[dict[str, Any]], records: list[dict[str, Any]], seen: set[str]) -> None:
    for record in records:
        example_id = record.get("id")
        if example_id and example_id not in seen:
            seen.add(example_id)
            target.append(record)
