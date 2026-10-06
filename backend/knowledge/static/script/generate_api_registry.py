import json
import inspect
import importlib
from pathlib import Path
from typing import Any

import manim


# ============================================================
# CONFIG
# ============================================================

TAXONOMY_FILE = "taxonomy.json"
OUTPUT_FILE = "api_registry.json"


# ============================================================
# HELPERS
# ============================================================

def safe_getdoc(obj):
    """
    Safely retrieve documentation.
    """

    try:
        doc = inspect.getdoc(obj)

        if not doc:
            return None

        return doc.strip()

    except Exception:
        return None


def safe_signature(obj):
    """
    Safely retrieve Python signature.
    """

    try:
        return str(inspect.signature(obj))

    except Exception:
        return None


def safe_source_file(obj):
    """
    Find the Python source file where the object is defined.
    """

    try:
        return inspect.getsourcefile(obj)

    except Exception:
        return None


def safe_source_lines(obj):
    """
    Find source line number.
    """

    try:
        result = inspect.findsource(obj)

        if result is None:
            return None

        lines, line_number = result

        return line_number + 1

    except Exception:
        return None


def safe_module(obj):
    """
    Return module where object was defined.
    """

    try:
        module = inspect.getmodule(obj)

        if module:
            return module.__name__

    except Exception:
        pass

    return None


def is_public(name):
    """
    Ignore private Python names.
    """

    return not name.startswith("_")


# ============================================================
# TYPE INFORMATION
# ============================================================

def serialize_annotation(annotation):
    """
    Convert Python annotations into JSON-safe strings.
    """

    if annotation is inspect.Parameter.empty:
        return None

    try:
        return str(annotation)

    except Exception:
        return repr(annotation)


def serialize_default(default):
    """
    Convert default parameter values into JSON-safe values.
    """

    if default is inspect.Parameter.empty:
        return None

    # Basic JSON-safe values.
    if default is None:
        return None

    if isinstance(
        default,
        (str, int, float, bool, list, dict, tuple)
    ):
        try:
            json.dumps(default)

            if isinstance(default, tuple):
                return list(default)

            return default

        except Exception:
            pass

    # Objects such as enums/constants/classes.
    try:
        return repr(default)

    except Exception:
        return str(default)


# ============================================================
# PARAMETERS
# ============================================================

def extract_parameters(obj):
    """
    Extract detailed information about function/class parameters.
    """

    parameters = []

    try:
        signature = inspect.signature(obj)

    except Exception:
        return parameters

    for name, parameter in signature.parameters.items():

        parameter_data = {
            "name": name,

            "kind": str(parameter.kind),

            "default": serialize_default(
                parameter.default
            ),

            "annotation": serialize_annotation(
                parameter.annotation
            ),
        }

        parameters.append(parameter_data)

    return parameters


# ============================================================
# METHOD REGISTRY
# ============================================================

def extract_method(class_obj, method_name, method_obj):
    """
    Extract information about one class method.
    """

    method_data = {
        "name": method_name,

        "qualified_name": (
            f"{class_obj.__module__}."
            f"{class_obj.__name__}."
            f"{method_name}"
        ),

        "kind": "method",

        "signature": safe_signature(method_obj),

        "parameters": extract_parameters(method_obj),

        "return_annotation": None,

        "description": safe_getdoc(method_obj),

        "source_file": safe_source_file(method_obj),

        "source_line": safe_source_lines(method_obj),
    }

    # Return annotation.
    try:
        signature = inspect.signature(method_obj)

        method_data["return_annotation"] = (
            serialize_annotation(
                signature.return_annotation
            )
        )

    except Exception:
        pass

    return method_data


# ============================================================
# CLASS REGISTRY
# ============================================================

def extract_class(class_obj):
    """
    Extract complete information about a class.
    """

    class_name = class_obj.__name__
    module_name = class_obj.__module__

    qualified_name = (
        f"{module_name}.{class_name}"
    )

    # --------------------------------------------------------
    # Base classes
    # --------------------------------------------------------

    base_classes = []

    try:
        for base in class_obj.__bases__:

            base_classes.append(
                f"{base.__module__}.{base.__name__}"
            )

    except Exception:
        pass

    # --------------------------------------------------------
    # Methods
    # --------------------------------------------------------

    methods = []

    try:

        for method_name, method_obj in inspect.getmembers(
            class_obj
        ):

            if not is_public(method_name):
                continue

            if not (
                inspect.isfunction(method_obj)
                or inspect.ismethod(method_obj)
            ):
                continue

            # Only methods actually defined by this class.
            try:
                method_module = inspect.getmodule(
                    method_obj
                )

                if method_module is None:
                    continue

                # We don't want inherited methods here.
                if method_obj.__qualname__.split(".")[0] != class_name:
                    continue

            except Exception:
                continue

            methods.append(
                extract_method(
                    class_obj,
                    method_name,
                    method_obj
                )
            )

    except Exception:
        pass

    methods.sort(
        key=lambda x: x["name"]
    )

    # --------------------------------------------------------
    # Class registry
    # --------------------------------------------------------

    return {
        "name": class_name,

        "qualified_name": qualified_name,

        "kind": "class",

        "module": module_name,

        "signature": safe_signature(class_obj),

        "parameters": extract_parameters(class_obj),

        "description": safe_getdoc(class_obj),

        "base_classes": base_classes,

        "methods": methods,

        "source_file": safe_source_file(class_obj),

        "source_line": safe_source_lines(class_obj),

        "version": manim.__version__,
    }


# ============================================================
# FUNCTION REGISTRY
# ============================================================

def extract_function(function_obj):

    qualified_name = (
        f"{function_obj.__module__}."
        f"{function_obj.__name__}"
    )

    return {
        "name": function_obj.__name__,

        "qualified_name": qualified_name,

        "kind": "function",

        "module": function_obj.__module__,

        "signature": safe_signature(function_obj),

        "parameters": extract_parameters(function_obj),

        "return_annotation": (
            safe_return_annotation(function_obj)
        ),

        "description": safe_getdoc(function_obj),

        "source_file": safe_source_file(function_obj),

        "source_line": safe_source_lines(function_obj),

        "version": manim.__version__,
    }


def safe_return_annotation(obj):

    try:
        signature = inspect.signature(obj)

        return serialize_annotation(
            signature.return_annotation
        )

    except Exception:
        return None


# ============================================================
# MODULE INSPECTION
# ============================================================

def inspect_module(module_name):
    """
    Inspect one module and extract public classes/functions
    defined inside that module.
    """

    try:
        module = importlib.import_module(
            module_name
        )

    except Exception as e:

        print(
            f"[WARNING] Could not import "
            f"{module_name}: {e}"
        )

        return []

    symbols = []

    try:
        members = inspect.getmembers(module)

    except Exception:
        return symbols

    for name, obj in members:

        if not is_public(name):
            continue

        # ----------------------------------------------------
        # Important:
        #
        # Only include symbols DEFINED in this module.
        #
        # Otherwise:
        #
        # manim.mobject.geometry
        #
        # could contain imported symbols from 20 other files.
        # ----------------------------------------------------

        try:

            obj_module = inspect.getmodule(obj)

            if obj_module is None:
                continue

            if obj_module.__name__ != module_name:
                continue

        except Exception:
            continue

        # ----------------------------------------------------
        # Classes
        # ----------------------------------------------------

        if inspect.isclass(obj):

            try:

                symbols.append(
                    extract_class(obj)
                )

            except Exception as e:

                print(
                    f"[WARNING] Failed class "
                    f"{module_name}.{name}: {e}"
                )

        # ----------------------------------------------------
        # Functions
        # ----------------------------------------------------

        elif inspect.isfunction(obj):

            try:

                symbols.append(
                    extract_function(obj)
                )

            except Exception as e:

                print(
                    f"[WARNING] Failed function "
                    f"{module_name}.{name}: {e}"
                )

    symbols.sort(
        key=lambda x: (
            x["kind"],
            x["name"]
        )
    )

    return symbols


# ============================================================
# LOAD TAXONOMY
# ============================================================

def load_taxonomy():

    path = Path(TAXONOMY_FILE)

    if not path.exists():

        raise FileNotFoundError(
            f"{TAXONOMY_FILE} not found. "
            f"Run generate_taxonomy.py first."
        )

    with path.open(
        "r",
        encoding="utf-8"
    ) as f:

        return json.load(f)


# ============================================================
# BUILD API REGISTRY
# ============================================================

def build_registry(taxonomy):

    nodes = taxonomy["nodes"]

    registry = {
        "library": {
            "name": "Manim",
            "package": "manim",
            "version": manim.__version__,
        },

        "symbols": {},

        "statistics": {
            "modules": 0,
            "classes": 0,
            "functions": 0,
            "methods": 0,
        }
    }

    # --------------------------------------------------------
    # Iterate through taxonomy modules
    # --------------------------------------------------------

    for node_id, node in nodes.items():

        module_name = node.get("module")

        if not module_name:
            continue

        if node["type"] not in {
            "domain",
            "module"
        }:
            continue

        print(
            f"Inspecting: {module_name}"
        )

        registry["statistics"]["modules"] += 1

        symbols = inspect_module(
            module_name
        )

        # ----------------------------------------------------
        # Store every symbol
        # ----------------------------------------------------

        for symbol in symbols:

            qualified_name = symbol[
                "qualified_name"
            ]

            # Add taxonomy information.
            symbol["taxonomy_id"] = node_id

            # Store by qualified name.
            registry["symbols"][
                qualified_name
            ] = symbol

            # Statistics.
            if symbol["kind"] == "class":

                registry["statistics"][
                    "classes"
                ] += 1

                registry["statistics"][
                    "methods"
                ] += len(
                    symbol.get("methods", [])
                )

            elif symbol["kind"] == "function":

                registry["statistics"][
                    "functions"
                ] += 1

    return registry


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 70)
    print("MANIM API REGISTRY GENERATOR")
    print("=" * 70)

    print(
        f"\nManim version: {manim.__version__}"
    )

    # --------------------------------------------------------
    # Load taxonomy
    # --------------------------------------------------------

    print(
        "\n[1/3] Loading taxonomy..."
    )

    taxonomy = load_taxonomy()

    print(
        f"Loaded {len(taxonomy['nodes'])} taxonomy nodes."
    )

    # --------------------------------------------------------
    # Build registry
    # --------------------------------------------------------

    print(
        "\n[2/3] Inspecting Manim API..."
    )

    registry = build_registry(
        taxonomy
    )

    # --------------------------------------------------------
    # Save
    # --------------------------------------------------------

    print(
        "\n[3/3] Saving registry..."
    )

    output_path = Path(
        OUTPUT_FILE
    )

    with output_path.open(
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            registry,
            f,
            indent=2,
            ensure_ascii=False
        )

    print(
        f"\nSaved to: "
        f"{output_path.resolve()}"
    )

    # --------------------------------------------------------
    # Statistics
    # --------------------------------------------------------

    stats = registry[
        "statistics"
    ]

    print("\n" + "=" * 70)
    print("REGISTRY STATISTICS")
    print("=" * 70)

    print(
        f"Modules   : {stats['modules']}"
    )

    print(
        f"Classes   : {stats['classes']}"
    )

    print(
        f"Functions : {stats['functions']}"
    )

    print(
        f"Methods   : {stats['methods']}"
    )

    print("=" * 70)


if __name__ == "__main__":
    main()