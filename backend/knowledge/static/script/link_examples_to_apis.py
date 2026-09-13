import ast
import json
from pathlib import Path


# ============================================================
# CONFIG
# ============================================================

EXAMPLES_FILE = "examples.json"
API_REGISTRY_FILE = "api_registry.json"
OUTPUT_FILE = "examples_with_apis.json"


# ============================================================
# LOAD
# ============================================================

def load_json(path):

    with open(
        path,
        "r",
        encoding="utf-8"
    ) as f:

        return json.load(f)


# ============================================================
# API INDEX
# ============================================================

def build_api_index(registry):

    by_name = {}

    by_qualified_name = {}

    methods_by_class = {}

    # --------------------------------------------------------
    # Classes / functions
    # --------------------------------------------------------

    for qualified_name, api in registry["symbols"].items():

        by_qualified_name[
            qualified_name
        ] = api

        name = api["name"]

        by_name.setdefault(
            name,
            []
        ).append(api)

        # ----------------------------------------------------
        # Methods
        # ----------------------------------------------------

        if api["kind"] == "class":

            methods = {}

            for method in api.get(
                "methods",
                []
            ):

                methods[
                    method["name"]
                ] = method

            methods_by_class[
                qualified_name
            ] = methods

    return (
        by_name,
        by_qualified_name,
        methods_by_class,
    )


# ============================================================
# NAME RESOLUTION
# ============================================================

def resolve_class_name(
    class_name,
    by_name
):

    candidates = [
        x
        for x in by_name.get(
            class_name,
            []
        )
        if x["kind"] == "class"
    ]

    if len(candidates) == 1:

        return candidates[0]

    return None


# ============================================================
# TYPE INFERENCE
# ============================================================

class TypeInferenceVisitor(ast.NodeVisitor):

    def __init__(
        self,
        by_name
    ):

        self.by_name = by_name

        # ----------------------------------------------------
        # Variable -> API class
        #
        # Example:
        #
        # axes -> Axes
        # circle -> Circle
        #
        # ----------------------------------------------------

        self.variable_types = {}

        # ----------------------------------------------------
        # All discovered usages
        # ----------------------------------------------------

        self.usages = []

    # ========================================================
    # ASSIGNMENT
    # ========================================================

    def visit_Assign(self, node):

        # ----------------------------------------------------
        # Example:
        #
        # axes = Axes(...)
        # ----------------------------------------------------

        if isinstance(
            node.value,
            ast.Call
        ):

            class_name = (
                self.get_called_class_name(
                    node.value
                )
            )

            if class_name:

                api = resolve_class_name(
                    class_name,
                    self.by_name
                )

                if api:

                    for target in node.targets:

                        variable_names = (
                            self.extract_target_names(
                                target
                            )
                        )

                        for variable_name in variable_names:

                            self.variable_types[
                                variable_name
                            ] = api

                            self.add_usage(
                                api,
                                node,
                                usage_type="instantiation"
                            )

        self.generic_visit(node)

    # ========================================================
    # ANN ASSIGNMENT
    # ========================================================

    def visit_AnnAssign(self, node):

        # Example:
        #
        # axes: Axes = Axes(...)
        #

        if isinstance(
            node.value,
            ast.Call
        ):

            class_name = (
                self.get_called_class_name(
                    node.value
                )
            )

            if class_name:

                api = resolve_class_name(
                    class_name,
                    self.by_name
                )

                if api:

                    variable_names = (
                        self.extract_target_names(
                            node.target
                        )
                    )

                    for variable_name in variable_names:

                        self.variable_types[
                            variable_name
                        ] = api

                        self.add_usage(
                            api,
                            node,
                            usage_type="instantiation"
                        )

        self.generic_visit(node)

    # ========================================================
    # CALL
    # ========================================================

    def visit_Call(self, node):

        # ----------------------------------------------------
        # Example:
        #
        # Circle(...)
        # Create(...)
        # ----------------------------------------------------

        called_name = (
            self.get_call_name(
                node.func
            )
        )

        if called_name:

            # ------------------------------------------------
            # Direct API call
            # ------------------------------------------------

            if "." not in called_name:

                api = resolve_class_name(
                    called_name,
                    self.by_name
                )

                if api:

                    self.add_usage(
                        api,
                        node,
                        usage_type="call"
                    )

            else:

                # --------------------------------------------
                # Example:
                #
                # manim.Circle(...)
                #
                # --------------------------------------------

                parts = called_name.split(".")

                simple_name = parts[-1]

                api = resolve_class_name(
                    simple_name,
                    self.by_name
                )

                if api:

                    self.add_usage(
                        api,
                        node,
                        usage_type="call"
                    )

        # ----------------------------------------------------
        # Important:
        #
        # We still generic_visit because a call can contain
        # another API call.
        # ----------------------------------------------------

        self.generic_visit(node)

    # ========================================================
    # ATTRIBUTE / METHOD CALL
    # ========================================================

    def visit_Attribute(self, node):

        # ----------------------------------------------------
        # Example:
        #
        # axes.plot
        #
        # node.value = Name("axes")
        # node.attr  = "plot"
        # ----------------------------------------------------

        if isinstance(
            node.value,
            ast.Name
        ):

            variable_name = (
                node.value.id
            )

            method_name = (
                node.attr
            )

            api = self.variable_types.get(
                variable_name
            )

            if api:

                method = self.find_method(
                    api,
                    method_name
                )

                if method:

                    self.usages.append({

                        "qualified_name":
                            method[
                                "qualified_name"
                            ],

                        "name":
                            method_name,

                        "kind":
                            "method",

                        "match_type":
                            "type_inferred",

                        "confidence":
                            0.99,

                        "object":
                            variable_name,

                        "class":
                            api[
                                "qualified_name"
                            ],

                        "usage_type":
                            "method_access",

                        "line":
                            node.lineno,

                    })

        self.generic_visit(node)

    # ========================================================
    # FIND METHOD
    # ========================================================

    def find_method(
        self,
        class_api,
        method_name
    ):

        # ----------------------------------------------------
        # Direct methods
        # ----------------------------------------------------

        for method in class_api.get(
            "methods",
            []
        ):

            if method["name"] == method_name:

                return method

        # ----------------------------------------------------
        # Inherited methods
        #
        # Walk base classes recursively.
        # ----------------------------------------------------

        for base_class in class_api.get(
            "base_classes",
            []
        ):

            base_api = (
                self.find_api_by_qualified_name(
                    base_class
                )
            )

            if base_api:

                result = self.find_method(
                    base_api,
                    method_name
                )

                if result:
                    return result

        return None

    # ========================================================
    # API LOOKUP
    # ========================================================

    def find_api_by_qualified_name(
        self,
        qualified_name
    ):

        candidates = self.by_name.get(
            qualified_name.split(".")[-1],
            []
        )

        for candidate in candidates:

            if candidate[
                "qualified_name"
            ] == qualified_name:

                return candidate

        return None

    # ========================================================
    # ADD USAGE
    # ========================================================

    def add_usage(
        self,
        api,
        node,
        usage_type
    ):

        self.usages.append({

            "qualified_name":
                api[
                    "qualified_name"
                ],

            "name":
                api["name"],

            "kind":
                api["kind"],

            "match_type":
                "exact_name",

            "confidence":
                1.0,

            "usage_type":
                usage_type,

            "line":
                node.lineno,

        })

    # ========================================================
    # CALLED CLASS NAME
    # ========================================================

    def get_called_class_name(
        self,
        call
    ):

        if not isinstance(
            call,
            ast.Call
        ):

            return None

        func = call.func

        # Circle(...)
        if isinstance(
            func,
            ast.Name
        ):

            return func.id

        # manim.Circle(...)
        if isinstance(
            func,
            ast.Attribute
        ):

            return func.attr

        return None

    # ========================================================
    # CALL NAME
    # ========================================================

    def get_call_name(
        self,
        node
    ):

        if isinstance(
            node,
            ast.Name
        ):

            return node.id

        if isinstance(
            node,
            ast.Attribute
        ):

            parts = []

            current = node

            while isinstance(
                current,
                ast.Attribute
            ):

                parts.append(
                    current.attr
                )

                current = current.value

            if isinstance(
                current,
                ast.Name
            ):

                parts.append(
                    current.id
                )

            parts.reverse()

            return ".".join(parts)

        return None

    # ========================================================
    # TARGET NAMES
    # ========================================================

    def extract_target_names(
        self,
        target
    ):

        if isinstance(
            target,
            ast.Name
        ):

            return [
                target.id
            ]

        if isinstance(
            target,
            ast.Tuple
        ):

            result = []

            for element in target.elts:

                result.extend(
                    self.extract_target_names(
                        element
                    )
                )

            return result

        if isinstance(
            target,
            ast.List
        ):

            result = []

            for element in target.elts:

                result.extend(
                    self.extract_target_names(
                        element
                    )
                )

            return result

        return []


# ============================================================
# DOCUMENTATION REFERENCES
# ============================================================

def resolve_ref_classes(
    ref_classes,
    by_name
):

    results = []

    for class_name in ref_classes:

        candidates = [
            x
            for x in by_name.get(
                class_name,
                []
            )
            if x["kind"] == "class"
        ]

        if len(candidates) == 1:

            api = candidates[0]

            results.append({

                "qualified_name":
                    api[
                        "qualified_name"
                    ],

                "name":
                    api["name"],

                "kind":
                    "class",

                "match_type":
                    "ref_class",

                "confidence":
                    1.0,

            })

        elif len(candidates) > 1:

            results.append({

                "name":
                    class_name,

                "match_type":
                    "ambiguous",

                "confidence":
                    0.0,

                "candidates": [
                    x[
                        "qualified_name"
                    ]
                    for x in candidates
                ],

            })

        else:

            results.append({

                "name":
                    class_name,

                "match_type":
                    "unresolved",

                "confidence":
                    0.0,

            })

    return results


# ============================================================
# DEDUPLICATE
# ============================================================

def deduplicate(items):

    seen = set()

    result = []

    for item in items:

        qualified_name = item.get(
            "qualified_name"
        )

        if not qualified_name:
            continue

        if qualified_name in seen:
            continue

        seen.add(
            qualified_name
        )

        result.append(
            item
        )

    return result


# ============================================================
# PROCESS EXAMPLE
# ============================================================

def process_example(
    example,
    by_name
):

    code = example.get(
        "code",
        ""
    )

    try:

        tree = ast.parse(
            code
        )

    except SyntaxError as e:

        print(
            f"[WARNING] "
            f"{example['title']}: {e}"
        )

        return {
            **example,
            "apis": [],
            "api_usage": [],
            "api_references": [],
            "unresolved": [],
        }

    visitor = TypeInferenceVisitor(
        by_name
    )

    visitor.visit(
        tree
    )

    # --------------------------------------------------------
    # Documentation refs
    # --------------------------------------------------------

    ref_results = resolve_ref_classes(
        example.get(
            "ref_classes",
            []
        ),
        by_name
    )

    # --------------------------------------------------------
    # Merge
    # --------------------------------------------------------

    all_items = (
        visitor.usages
        + ref_results
    )

    all_items = deduplicate(
        all_items
    )

    # --------------------------------------------------------
    # API names
    # --------------------------------------------------------

    api_names = [
        x["qualified_name"]
        for x in all_items
        if "qualified_name" in x
    ]

    # --------------------------------------------------------
    # Unresolved
    # --------------------------------------------------------

    unresolved = []

    for item in (
        visitor.usages
        + ref_results
    ):

        if item.get(
            "match_type"
        ) in {
            "unresolved",
            "ambiguous"
        }:

            unresolved.append(
                item
            )

    # --------------------------------------------------------
    # Result
    # --------------------------------------------------------

    return {

        **example,

        "variable_types": {
            name:
                api[
                    "qualified_name"
                ]
            for name, api
            in visitor.variable_types.items()
        },

        "api_usage":
            visitor.usages,

        "api_references":
            ref_results,

        "apis":
            api_names,

        "unresolved":
            unresolved,

        "api_count":
            len(api_names),

    }


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 70)
    print("EXAMPLE → API LINKER V2")
    print("=" * 70)

    # --------------------------------------------------------
    # Load
    # --------------------------------------------------------

    print(
        "\n[1/4] Loading..."
    )

    examples_data = load_json(
        EXAMPLES_FILE
    )

    registry = load_json(
        API_REGISTRY_FILE
    )

    examples = examples_data[
        "examples"
    ]

    print(
        f"Examples: {len(examples)}"
    )

    print(
        f"APIs: {len(registry['symbols'])}"
    )

    # --------------------------------------------------------
    # Index
    # --------------------------------------------------------

    print(
        "\n[2/4] Building API index..."
    )

    (
        by_name,
        by_qualified_name,
        methods_by_class,
    ) = build_api_index(
        registry
    )

    print(
        f"Names indexed: {len(by_name)}"
    )

    # --------------------------------------------------------
    # Process
    # --------------------------------------------------------

    print(
        "\n[3/4] Processing examples..."
    )

    results = []

    total_links = 0
    total_unresolved = 0

    for index, example in enumerate(
        examples,
        start=1
    ):

        result = process_example(
            example,
            by_name
        )

        results.append(
            result
        )

        total_links += result[
            "api_count"
        ]

        total_unresolved += len(
            result[
                "unresolved"
            ]
        )

        print(
            f"[{index}/{len(examples)}] "
            f"{example['title']} "
            f"→ {result['api_count']} APIs"
        )

    # --------------------------------------------------------
    # Output
    # --------------------------------------------------------

    print(
        "\n[4/4] Saving..."
    )

    output = {

        "library":
            examples_data[
                "library"
            ],

        "statistics": {

            "examples":
                len(results),

            "total_api_links":
                total_links,

            "unresolved":
                total_unresolved,

            "average_apis_per_example":
                (
                    total_links
                    / len(results)
                    if results
                    else 0
                ),

        },

        "examples":
            results,

    }

    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            output,
            f,
            indent=2,
            ensure_ascii=False
        )

    # --------------------------------------------------------
    # Stats
    # --------------------------------------------------------

    print("\n" + "=" * 70)

    print(
        f"Examples        : "
        f"{len(results)}"
    )

    print(
        f"API links       : "
        f"{total_links}"
    )

    print(
        f"Unresolved      : "
        f"{total_unresolved}"
    )

    print(
        f"Avg APIs/example: "
        f"{output['statistics']['average_apis_per_example']:.2f}"
    )

    print("=" * 70)


if __name__ == "__main__":
    main()