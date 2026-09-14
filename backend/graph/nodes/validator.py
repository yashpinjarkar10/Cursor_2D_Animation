from __future__ import annotations

import ast
import builtins
import importlib
from typing import Any

from graph.state import AnimationState

DANGEROUS_CALLS = {"eval", "exec", "__import__"}
DANGEROUS_MODULES = {"subprocess"}
DANGEROUS_ATTRIBUTES = {("os", "system")}


def validate_code(state: AnimationState) -> dict[str, Any]:
    """Validate generated Python before rendering it."""
    code = state.get("generated_code") or ""
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []

    if not code.strip():
        errors.append({"type": "empty", "message": "No generated code found", "line": None})
        return _result(errors, warnings)

    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        errors.append({"type": "syntax", "message": exc.msg, "line": exc.lineno})
        return _result(errors, warnings)

    imported_names = _validate_imports(tree, errors)
    scene_class = _find_scene_class(tree, imported_names)
    if not scene_class:
        errors.append({"type": "scene", "message": "No class inheriting from Scene was found", "line": None})
    elif not _has_construct(scene_class):
        errors.append({"type": "scene", "message": f"{scene_class.name} is missing construct()", "line": scene_class.lineno})

    _validate_dangerous_constructs(tree, errors)
    _validate_manim_symbols(tree, imported_names, errors, warnings)

    updates = _result(errors, warnings)
    if scene_class:
        updates["scene_class"] = scene_class.name
    return updates


def _result(errors: list[dict[str, Any]], warnings: list[dict[str, Any]]) -> dict[str, Any]:
    status = "fail" if errors else "pass"
    validation_result = {"status": status, "errors": errors, "warnings": warnings}
    update: dict[str, Any] = {"validation_result": validation_result}
    if errors:
        update["last_error"] = errors[0]["message"]
        update["failure_type"] = errors[0]["type"]
        update["repair_target"] = "validator"
    else:
        update["last_error"] = None
        update["failure_type"] = None
        update["repair_target"] = None
    return update


def _validate_imports(tree: ast.AST, errors: list[dict[str, Any]]) -> set[str]:
    imported_names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imported_names.add(alias.asname or alias.name.split(".")[0])
                try:
                    importlib.import_module(alias.name)
                except Exception as exc:
                    errors.append({"type": "import", "message": f"Cannot import {alias.name}: {exc}", "line": node.lineno})
        elif isinstance(node, ast.ImportFrom):
            module_name = node.module or ""
            if node.level:
                continue
            try:
                module = importlib.import_module(module_name)
            except Exception as exc:
                errors.append({"type": "import", "message": f"Cannot import {module_name}: {exc}", "line": node.lineno})
                continue
            for alias in node.names:
                imported_names.add(alias.asname or alias.name)
                if alias.name != "*" and not hasattr(module, alias.name):
                    errors.append({"type": "import", "message": f"{alias.name} is not exported by {module_name}", "line": node.lineno})
                if alias.name == "*" and module_name == "manim":
                    imported_names.add("*")
    return imported_names


def _find_scene_class(tree: ast.AST, imported_names: set[str]) -> ast.ClassDef | None:
    scene_aliases = {"Scene", "ThreeDScene"}
    if "*" in imported_names:
        scene_aliases.add("Scene")

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        for base in node.bases:
            if isinstance(base, ast.Name) and base.id in scene_aliases:
                return node
            if isinstance(base, ast.Attribute) and base.attr == "Scene":
                return node
    return None


def _has_construct(scene_class: ast.ClassDef) -> bool:
    return any(isinstance(item, ast.FunctionDef) and item.name == "construct" for item in scene_class.body)


def _validate_dangerous_constructs(tree: ast.AST, errors: list[dict[str, Any]]) -> None:
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] in DANGEROUS_MODULES:
                    errors.append({"type": "dangerous", "message": f"Forbidden import: {alias.name}", "line": node.lineno})
        elif isinstance(node, ast.ImportFrom):
            if (node.module or "").split(".")[0] in DANGEROUS_MODULES:
                errors.append({"type": "dangerous", "message": f"Forbidden import: {node.module}", "line": node.lineno})
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in DANGEROUS_CALLS:
            errors.append({"type": "dangerous", "message": f"Forbidden call: {node.func.id}", "line": node.lineno})
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            value = node.func.value
            if isinstance(value, ast.Name) and (value.id, node.func.attr) in DANGEROUS_ATTRIBUTES:
                errors.append({"type": "dangerous", "message": f"Forbidden call: {value.id}.{node.func.attr}", "line": node.lineno})
        elif isinstance(node, ast.While) and isinstance(node.test, ast.Constant) and node.test.value is True:
            errors.append({"type": "dangerous", "message": "Forbidden loop: while True", "line": node.lineno})


def _validate_manim_symbols(
    tree: ast.AST,
    imported_names: set[str],
    errors: list[dict[str, Any]],
    warnings: list[dict[str, Any]],
) -> None:
    try:
        manim = importlib.import_module("manim")
    except Exception as exc:
        errors.append({"type": "import", "message": f"Cannot import manim: {exc}", "line": None})
        return

    if "*" not in imported_names:
        return

    defined_names = _defined_names(tree) | imported_names | set(dir(builtins))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Name) or not isinstance(node.ctx, ast.Load):
            continue
        name = node.id
        if name in defined_names:
            continue
        if name[:1].isupper() or name.isupper():
            if not hasattr(manim, name):
                warnings.append({"type": "api", "message": f"Manim symbol not found: {name}", "line": node.lineno})


def _defined_names(tree: ast.AST) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.arg):
            names.add(node.arg)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
        elif isinstance(node, ast.Attribute):
            names.add(node.attr)
    return names
