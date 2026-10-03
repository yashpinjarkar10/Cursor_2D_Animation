from __future__ import annotations

import json
import re
from typing import Any
import logging

from langchain_core.messages import HumanMessage, SystemMessage

from config import get_llm
from graph.state import AnimationState
from prompts import SCENE_DIRECTOR_PROMPT


def direct_scene(state: AnimationState) -> dict[str, Any]:
    """Create the high-level animation storyboard."""
    logging.info("Directing scene plan...")
    request = state.get("request", "")
    mode = state.get("mode", "create")
    duration = state.get("duration")
    render_config = state.get("render_config") or {}


    try:
        llm = get_llm(temperature=0.2)
        response = llm.invoke(
            [
                SystemMessage(content=SCENE_DIRECTOR_PROMPT),
                HumanMessage(
                    content=json.dumps(
                        {
                            "request": request,
                            "mode": mode,
                            "duration": duration,
                            "aspect_ratio": state.get("aspect_ratio", "16:9"),
                            "voiceover_enabled": state.get("voiceover_enabled", False),
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
        logging.warning(f"Scene direction failed: {exc}")
        scene_plan = _fallback_scene_plan(request, mode, duration, render_config)
        scene_plan["_warning"] = str(exc)

    return {"scene_plan": _coerce_scene_plan(scene_plan, request, mode, duration, render_config)}


def _fallback_scene_plan(
    request: str,
    mode: str,
    duration: float | None,
    render_config: dict[str, Any],
) -> dict[str, Any]:
    text = request or "Create a simple animation"
    scene_duration = render_config.get("duration") or duration or 8
    return {
        "request_type": mode,
        "project_intent": {
            "topic": text,
            "objective": f"Explain or visualize: {text}",
            "audience": "general learner",
            "difficulty": "beginner",
        },
        "duration": {"seconds": scene_duration, "source": "user" if duration else "default"},
        "global_visual_direction": {
            "style": "clean educational animation",
            "composition": "centered main visual with readable labels",
            "color_strategy": "limited high-contrast palette",
        },
        "scenes": [
            {
                "id": "main",
                "purpose": text,
                "duration": scene_duration,
                "visual_elements": ["title", "main visual", "supporting label"],
                "actions": ["introduce the topic", "animate the main visual", "hold the final explanation"],
                "narration": None,
                "dependencies": [],
            }
        ],
        "global_timeline": {"estimated_duration": scene_duration},
    }


def _coerce_scene_plan(
    scene_plan: dict[str, Any],
    request: str,
    mode: str,
    duration: float | None,
    render_config: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(scene_plan.get("scenes"), list) or not scene_plan["scenes"]:
        scene_plan = _fallback_scene_plan(request, mode, duration, render_config)

    for index, scene in enumerate(scene_plan["scenes"], 1):
        if not isinstance(scene, dict):
            scene = {}
            scene_plan["scenes"][index - 1] = scene
        scene.setdefault("id", f"scene_{index}")
        scene.setdefault("purpose", request or "Animate the request")
        scene.setdefault("duration", 4)
        scene.setdefault("visual_elements", [])
        scene.setdefault("actions", [])
        scene.setdefault("narration", None)
        scene.setdefault("dependencies", [])

        staging = scene.get("staging_transition")
        if not isinstance(staging, dict):
            staging = {
                "clear_mode": "fade_out_all",
                "persistent_elements": [],
                "transition_note": "Clear temporary objects between acts",
            }
        else:
            if staging.get("clear_mode") not in {"fade_out_all", "keep_persistent", "transform_to_next"}:
                staging["clear_mode"] = "fade_out_all"
            staging.setdefault("persistent_elements", [])
            staging.setdefault("transition_note", "Transition to next act")
        scene["staging_transition"] = staging

    scene_plan.setdefault("request_type", mode)
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
