"""Shared utility functions for graph nodes."""
from __future__ import annotations

import json
import re
from typing import Any


def load_json(text: str) -> dict[str, Any]:
    """Parse JSON cleanly from LLM response, stripping markdown fences."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    match = re.search(r"\{.*\}", text, re.S)
    target = match.group(0) if match else text
    try:
        return json.loads(target)
    except Exception:
        try:
            import json_repair
            repaired = json_repair.loads(target)
            if isinstance(repaired, dict):
                return repaired
        except Exception:
            pass
        return json.loads(target)


def unique_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate records by id or qualified_name."""
    unique: list[dict[str, Any]] = []
    seen: set[str] = set()
    for record in records:
        record_id = record.get("id") or record.get("qualified_name")
        if not record_id or record_id in seen:
            continue
        seen.add(record_id)
        unique.append(record)
    return unique


def unique_relationships(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate relationship records by source, target, and relation."""
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


def build_scene_query(
    scene: dict[str, Any],
    state_request: str,
    state_mode: str | None = None,
    selected_capabilities: list[str] | None = None,
) -> str:
    """Build a retrieval query from scene and state context."""
    visual_elements = scene.get("visual_elements")
    vis_str = ", ".join(map(str, visual_elements)) if isinstance(visual_elements, list) else str(visual_elements or "")
    
    actions = scene.get("actions")
    act_str = ", ".join(map(str, actions)) if isinstance(actions, list) else str(actions or "")
    
    parts = [
        state_request,
        state_mode,
        scene.get("purpose", ""),
        vis_str,
        act_str,
        scene.get("constraints"),
    ]
    
    if selected_capabilities:
        parts.extend(selected_capabilities)
    
    text = " ".join(str(part) for part in parts if part).strip()
    
    # Add 3D context if detected
    if any(token in text.lower() for token in ("3d", "three-dimensional", "three dimensional")):
        text += " 3D ThreeDScene camera orientation parametric curve surface"
    
    return text
