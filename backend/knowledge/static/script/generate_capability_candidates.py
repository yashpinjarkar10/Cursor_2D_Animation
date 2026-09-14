import json
from collections import defaultdict


API_FILE = "api_registry.json"
EXAMPLE_FILE = "examples_with_apis.json"
RELATIONSHIP_FILE = "api_relationships.json"

OUTPUT_FILE = "capability_candidates.json"


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main():

    print("=" * 70)
    print("GENERATING CAPABILITY CANDIDATES")
    print("=" * 70)

    # ---------------------------------------------------------
    # LOAD
    # ---------------------------------------------------------

    print("\n[1/5] Loading...")

    api_data = load_json(API_FILE)
    example_data = load_json(EXAMPLE_FILE)
    relationship_data = load_json(RELATIONSHIP_FILE)

    apis = api_data["symbols"]
    examples = example_data["examples"]
    relationships = relationship_data["relationships"]

    print(f"APIs          : {len(apis)}")
    print(f"Examples      : {len(examples)}")
    print(f"Relationships : {len(relationships)}")

    # ---------------------------------------------------------
    # EXAMPLE → APIs
    # ---------------------------------------------------------

    print("\n[2/5] Building example index...")

    example_index = {}

    for example in examples:

        title = example["title"]

        example_index[title] = {
            "apis": example.get("apis", []),
            "ref_classes": example.get("ref_classes", []),
            "code": example.get("code", "")
        }

    # ---------------------------------------------------------
    # API → EXAMPLES
    # ---------------------------------------------------------

    print("\n[3/5] Building API usage index...")

    api_examples = defaultdict(list)

    for example in examples:

        title = example["title"]

        for api in example.get("apis", []):

            api_examples[api].append(title)

    # ---------------------------------------------------------
    # API → USED WITH
    # ---------------------------------------------------------

    print("\n[4/5] Building composition index...")

    api_used_with = defaultdict(list)

    for relationship in relationships:

        if relationship["relation"] != "used_with":
            continue

        source = relationship["source"]
        target = relationship["target"]

        api_used_with[source].append({
            "api": target,
            "weight": relationship["weight"],
            "evidence": relationship["evidence"]
        })

    # ---------------------------------------------------------
    # GENERATE CANDIDATES
    # ---------------------------------------------------------

    candidates = []

    for qname, api in apis.items():

        kind = api.get("kind")

        # We want classes/functions as capability candidates.
        if kind not in ("class", "function"):
            continue

        name = api.get("name") or ""
        description = api.get("description") or ""

        used_examples = api_examples.get(qname, [])

        used_with = sorted(
            api_used_with.get(qname, []),
            key=lambda x: x.get("weight", 0),
            reverse=True
        )

        used_with = used_with[:10]

        candidate = {
            "api": qname,
            "name": name,
            "kind": kind,
            "module": api.get("module") or "",
            "description": description[:2000],
            "example_count": len(used_examples),
            "examples": used_examples[:20],
            "used_with": used_with
        }

        candidates.append(candidate)

    # ---------------------------------------------------------
    # SAVE
    # ---------------------------------------------------------

    output = {
        "library": api_data.get("library", {}),
        "statistics": {
            "candidate_count": len(candidates)
        },
        "candidates": candidates
    }

    print("\n[5/5] Saving...")

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

    print("\n" + "=" * 70)
    print("DONE")
    print("=" * 70)

    print(
        f"Capability candidates: "
        f"{len(candidates)}"
    )

    print(f"Saved: {OUTPUT_FILE}")

    print("=" * 70)


if __name__ == "__main__":
    main()