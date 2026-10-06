from __future__ import annotations

import ast
import json
from typing import Any


def stringify(value: Any) -> str:
    """
    Convert structured values into deterministic JSON strings.
    Used for Chroma metadata values to ensure primitive string storage.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
    )


def safe_json_dumps(value: Any, default: str = "") -> str:
    """Serialize any object to a JSON string safely."""
    if value is None:
        return default
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    except (TypeError, ValueError):
        return str(value)


def extract_code_names(code: str) -> list[str]:
    """
    Extract Python names and attribute names from example code.
    Used to enhance search document tokens.
    """
    if not code:
        return []

    try:
        tree = ast.parse(code)
    except SyntaxError:
        return []

    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            names.add(node.id)
        elif isinstance(node, ast.Attribute):
            names.add(node.attr)

    return sorted(names)


# ======================================================================
# CAPABILITIES
# ======================================================================

def capability_document(capability: dict[str, Any]) -> str:
    """
    Build semantic search document for a capability.
    Combines name, description, intent patterns, constraints, and APIs.
    """
    parts = [
        f"Capability: {capability.get('name', '')}",
        f"Description: {capability.get('description', '')}",
    ]

    intent_patterns = capability.get("intent_patterns", [])
    if intent_patterns:
        if isinstance(intent_patterns, list):
            parts.append("Intent patterns: " + ", ".join(str(p) for p in intent_patterns))
        else:
            parts.append(f"Intent patterns: {intent_patterns}")

    constraints = capability.get("constraints", [])
    if constraints:
        if isinstance(constraints, list):
            parts.append("Constraints: " + ", ".join(str(c) for c in constraints))
        else:
            parts.append(f"Constraints: {constraints}")

    apis = capability.get("apis", [])
    if apis:
        if isinstance(apis, list):
            parts.append("APIs: " + ", ".join(str(a) for a in apis))
        else:
            parts.append(f"APIs: {apis}")

    examples = capability.get("examples", [])
    if examples:
        if isinstance(examples, list):
            parts.append("Examples: " + ", ".join(str(e) for e in examples))
        else:
            parts.append(f"Examples: {examples}")

    return "\n\n".join(parts)


def capability_metadata(
    capability: dict[str, Any],
    manim_version: str = "0.19.0",
) -> dict[str, Any]:
    """
    Structured metadata stored in Chroma for a capability.
    Only primitive scalar values (str, int, float, bool) are stored.
    Complex collections are serialized with safe_json_dumps.
    """
    cap_id = str(capability.get("id") or "")
    if not cap_id:
        raise ValueError("Capability record missing required 'id'")

    return {
        "id": cap_id,
        "name": str(capability.get("name") or ""),
        "description": str(capability.get("description") or ""),
        "version": str(capability.get("version") or manim_version),
        "apis": safe_json_dumps(capability.get("apis") or []),
        "examples": safe_json_dumps(capability.get("examples") or []),
        "intent_patterns": safe_json_dumps(capability.get("intent_patterns") or []),
        "constraints": safe_json_dumps(capability.get("constraints") or []),
        "merged_from": safe_json_dumps(capability.get("merged_from") or []),
    }


# ======================================================================
# APIs
# ======================================================================

def api_document(api: dict[str, Any]) -> str:
    """
    Build semantic search document for an API symbol.
    """
    parts = [
        f"API: {api.get('qualified_name') or api.get('name') or ''}",
        f"Name: {api.get('name', '')}",
        f"Kind: {api.get('kind', '')}",
        f"Module: {api.get('module', '')}",
        f"Description: {api.get('description', '')}",
        f"Signature: {api.get('signature', '')}",
    ]

    base_classes = api.get("base_classes", [])
    if base_classes:
        parts.append("Base classes: " + ", ".join(str(b) for b in base_classes))

    methods = api.get("methods", [])
    if methods:
        method_names = [m.get("name", "") for m in methods if isinstance(m, dict)]
        if method_names:
            parts.append("Methods: " + ", ".join(method_names))

    return "\n".join(parts)


def api_metadata(
    api: dict[str, Any],
    api_id: str | None = None,
    manim_version: str = "0.19.0",
) -> dict[str, Any]:
    """
    Structured metadata stored in Chroma for an API symbol.
    Preserves all fields needed for detailed API inspection:
    signature, parameters, methods, base_classes, return_annotation, etc.
    """
    qualified_name = str(api_id or api.get("qualified_name") or api.get("id") or "")
    if not qualified_name:
        raise ValueError(f"API record missing qualified name or ID: {api.get('name')}")

    return {
        "id": qualified_name,
        "qualified_name": qualified_name,
        "name": str(api.get("name") or ""),
        "kind": str(api.get("kind") or ""),
        "module": str(api.get("module") or ""),
        "signature": str(api.get("signature") or ""),
        "return_annotation": str(api.get("return_annotation") or ""),
        "description": str(api.get("description") or ""),
        "source_file": str(api.get("source_file") or ""),
        "source_line": int(api.get("source_line") or 0),
        "version": str(api.get("version") or manim_version),
        "taxonomy_id": str(api.get("taxonomy_id") or ""),
        # Structured fields preserved as JSON strings
        "parameters": safe_json_dumps(api.get("parameters") or []),
        "base_classes": safe_json_dumps(api.get("base_classes") or []),
        "methods": safe_json_dumps(api.get("methods") or []),
    }


# ======================================================================
# EXAMPLES
# ======================================================================

def example_document(example: dict[str, Any]) -> str:
    """
    Build semantic search document for an official Manim example.
    """
    title = str(example.get("title") or example.get("name") or "")
    ref_classes = example.get("ref_classes", [])
    apis = example.get("apis", [])
    code = example.get("code", "")
    code_names = extract_code_names(code)

    parts = [f"Manim Example: {title}"]

    if ref_classes:
        parts.append("Referenced classes: " + ", ".join(str(c) for c in ref_classes))

    if apis:
        parts.append("Manim APIs used: " + ", ".join(str(a) for a in apis))

    if code_names:
        parts.append("Symbols used: " + ", ".join(code_names))

    if code:
        parts.append("Code:\n" + code)

    return "\n\n".join(parts)


def example_metadata(
    example: dict[str, Any],
    manim_version: str = "0.19.0",
) -> dict[str, Any]:
    """
    Structured metadata stored in Chroma for an official Manim example.
    Preserves: id, title, source_file, code, ref_classes, apis, api_usage, variable_types.
    """
    ex_id = str(example.get("id") or "")
    if not ex_id:
        raise ValueError("Example record missing required 'id'")

    title = str(example.get("title") or example.get("name") or "")

    return {
        "id": ex_id,
        "title": title,
        "name": title,
        "source_file": str(example.get("source_file") or example.get("source") or ""),
        "version": str(example.get("version") or manim_version),
        "api_count": int(example.get("api_count") or len(example.get("apis") or [])),
        # Code is stored in metadata so get_example can return complete record without parsing document
        "code": str(example.get("code") or ""),
        # Complex structures preserved as JSON strings
        "ref_classes": safe_json_dumps(example.get("ref_classes") or []),
        "apis": safe_json_dumps(example.get("apis") or []),
        "api_usage": safe_json_dumps(example.get("api_usage") or []),
        "variable_types": safe_json_dumps(example.get("variable_types") or {}),
        "api_references": safe_json_dumps(example.get("api_references") or []),
    }