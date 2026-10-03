from __future__ import annotations

import ast
import builtins
import importlib
import inspect
import json
from functools import lru_cache
from pathlib import Path
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

    print("Running validator Node")

    if state.get("failure_type") == "generation" and state.get("error"):
        errors.append(
            {
                "type": "generation",
                "message": str(state.get("error")),
                "line": None,
            }
        )
        return _result(errors, warnings)

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
        update["error"] = errors[0]["message"]
    else:
        update["last_error"] = None
        update["failure_type"] = None
        update["repair_target"] = None
        update["error"] = None
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
    scene_aliases = {
        "Scene",
        "ThreeDScene",
        "SpecialThreeDScene",
        "MovingCameraScene",
        "ZoomedScene",
        "LinearTransformationScene",
        "VectorScene",
    }
    if "*" in imported_names:
        scene_aliases.add("Scene")

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        for base in node.bases:
            if isinstance(base, ast.Name) and base.id in scene_aliases:
                return node
            if isinstance(base, ast.Attribute) and base.attr in scene_aliases:
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

    # When the model uses explicit imports, manim symbol validation still runs
    # via runtime inspection. Only skip the registry-based name lookup when
    # the import list doesn't include the wildcard.
    wildcard_import = "*" in imported_names

    registry = _load_registry()
    if not registry:
        errors.append({"type": "registry", "message": "Manim API registry is unavailable", "line": None})
        return

    known_names = {record.get("name") for record in registry.values() if record.get("name")}
    known_names.update(record.get("qualified_name", "").rsplit(".", 1)[-1] for record in registry.values())
    known_names.update(name for name in dir(manim) if not name.startswith("_"))
    defined_names = _defined_names(tree) | imported_names | set(dir(builtins))

    if wildcard_import:
        for node in ast.walk(tree):
            if not isinstance(node, ast.Name) or not isinstance(node.ctx, ast.Load):
                continue
            name = node.id
            if name in defined_names:
                continue
            if name[:1].isupper() or name.isupper() or isinstance(node, ast.Call):
                if name not in known_names:
                    errors.append({"type": "api", "message": f"Unknown Manim symbol: {name}", "line": node.lineno})

    _validate_method_calls(tree, registry, errors, imported_names)
    _validate_call_keywords(tree, registry, errors)


def _validate_call_keywords(
    tree: ast.AST,
    registry: dict[str, dict[str, Any]],
    errors: list[dict[str, Any]],
) -> None:
    """Reject keyword arguments absent from exact registry signatures."""
    by_short_name: dict[str, dict[str, Any]] = {}
    for record in registry.values():
        short_name = record.get("name") or record.get("qualified_name", "").rsplit(".", 1)[-1]
        if short_name and short_name not in by_short_name:
            by_short_name[short_name] = record

    method_records: dict[str, dict[str, Any]] = {}
    for record in registry.values():
        for method in record.get("methods") or []:
            if not isinstance(method, dict) or not method.get("name"):
                continue
            method_records.setdefault(method["name"], method)

    try:
        manim = importlib.import_module("manim")
    except Exception:
        manim = None

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        runtime_info = None
        if isinstance(node.func, ast.Name):
            record = by_short_name.get(node.func.id)
            target_name = node.func.id
            runtime_info = _runtime_constructor_keywords(manim, target_name)
        elif isinstance(node.func, ast.Attribute):
            record = method_records.get(node.func.attr)
            target_name = node.func.attr
        else:
            continue
        if not record and runtime_info is None:
            continue

        parameters = (record.get("parameters") if record else []) or []
        allowed = {
            parameter.get("name")
            for parameter in parameters
            if isinstance(parameter, dict)
            and parameter.get("name")
            and parameter.get("kind") != "VAR_KEYWORD"
        }
        accepts_kwargs = any(
            isinstance(parameter, dict) and parameter.get("kind") == "VAR_KEYWORD"
            for parameter in parameters
        )
        if runtime_info is not None:
            runtime_allowed, runtime_has_kwargs = runtime_info
            allowed.update(runtime_allowed)
            accepts_kwargs = accepts_kwargs or runtime_has_kwargs

        if accepts_kwargs:
            continue
        for keyword in node.keywords:
            if keyword.arg and keyword.arg not in allowed:
                errors.append(
                    {
                        "type": "api_argument",
                        "message": f"Unknown keyword argument {keyword.arg!r} for {target_name}",
                        "line": node.lineno,
                    }
                )


def _runtime_constructor_keywords(manim: Any, name: str) -> tuple[set[str], bool] | None:
    """Collect accepted constructor keywords through the installed class MRO."""
    if manim is None:
        return None
    target = getattr(manim, name, None)
    if not isinstance(target, type):
        return None

    allowed: set[str] = set()
    has_kwargs = False
    for cls in target.__mro__:
        try:
            signature = inspect.signature(cls.__init__)
        except (TypeError, ValueError):
            continue
        for parameter in signature.parameters.values():
            if parameter.name == "self":
                continue
            if parameter.kind in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY):
                allowed.add(parameter.name)
            elif parameter.kind == inspect.Parameter.VAR_KEYWORD:
                has_kwargs = True
    return allowed, has_kwargs


def _validate_method_calls(
    tree: ast.AST,
    registry: dict[str, dict[str, Any]],
    errors: list[dict[str, Any]],
    imported_names: set[str] | None = None,
) -> None:
    """Validate method calls on known Manim objects.

    Key invariants:
    - Calls on `self` are skipped: the concrete subclass (ThreeDScene,
      MovingCameraScene, etc.) and any user-defined helper methods are all
      valid on `self`; resolving them statically is unreliable.
    - User-defined names (functions, classes, variables) are excluded from
      the variable-type map so that calls like `self.make_node()` are never
      flagged.
    """
    variable_types: dict[str, str] = {}
    class_methods: dict[str, set[str]] = {}
    for record in registry.values():
        name = record.get("name") or record.get("qualified_name", "").rsplit(".", 1)[-1]
        if not name:
            continue
        methods = record.get("methods") or []
        class_methods[name] = {
            method.get("name") if isinstance(method, dict) else str(method).rsplit(".", 1)[-1]
            for method in methods
        }

    # Collect variable→type assignments only for identifiers that do NOT
    # shadow user-defined names (functions, classes).
    user_defined = _defined_names(tree) if imported_names is not None else set()

    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Call):
            continue
        if not isinstance(node.value.func, ast.Name):
            continue
        assigned_type = node.value.func.id
        if assigned_type in user_defined:
            continue
        if assigned_type == "always_redraw":
            assigned_type = _always_redraw_return_type(node.value) or assigned_type
        for target in node.targets:
            if isinstance(target, ast.Name):
                variable_types[target.id] = assigned_type

    try:
        import manim as _manim
    except Exception:
        _manim = None  # type: ignore[assignment]

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        receiver = node.func.value
        if not isinstance(receiver, ast.Name):
            continue
        # Always skip self — the actual subclass type is unknown statically
        # and user helper methods are always valid.
        if receiver.id == "self":
            continue
        receiver_type = variable_types.get(receiver.id)
        if not receiver_type or receiver_type not in class_methods:
            continue
        method_name = node.func.attr
        if method_name in class_methods[receiver_type]:
            continue
        # Runtime fallback: check via hasattr on the installed class MRO.
        if _manim is not None:
            runtime_type = getattr(_manim, receiver_type, None)
            if isinstance(runtime_type, type) and hasattr(runtime_type, method_name):
                continue
        errors.append(
            {
                "type": "api_method",
                "message": f"Unknown method {receiver_type}.{method_name}",
                "line": node.lineno,
            }
        )


def _always_redraw_return_type(call: ast.Call) -> str | None:
    """Infer the Manim mobject constructed by an always_redraw lambda."""
    if not call.args:
        return None
    callback = call.args[0]
    if not isinstance(callback, ast.Lambda) or not isinstance(callback.body, ast.Call):
        return None
    constructor = callback.body.func
    if isinstance(constructor, ast.Name):
        return constructor.id
    return None


@lru_cache(maxsize=1)
def _load_registry() -> dict[str, dict[str, Any]]:
    path = Path(__file__).resolve().parents[2] / "knowledge" / "static" / "api_registry.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    symbols = data.get("symbols", {})
    return symbols if isinstance(symbols, dict) else {}


def _defined_names(tree: ast.AST) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.arg):
            names.add(node.arg)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
    return names
