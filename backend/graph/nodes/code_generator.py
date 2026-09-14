from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from config import get_llm
from graph.state import AnimationState
from prompts import CODE_GENERATION_PROMPT


def generate_code(state: AnimationState) -> dict[str, Any]:
    """Generate executable Manim Python code."""
    scene_class = state.get("scene_class") or "Scene1"
    try:
        llm = get_llm(temperature=0.15)
        response = llm.invoke(
            [
                SystemMessage(content=CODE_GENERATION_PROMPT),
                HumanMessage(
                    content=json.dumps(
                        {
                            "scene_class": scene_class,
                            "normalized_request": state.get("normalized_request"),
                            "scene_plan": state.get("scene_plan"),
                            "capability_plan": state.get("capability_plan"),
                            "retrieved_knowledge": _compact_knowledge(state.get("retrieved_knowledge") or {}),
                            "project_context": state.get("project_context"),
                        },
                        ensure_ascii=False,
                    )
                ),
            ]
        )
        code = _strip_code_fence(str(response.content))
    except Exception as exc:
        code = _fallback_code(state)
        return {"generated_code": code, "scene_class": scene_class, "last_error": str(exc)}

    if "from manim import" not in code:
        code = "from manim import *\n\n" + code

    return {"generated_code": code, "scene_class": scene_class}


def _compact_knowledge(knowledge: dict[str, Any]) -> dict[str, Any]:
    return {
        "apis": [_select(api, ["id", "name", "kind", "signature", "description", "parameters", "methods"]) for api in knowledge.get("apis", [])[:25]],
        "examples": [_select(example, ["id", "title", "description", "code"]) for example in knowledge.get("examples", [])[:8]],
        "related_apis": knowledge.get("related_apis", [])[:20],
        "relationships": knowledge.get("relationships", [])[:20],
    }


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


def _fallback_code(state: AnimationState) -> str:
    request = (state.get("normalized_request") or {}).get("text") or state.get("request") or "Manim animation"
    safe_request = request.replace("\\", "\\\\").replace('"', '\\"')[:90]
    return f'''from manim import *


class Scene1(Scene):
    def construct(self):
        title = Text("{safe_request}", font_size=34)
        title.to_edge(UP)

        circle = Circle(radius=1.2, color=BLUE)
        dot = Dot(color=YELLOW).move_to(circle.point_at_angle(0))
        label = Text("Generated animation", font_size=28).next_to(circle, DOWN)

        self.play(Write(title))
        self.play(Create(circle), FadeIn(dot), Write(label))
        self.play(Rotate(dot, angle=TAU, about_point=circle.get_center()), run_time=3)
        self.wait(1)
'''


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:python)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    return text
