from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from config import get_llm
from graph.state import AnimationState
from prompts import SCENE_DIRECTOR_PROMPT


def direct_scene(state: AnimationState) -> dict[str, Any]:
    """Create the high-level animation storyboard."""
    normalized = state.get("normalized_request") or {}
    render_config = state.get("render_config") or {}

    try:
        llm = get_llm(temperature=0.2)
        response = llm.invoke(
            [
                SystemMessage(content=SCENE_DIRECTOR_PROMPT),
                HumanMessage(
                    content=json.dumps(
                        {
                            "normalized_request": normalized,
                            "request_type": state.get("request_type", "create"),
                            "project_context": state.get("project_context"),
                            "render_config": render_config,
                        },
                        ensure_ascii=False,
                    )
                ),
            ]
        )
        scene_plan = _load_json(str(response.content))
    except Exception as exc:
        scene_plan = _fallback_scene_plan(normalized, render_config)
        scene_plan["_warning"] = str(exc)

    return {"scene_plan": _coerce_scene_plan(scene_plan, normalized, render_config)}


def _fallback_scene_plan(normalized: dict[str, Any], render_config: dict[str, Any]) -> dict[str, Any]:
    text = normalized.get("text") or "Create a simple animation"
    duration = render_config.get("duration") or normalized.get("duration") or 8
    return {
        "request_type": normalized.get("mode", "create"),
        "project_intent": {
            "topic": text,
            "objective": f"Explain or visualize: {text}",
            "audience": "general learner",
            "difficulty": "beginner",
        },
        "duration": {"seconds": duration, "source": "user" if normalized.get("duration") else "default"},
        "global_visual_direction": {
            "style": "clean educational animation",
            "composition": "centered main visual with readable labels",
            "color_strategy": "limited high-contrast palette",
        },
        "scenes": [
            {
                "id": "main",
                "purpose": text,
                "duration": duration,
                "visual_elements": ["title", "main visual", "supporting label"],
                "actions": ["introduce the topic", "animate the main visual", "hold the final explanation"],
                "narration": None,
                "dependencies": [],
            }
        ],
        "global_timeline": {"estimated_duration": duration},
    }


def _coerce_scene_plan(
    scene_plan: dict[str, Any],
    normalized: dict[str, Any],
    render_config: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(scene_plan.get("scenes"), list) or not scene_plan["scenes"]:
        scene_plan = _fallback_scene_plan(normalized, render_config)

    for index, scene in enumerate(scene_plan["scenes"], 1):
        if not isinstance(scene, dict):
            scene = {}
            scene_plan["scenes"][index - 1] = scene
        scene.setdefault("id", f"scene_{index}")
        scene.setdefault("purpose", normalized.get("text", "Animate the request"))
        scene.setdefault("duration", 4)
        scene.setdefault("visual_elements", [])
        scene.setdefault("actions", [])
        scene.setdefault("narration", None)
        scene.setdefault("dependencies", [])

    scene_plan.setdefault("request_type", normalized.get("mode", "create"))
    scene_plan.setdefault("project_intent", {})
    scene_plan.setdefault("global_visual_direction", {})
    scene_plan.setdefault("duration", {"seconds": render_config.get("duration"), "source": "default"})
    scene_plan.setdefault("global_timeline", {"estimated_duration": render_config.get("duration")})
    return scene_plan


def _load_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    match = re.search(r"\{.*\}", text, re.S)
    return json.loads(match.group(0) if match else text)
