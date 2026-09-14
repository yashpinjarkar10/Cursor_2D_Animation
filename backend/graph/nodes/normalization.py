from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from config import MANIM_TIMEOUT, get_llm
from graph.state import AnimationState
from prompts import NORMALIZATION_PROMPT


def normalize_request(state: AnimationState) -> dict[str, Any]:
    """Normalize the raw request into mode and render settings."""
    request = state.get("request", "")
    project_context = state.get("project_context")
    fallback = _fallback_normalization(request)

    try:
        llm = get_llm(fast=True, temperature=0.1)
        response = llm.invoke(
            [
                SystemMessage(content=NORMALIZATION_PROMPT),
                HumanMessage(
                    content=json.dumps(
                        {
                            "request": request,
                            "project_context": project_context,
                        },
                        ensure_ascii=False,
                    )
                ),
            ]
        )
        normalized = _load_json(str(response.content))
    except Exception as exc:
        normalized = {**fallback, "_warning": str(exc)}

    normalized = _coerce_normalization(normalized, fallback)
    render_config = {
        "quality": normalized["quality"],
        "aspect_ratio": normalized["aspect_ratio"],
        "duration": normalized["duration"],
        "timeout": MANIM_TIMEOUT,
    }

    return {
        "normalized_request": normalized,
        "request_type": normalized["mode"],
        "render_config": render_config,
        "voiceover_enabled": normalized["voiceover_enabled"],
    }


def _fallback_normalization(request: str) -> dict[str, Any]:
    duration_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:second|seconds|sec|s)\b", request, re.I)
    duration = float(duration_match.group(1)) if duration_match else None
    lowered = request.lower()
    mode = "create"
    if any(word in lowered for word in ("modify", "edit", "change", "replace", "fix")):
        mode = "modify"
    elif "extend" in lowered or "add to" in lowered:
        mode = "extend"
    elif "remove" in lowered or "delete" in lowered:
        mode = "remove"
    elif "restructure" in lowered or "reorganize" in lowered:
        mode = "restructure"

    quality = "low"
    if any(word in lowered for word in ("high quality", "1080", "hd", "high resolution")):
        quality = "high"
    elif "medium" in lowered or "720" in lowered:
        quality = "medium"

    return {
        "text": request.strip(),
        "mode": mode,
        "duration": duration,
        "aspect_ratio": "16:9",
        "quality": quality,
        "voiceover_enabled": any(word in lowered for word in ("voiceover", "voice over", "narration", "speech")),
    }


def _coerce_normalization(data: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    modes = {"create", "modify", "extend", "remove", "restructure"}
    qualities = {"low", "medium", "high"}

    duration = data.get("duration", fallback["duration"])
    try:
        duration = float(duration) if duration is not None else None
    except (TypeError, ValueError):
        duration = fallback["duration"]

    return {
        "text": str(data.get("text") or fallback["text"]).strip(),
        "mode": data.get("mode") if data.get("mode") in modes else fallback["mode"],
        "duration": duration,
        "aspect_ratio": str(data.get("aspect_ratio") or fallback["aspect_ratio"]),
        "quality": data.get("quality") if data.get("quality") in qualities else fallback["quality"],
        "voiceover_enabled": bool(data.get("voiceover_enabled", fallback["voiceover_enabled"])),
    }


def _load_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    match = re.search(r"\{.*\}", text, re.S)
    return json.loads(match.group(0) if match else text)
