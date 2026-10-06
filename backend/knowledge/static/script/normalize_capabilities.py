import json
import os
import re
from collections import defaultdict

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from dotenv import load_dotenv

load_dotenv()


RAW_FILE = "capabilities_raw.json"
EXAMPLES_FILE = "examples.json"
OUTPUT_FILE = "capabilities.json"

# Keep this relatively small because we want the normalization
# decision to be deliberate.
BATCH_SIZE = 40


# =========================================================
# Environment
# =========================================================

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if GOOGLE_API_KEY:
    GOOGLE_API_KEY = (
        GOOGLE_API_KEY
        .strip()
        .strip('"')
        .strip("'")
    )

if not GOOGLE_API_KEY:
    raise RuntimeError(
        "GOOGLE_API_KEY environment variable is not set."
    )


# =========================================================
# Gemini
# =========================================================

llm_fast = ChatGoogleGenerativeAI(
    model="gemini-3.1-flash-lite",
    api_key=GOOGLE_API_KEY,
    temperature=0,
)


# =========================================================
# JSON helpers
# =========================================================

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(data, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(
            data,
            f,
            indent=2,
            ensure_ascii=False
        )


def parse_json_response(text):

    text = text.strip()

    if text.startswith("```"):
        text = re.sub(
            r"^```(?:json)?",
            "",
            text,
            flags=re.IGNORECASE
        )

        text = re.sub(
            r"```$",
            "",
            text
        )

        text = text.strip()

    try:
        return json.loads(text)

    except json.JSONDecodeError:

        start = text.find("{")
        end = text.rfind("}")

        if start == -1 or end == -1:
            raise

        return json.loads(
            text[start:end + 1]
        )


# =========================================================
# Load data
# =========================================================

raw_data = load_json(RAW_FILE)
example_data = load_json(EXAMPLES_FILE)

raw_capabilities = raw_data["capabilities"]

print(
    f"Raw capabilities : "
    f"{len(raw_capabilities)}"
)


# =========================================================
# Build GLOBAL example registry
#
# This fixes the problem from the previous pass.
#
# A capability may reference an example that wasn't attached
# to every API inside the capability.
# =========================================================

examples = example_data.get(
    "examples",
    []
)

example_names = set()

for example in examples:

    if isinstance(example, dict):

        name = (
            example.get("name")
            or example.get("id")
            or example.get("example")
        )

        if name:
            example_names.add(name)

    elif isinstance(example, str):

        example_names.add(example)


print(
    f"Global examples   : "
    f"{len(example_names)}"
)


# =========================================================
# Validate raw examples against GLOBAL registry
# =========================================================

example_repairs = 0

for capability in raw_capabilities:

    original = capability.get(
        "examples",
        []
    )

    cleaned = []

    for example in original:

        if example in example_names:
            cleaned.append(example)

        else:
            example_repairs += 1

    capability["examples"] = cleaned


print(
    f"Removed invalid example refs: "
    f"{example_repairs}"
)


# =========================================================
# Compact representation for Gemini
#
# We deliberately do NOT send all API descriptions again.
# The capability-generation stage already extracted the
# semantic information we need.
# =========================================================

def compact_capability(capability):

    return {
        "id": capability["id"],
        "name": capability["name"],
        "description": capability.get(
            "description",
            ""
        ),
        "apis": capability.get(
            "apis",
            []
        ),
        "examples": capability.get(
            "examples",
            []
        ),
        "intent_patterns": capability.get(
            "intent_patterns",
            []
        ),
        "constraints": capability.get(
            "constraints",
            []
        )
    }


compact_capabilities = [
    compact_capability(c)
    for c in raw_capabilities
]


# =========================================================
# System prompt
# =========================================================

SYSTEM_PROMPT = """
You are the ontology architect for an AI system that generates
Manim Community v0.19.0 animations.

You are given semantic capabilities extracted from the Manim API.

Your job is to normalize them.

The goal is NOT to maximize the number of capabilities.

The goal is to produce a clean set of distinct, useful,
user-facing capabilities.

There are three possible relationships between capabilities:

1. MERGE

Use when two capabilities describe essentially the same
user-level task.

Example:

"fade objects in and out"
"fade mobjects into or out of scene"

These should become one capability.

2. KEEP_SEPARATE

Use when capabilities have different user intent even if they
share APIs.

Example:

"animate a point along a curve"

and

"animate a graph transformation"

These should remain separate.

3. PARENT_CHILD

Use when one capability is genuinely broader than another.

Example:

Parent:
"animate mathematical graphs"

Child:
"animate a point along a curve"

Do NOT create parent-child relationships merely because one
capability happens to use more APIs.

IMPORTANT:

- Never invent APIs.
- Never remove APIs from a capability unless they are clearly
  unrelated.
- Never invent example names.
- Preserve exact API qualified names.
- Preserve exact example names.
- A capability may share APIs with another capability.
- Do not merge capabilities merely because they are in the
  same Manim module.
- Do not make everything extremely broad.
- Prefer capabilities corresponding to natural user requests.
- Low-level implementation concepts should not become
  user-facing capabilities.
- Similar wording does NOT automatically mean same capability.
- Semantic intent is what matters.

We are normalizing an existing ontology, not redesigning Manim.

Return ONLY valid JSON.
"""


# =========================================================
# Batch normalization
# =========================================================

def build_prompt(batch):

    return f"""
Here are candidate capabilities from Manim.

CAPABILITIES:

{json.dumps(
    batch,
    indent=2,
    ensure_ascii=False
)}


For each capability, decide whether it should:

- remain as-is
- merge with another capability
- be a child of another capability

Return:

{{
  "decisions": [
    {{
      "capability_id": "existing_id",
      "action": "keep",
      "target_id": null,
      "reason": "short explanation"
    }},
    {{
      "capability_id": "existing_id",
      "action": "merge",
      "target_id": "existing_id",
      "reason": "short explanation"
    }},
    {{
      "capability_id": "existing_id",
      "action": "parent_child",
      "target_id": "existing_id",
      "reason": "short explanation"
    }}
  ]
}}

Rules:

- "target_id" MUST be another ID from this input.
- "keep" means the capability remains independently useful.
- "merge" means the two capabilities are substantially the same.
- "parent_child" means target_id is the broader parent.
- Do not create new IDs.
- Do not make decisions involving capabilities not present
  in this batch.
"""


# =========================================================
# Normalize each batch
# =========================================================

decisions = []

batch_number = 0

for i in range(
    0,
    len(compact_capabilities),
    BATCH_SIZE
):

    batch = compact_capabilities[
        i:i + BATCH_SIZE
    ]

    batch_number += 1

    print(
        f"\nNormalization batch "
        f"{batch_number}: "
        f"{len(batch)} capabilities"
    )

    messages = [
        SystemMessage(
            content=SYSTEM_PROMPT
        ),
        HumanMessage(
            content=build_prompt(batch)
        )
    ]

    try:

        response = llm_fast.invoke(
            messages
        )

        result = parse_json_response(
            response.content
        )

        batch_decisions = result.get(
            "decisions",
            []
        )

        decisions.extend(
            batch_decisions
        )

        print(
            f"Decisions: "
            f"{len(batch_decisions)}"
        )

    except Exception as e:

        print(
            f"ERROR: {e}"
        )


# =========================================================
# IMPORTANT:
#
# Batch normalization cannot see cross-batch duplicates.
#
# Therefore we run a second GLOBAL comparison over the
# capability names/descriptions.
# =========================================================

print(
    "\nRunning global semantic normalization..."
)


global_input = []

for capability in compact_capabilities:

    global_input.append({
        "id": capability["id"],
        "name": capability["name"],
        "description": capability[
            "description"
        ],
        "intent_patterns": capability[
            "intent_patterns"
        ]
    })


GLOBAL_SYSTEM_PROMPT = """
You are performing the final global ontology normalization for
a Manim AI capability registry.

The input contains semantic capabilities.

Find capabilities that are genuinely duplicates or near-duplicates.

Do NOT merge capabilities merely because they are related.

For example:

"fade mobjects in and out"
and
"highlight objects"

are related but NOT duplicates.

Likewise:

"create graphs"
and
"animate a point along a curve"

are related but NOT duplicates.

Only identify strong semantic duplicates.

Return ONLY JSON:

{
  "merge_groups": [
    {
      "canonical_id": "id_to_keep",
      "duplicate_ids": [
        "duplicate_id_1",
        "duplicate_id_2"
      ],
      "reason": "why these represent the same capability"
    }
  ]
}

Rules:

- canonical_id must be one of the provided IDs.
- duplicate_ids must be provided IDs.
- Never invent IDs.
- Do not include the canonical ID in duplicate_ids.
- Prefer fewer merges over aggressive merging.
"""


global_prompt = f"""
CAPABILITIES:

{json.dumps(
    global_input,
    indent=2,
    ensure_ascii=False
)}

Identify only strong semantic duplicates.
"""


try:

    response = llm_fast.invoke([
        SystemMessage(
            content=GLOBAL_SYSTEM_PROMPT
        ),
        HumanMessage(
            content=global_prompt
        )
    ])

    global_result = parse_json_response(
        response.content
    )

except Exception as e:

    print(
        f"Global normalization failed: {e}"
    )

    global_result = {
        "merge_groups": []
    }


merge_groups = global_result.get(
    "merge_groups",
    []
)


print(
    f"Global merge groups: "
    f"{len(merge_groups)}"
)


# =========================================================
# Build lookup
# =========================================================

capability_by_id = {
    c["id"]: c
    for c in raw_capabilities
}


# =========================================================
# Merge capabilities
# =========================================================

merged_ids = set()

final_capabilities = []


for group in merge_groups:

    canonical_id = group.get(
        "canonical_id"
    )

    duplicate_ids = group.get(
        "duplicate_ids",
        []
    )

    if canonical_id not in capability_by_id:
        continue

    canonical = capability_by_id[
        canonical_id
    ]

    all_ids = [
        canonical_id
    ] + duplicate_ids

    all_ids = [
        x for x in all_ids
        if x in capability_by_id
    ]

    # ---------------------------------------------
    # Merge API references
    # ---------------------------------------------

    api_set = []

    for cid in all_ids:

        for api in capability_by_id[
            cid
        ].get("apis", []):

            if api not in api_set:
                api_set.append(api)

    # ---------------------------------------------
    # Merge examples
    # ---------------------------------------------

    example_set = []

    for cid in all_ids:

        for example in capability_by_id[
            cid
        ].get("examples", []):

            if example not in example_set:
                example_set.append(
                    example
                )

    # ---------------------------------------------
    # Merge intent patterns
    # ---------------------------------------------

    intent_set = []

    for cid in all_ids:

        for intent in capability_by_id[
            cid
        ].get("intent_patterns", []):

            if intent not in intent_set:
                intent_set.append(
                    intent
                )

    # ---------------------------------------------
    # Merge constraints
    # ---------------------------------------------

    constraint_set = []

    for cid in all_ids:

        for constraint in capability_by_id[
            cid
        ].get("constraints", []):

            if constraint not in constraint_set:
                constraint_set.append(
                    constraint
                )

    # ---------------------------------------------
    # Keep canonical description/name
    # ---------------------------------------------

    canonical["apis"] = api_set

    canonical["examples"] = example_set

    canonical["intent_patterns"] = (
        intent_set
    )

    canonical["constraints"] = (
        constraint_set
    )

    canonical["merged_from"] = (
        duplicate_ids
    )

    final_capabilities.append(
        canonical
    )

    merged_ids.update(
        duplicate_ids
    )


# =========================================================
# Add capabilities that weren't merged
# =========================================================

for capability in raw_capabilities:

    cid = capability["id"]

    if cid in merged_ids:
        continue

    if any(
        c["id"] == cid
        for c in final_capabilities
    ):
        continue

    capability["merged_from"] = []

    final_capabilities.append(
        capability
    )


# =========================================================
# Remove duplicate APIs/examples within each capability
# =========================================================

for capability in final_capabilities:

    capability["apis"] = list(
        dict.fromkeys(
            capability.get(
                "apis",
                []
            )
        )
    )

    capability["examples"] = list(
        dict.fromkeys(
            capability.get(
                "examples",
                []
            )
        )
    )

    capability["intent_patterns"] = list(
        dict.fromkeys(
            capability.get(
                "intent_patterns",
                []
            )
        )
    )

    capability["constraints"] = list(
        dict.fromkeys(
            capability.get(
                "constraints",
                []
            )
        )
    )


# =========================================================
# Add version
# =========================================================

version = raw_data[
    "library"
]["version"]


for capability in final_capabilities:

    capability["version"] = version


# =========================================================
# Sort
# =========================================================

final_capabilities.sort(
    key=lambda x: x["name"].lower()
)


# =========================================================
# Statistics
# =========================================================

final_output = {

    "library": {
        "name": raw_data[
            "library"
        ]["name"],

        "package": raw_data[
            "library"
        ]["package"],

        "version": version
    },

    "capabilities":
        final_capabilities,

    "statistics": {

        "raw_capability_count":
            len(raw_capabilities),

        "final_capability_count":
            len(final_capabilities),

        "merged_capabilities":
            len(merged_ids),

        "global_merge_groups":
            len(merge_groups),

        "global_example_count":
            len(example_names)
    }
}


save_json(
    final_output,
    OUTPUT_FILE
)


print("\n================================")
print("Capability normalization complete")
print("================================")

print(
    f"Raw capabilities   : "
    f"{len(raw_capabilities)}"
)

print(
    f"Final capabilities : "
    f"{len(final_capabilities)}"
)

print(
    f"Merged capabilities: "
    f"{len(merged_ids)}"
)

print(
    f"Merge groups       : "
    f"{len(merge_groups)}"
)

print(
    f"Global examples    : "
    f"{len(example_names)}"
)

print(
    f"Saved              : "
    f"{OUTPUT_FILE}"
)