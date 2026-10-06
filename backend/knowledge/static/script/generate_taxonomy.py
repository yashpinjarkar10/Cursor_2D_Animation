import json
import pkgutil
import importlib
import inspect
from pathlib import Path

import manim


# ============================================================
# CONFIG
# ============================================================

OUTPUT_FILE = "taxonomy.json"

ROOT_ID = "manim"

# Top-level conceptual categories.
# These are our semantic organization of Manim's package structure.
DOMAIN_MAP = {
    "animation": "animation",
    "camera": "camera",
    "mobject": "mobject",
    "scene": "scene",
    "renderer": "renderer",
    "utils": "utils",
    "plugins": "plugins",
    "gui": "gui",
    "cli": "cli",
    "opengl": "opengl",
    "constants": "constants",
    "typing": "typing",
    "_config": "configuration",
}


# Modules that are implementation details rather than useful
# capabilities for an LLM generating Manim code.
EXCLUDED_MODULE_PARTS = {
    "testing",
    "tests",
    "docbuild",
    "_frames_testers",
    "_show_diff",
    "_test_class_makers",
}


# Modules we generally do not want to expose as useful
# code-generation capabilities.
EXCLUDED_TOP_LEVEL = {
    "cli",
    "gui",
    "plugins",
    "renderer",
    "opengl",
    "_config",
}


# ============================================================
# HELPERS
# ============================================================

def is_private_name(name: str) -> bool:
    """
    True if a Python name is private/internal.
    """
    return name.startswith("_")


def should_include_module(module_name: str) -> bool:
    """
    Decide whether a module should appear in the taxonomy.
    """

    parts = module_name.split(".")

    # Must belong to Manim.
    if not module_name.startswith("manim"):
        return False

    # Remove root 'manim'
    parts_without_root = parts[1:]

    if not parts_without_root:
        return True

    # Exclude private modules.
    if any(part.startswith("_") for part in parts_without_root):
        return False

    # Exclude testing/docbuild/etc.
    if any(part in EXCLUDED_MODULE_PARTS for part in parts_without_root):
        return False

    return True


def get_domain(module_name: str) -> str:
    """
    Convert:

        manim.mobject.graphing.coordinate_systems

    into:

        mobject
    """

    parts = module_name.split(".")

    if len(parts) < 2:
        return "core"

    top_level = parts[1]

    return DOMAIN_MAP.get(top_level, top_level)


def make_id(module_name: str) -> str:
    """
    Convert Python module path into taxonomy ID.

    manim.mobject.graphing
    ->
    mobject.graphing
    """

    if module_name == "manim":
        return ROOT_ID

    return module_name.replace("manim.", "", 1)


def humanize_name(name: str) -> str:
    """
    Convert:

        coordinate_systems

    into:

        Coordinate Systems
    """

    return " ".join(
        word.capitalize()
        for word in name.replace("-", "_").split("_")
    )


def module_description(module):
    """
    Get module docstring if available.
    """

    try:
        doc = inspect.getdoc(module)

        if not doc:
            return None

        # Keep taxonomy descriptions short.
        first_paragraph = doc.split("\n\n")[0].strip()

        if len(first_paragraph) > 500:
            first_paragraph = first_paragraph[:500] + "..."

        return first_paragraph

    except Exception:
        return None


# ============================================================
# DISCOVER MODULES
# ============================================================

def discover_modules():
    """
    Walk the installed Manim package and return all useful modules.
    """

    modules = set()

    # Root module.
    modules.add("manim")

    for module_info in pkgutil.walk_packages(
        manim.__path__,
        prefix="manim."
    ):
        module_name = module_info.name

        if should_include_module(module_name):
            modules.add(module_name)

    return sorted(modules)


# ============================================================
# BUILD TREE
# ============================================================

def create_node(
    node_id,
    name,
    node_type,
    parent_id=None,
    description=None,
    module=None,
):
    return {
        "id": node_id,
        "name": name,
        "type": node_type,
        "parent": parent_id,
        "description": description,
        "module": module,
        "children": [],
        "symbols": [],
    }


def build_taxonomy(modules):
    """
    Build hierarchical taxonomy from module paths.
    """

    nodes = {}

    # --------------------------------------------------------
    # ROOT
    # --------------------------------------------------------

    nodes[ROOT_ID] = create_node(
        node_id=ROOT_ID,
        name="Manim",
        node_type="root",
        parent_id=None,
        description="Manim Community animation engine.",
        module="manim",
    )

    # --------------------------------------------------------
    # CREATE MODULE NODES
    # --------------------------------------------------------

    for module_name in modules:

        if module_name == "manim":
            continue

        taxonomy_id = make_id(module_name)

        parts = taxonomy_id.split(".")

        # Example:
        #
        # mobject
        # mobject.graphing
        # mobject.graphing.coordinate_systems

        current_parent = ROOT_ID

        for i in range(len(parts)):

            current_id = ".".join(parts[: i + 1])

            # Already created.
            if current_id in nodes:
                current_parent = current_id
                continue

            part_name = parts[i]

            # Determine whether this is a major domain.
            if i == 0:
                node_type = "domain"
            else:
                node_type = "module"

            full_module = "manim." + current_id

            description = None

            # Try importing the actual module.
            try:
                module = importlib.import_module(full_module)
                description = module_description(module)
            except Exception:
                module = None

            node = create_node(
                node_id=current_id,
                name=humanize_name(part_name),
                node_type=node_type,
                parent_id=current_parent,
                description=description,
                module=full_module,
            )

            nodes[current_id] = node

            # Connect parent -> child.
            nodes[current_parent]["children"].append(current_id)

            current_parent = current_id

    return nodes


# ============================================================
# DISCOVER SYMBOLS
# ============================================================

def discover_public_symbols(module_name):
    """
    Inspect a module and find public classes/functions/constants.

    This is NOT the full API registry yet.
    We only attach symbol names to taxonomy nodes.
    """

    symbols = []

    try:
        module = importlib.import_module(module_name)
    except Exception as e:
        return symbols

    try:
        members = inspect.getmembers(module)
    except Exception:
        return symbols

    for name, obj in members:

        # Ignore private names.
        if is_private_name(name):
            continue

        # We only want symbols actually defined in this module.
        # Otherwise imports like Circle inside another module would
        # be duplicated everywhere.
        try:
            obj_module = inspect.getmodule(obj)

            if obj_module is None:
                continue

            if obj_module.__name__ != module_name:
                continue

        except Exception:
            continue

        # Classes
        if inspect.isclass(obj):

            symbols.append({
                "name": name,
                "kind": "class",
                "qualified_name": f"{module_name}.{name}",
            })

        # Functions
        elif inspect.isfunction(obj):

            symbols.append({
                "name": name,
                "kind": "function",
                "qualified_name": f"{module_name}.{name}",
            })

        # Builtin functions
        elif inspect.isbuiltin(obj):

            symbols.append({
                "name": name,
                "kind": "builtin",
                "qualified_name": f"{module_name}.{name}",
            })

    return sorted(
        symbols,
        key=lambda x: (x["kind"], x["name"])
    )


# ============================================================
# ATTACH SYMBOLS
# ============================================================

def attach_symbols(nodes):
    """
    Add public symbols to their corresponding taxonomy module.
    """

    for node_id, node in nodes.items():

        module_name = node.get("module")

        if not module_name:
            continue

        if node["type"] not in {"module", "domain"}:
            continue

        symbols = discover_public_symbols(module_name)

        node["symbols"] = symbols


# ============================================================
# CLEAN JSON
# ============================================================

def clean_node(node):
    """
    Remove fields that are unnecessary / empty.
    """

    cleaned = {
        "id": node["id"],
        "name": node["name"],
        "type": node["type"],
        "parent": node["parent"],
    }

    if node.get("module"):
        cleaned["module"] = node["module"]

    if node.get("description"):
        cleaned["description"] = node["description"]

    if node.get("children"):
        cleaned["children"] = sorted(node["children"])

    if node.get("symbols"):
        cleaned["symbols"] = node["symbols"]

    return cleaned


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 60)
    print("MANIM TAXONOMY GENERATOR")
    print("=" * 60)

    print("\nManim version:")
    print(manim.__version__)

    # --------------------------------------------------------
    # 1. Discover modules
    # --------------------------------------------------------

    print("\n[1/4] Discovering modules...")

    modules = discover_modules()

    print(f"Found {len(modules)} modules.")

    # --------------------------------------------------------
    # 2. Build taxonomy
    # --------------------------------------------------------

    print("\n[2/4] Building taxonomy...")

    nodes = build_taxonomy(modules)

    print(f"Created {len(nodes)} taxonomy nodes.")

    # --------------------------------------------------------
    # 3. Discover symbols
    # --------------------------------------------------------

    print("\n[3/4] Discovering public symbols...")

    attach_symbols(nodes)

    total_symbols = 0

    for node in nodes.values():
        total_symbols += len(node.get("symbols", []))

    print(f"Found {total_symbols} public symbols.")

    # --------------------------------------------------------
    # 4. Save
    # --------------------------------------------------------

    print("\n[4/4] Saving taxonomy...")

    taxonomy = {
        "library": {
            "name": "Manim",
            "package": "manim",
            "version": manim.__version__,
        },

        "root": ROOT_ID,

        "nodes": {
            node_id: clean_node(node)
            for node_id, node in sorted(nodes.items())
        }
    }

    output_path = Path(OUTPUT_FILE)

    with output_path.open(
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            taxonomy,
            f,
            indent=2,
            ensure_ascii=False,
        )

    print(f"\nSaved to: {output_path.resolve()}")

    print("\nDone.")


if __name__ == "__main__":
    main()