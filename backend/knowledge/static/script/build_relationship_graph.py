import json
from collections import Counter


API_FILE = "api_registry.json"
EXAMPLE_FILE = "examples_with_apis.json"
OUTPUT_FILE = "api_relationships.json"


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main():

    print("=" * 70)
    print("BUILDING MANIM API RELATIONSHIP GRAPH")
    print("=" * 70)

    # =========================================================
    # 1. LOAD DATA
    # =========================================================

    print("\n[1/6] Loading...")

    api_data = load_json(API_FILE)
    example_data = load_json(EXAMPLE_FILE)

    # Actual schemas
    api_registry = api_data["symbols"]
    examples = example_data["examples"]

    print(f"APIs     : {len(api_registry)}")
    print(f"Examples : {len(examples)}")

    # =========================================================
    # 2. BUILD API INDEXES
    # =========================================================

    print("\n[2/6] Building API indexes...")

    api_by_name = {}
    api_by_qname = {}

    for qname, api in api_registry.items():

        api_by_qname[qname] = api

        name = api.get("name")

        if name:
            # Don't overwrite if multiple APIs have same name
            if name not in api_by_name:
                api_by_name[name] = qname

    print(f"API names indexed: {len(api_by_name)}")

    # =========================================================
    # RELATIONSHIP STORAGE
    # =========================================================

    relationships = {}

    def add_relationship(
        source,
        relation,
        target,
        evidence=None,
        weight=1,
        confidence=1.0
    ):

        key = (source, relation, target)

        if key not in relationships:

            relationships[key] = {
                "source": source,
                "relation": relation,
                "target": target,
                "weight": weight,
                "confidence": confidence,
                "evidence": []
            }

        else:

            relationships[key]["weight"] += weight

            relationships[key]["confidence"] = max(
                relationships[key]["confidence"],
                confidence
            )

        if evidence:

            for item in evidence:

                if item not in relationships[key]["evidence"]:
                    relationships[key]["evidence"].append(item)

    # =========================================================
    # 3. INHERITANCE
    # =========================================================

    print("\n[3/6] Building inheritance relationships...")

    inheritance_count = 0

    for qname, api in api_registry.items():

        for base in api.get("base_classes", []):

            # Exact qualified name
            if base in api_registry:
                base_qname = base

            # Simple name
            else:
                base_qname = api_by_name.get(base)

            if not base_qname:
                continue

            add_relationship(
                source=qname,
                relation="inherits",
                target=base_qname,
                confidence=1.0
            )

            inheritance_count += 1

    print(
        f"Inheritance relationships: "
        f"{inheritance_count}"
    )

    # =========================================================
    # 4. METHOD OWNERSHIP
    # =========================================================

    print("\n[4/6] Building method relationships...")

    method_count = 0

    for qname, api in api_registry.items():

        methods = api.get("methods", [])

        # Safety check
        if not isinstance(methods, list):
            continue

        for method in methods:

            method_qname = method.get("qualified_name")

            if not method_qname:
                continue

            add_relationship(
                source=qname,
                relation="has_method",
                target=method_qname,
                confidence=1.0
            )

            method_count += 1

    print(
        f"Method relationships: "
        f"{method_count}"
    )

    # =========================================================
    # 5. EXAMPLE → API
    # =========================================================

    print("\n[5/6] Building example relationships...")

    example_api_map = {}

    example_uses_count = 0

    for example in examples:

        title = example.get("title", "unknown")

        # IMPORTANT:
        # The linker stores resolved APIs here.
        apis = example.get("apis", [])

        # Remove duplicates while preserving order
        apis = list(dict.fromkeys(apis))

        example_api_map[title] = apis

        for api_qname in apis:

            if api_qname not in api_registry:
                continue

            add_relationship(
                source=title,
                relation="uses",
                target=api_qname,
                evidence=[title],
                confidence=1.0
            )

            example_uses_count += 1

    print(
        f"Example → API relationships: "
        f"{example_uses_count}"
    )

    # =========================================================
    # 6. API → API COMPOSITION
    # =========================================================

    print("\n[6/6] Building composition relationships...")

    raw_used_with = 0

    for example_title, apis in example_api_map.items():

        if len(apis) < 2:
            continue

        # ---------------------------------------------------------
        # ONLY KEEP NON-METHOD APIs
        # ---------------------------------------------------------

        object_apis = []

        for qname in apis:

            api = api_registry.get(qname)

            if not api:
                continue

            kind = api.get("kind")

            # Keep classes/functions.
            # Exclude method symbols.
            if kind in ("class", "function"):
                object_apis.append(qname)

        # Remove duplicates
        object_apis = list(dict.fromkeys(object_apis))

        if len(object_apis) < 2:
            continue

        # ---------------------------------------------------------
        # BUILD API COMPOSITION RELATIONSHIPS
        # ---------------------------------------------------------

        for i in range(len(object_apis)):

            for j in range(i + 1, len(object_apis)):

                api_a = object_apis[i]
                api_b = object_apis[j]

                add_relationship(
                    source=api_a,
                    relation="used_with",
                    target=api_b,
                    evidence=[example_title],
                    weight=1,
                    confidence=0.8
                )

                add_relationship(
                    source=api_b,
                    relation="used_with",
                    target=api_a,
                    evidence=[example_title],
                    weight=1,
                    confidence=0.8
                )

                raw_used_with += 2

    print(
        f"Raw composition relationships: "
        f"{raw_used_with}"
    )

    # =========================================================
    # CONVERT TO LIST
    # =========================================================

    relationship_list = list(relationships.values())

    # =========================================================
    # STATISTICS
    # =========================================================

    relation_counts = Counter(
        r["relation"]
        for r in relationship_list
    )

    # =========================================================
    # SAVE
    # =========================================================

    output = {

        "library": api_data.get("library", {}),

        "manim_version": api_data
            .get("library", {})
            .get("version", "unknown"),

        "statistics": {
            "apis": len(api_registry),
            "examples": len(examples),
            "relationships": len(relationship_list),

            "inherits": relation_counts["inherits"],
            "has_method": relation_counts["has_method"],
            "uses": relation_counts["uses"],
            "used_with": relation_counts["used_with"]
        },

        "relationships": relationship_list
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

    # =========================================================
    # SUMMARY
    # =========================================================

    print("\n" + "=" * 70)
    print("DONE")
    print("=" * 70)

    print(
        f"Total relationships : "
        f"{len(relationship_list)}"
    )

    print(
        f"Inherits            : "
        f"{relation_counts['inherits']}"
    )

    print(
        f"Has method           : "
        f"{relation_counts['has_method']}"
    )

    print(
        f"Uses                 : "
        f"{relation_counts['uses']}"
    )

    print(
        f"Used with            : "
        f"{relation_counts['used_with']}"
    )

    print(
        f"\nSaved: {OUTPUT_FILE}"
    )

    print("=" * 70)


if __name__ == "__main__":
    main()