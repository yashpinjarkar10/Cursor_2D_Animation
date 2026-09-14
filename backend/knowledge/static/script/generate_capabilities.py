import json
import os
import re
from collections import defaultdict
from dotenv import load_dotenv

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage


API_FILE = "api_registry.json"
CANDIDATE_FILE = "capability_candidates.json"
OUTPUT_FILE = "capabilities_raw.json"

BATCH_SIZE = 35
load_dotenv()


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
    model="gemini-3.5-flash-lite",
    api_key=GOOGLE_API_KEY,
    temperature=0,
)


# =========================================================
# Utilities
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
    """
    Gemini may occasionally return:

    ```json
    {...}
    ```

    Strip markdown fences before parsing.
    """

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

        # Try extracting the outermost JSON object.
        start = text.find("{")
        end = text.rfind("}")

        if start != -1 and end != -1:
            return json.loads(
                text[start:end + 1]
            )

        raise


# =========================================================
# Load registry
# =========================================================

api_data = load_json(API_FILE)
candidate_data = load_json(CANDIDATE_FILE)

apis = api_data["symbols"]
candidates = candidate_data["candidates"]

print(f"APIs loaded       : {len(apis)}")
print(f"Candidates loaded : {len(candidates)}")


# =========================================================
# Group candidates by module
# =========================================================

module_groups = defaultdict(list)

for candidate in candidates:
    module_groups[
        candidate["module"]
    ].append(candidate)

groups = list(module_groups.values())

print(f"Module groups     : {len(groups)}")


# =========================================================
# Compact representation
# =========================================================

def compact_candidate(candidate):

    return {
        "api": candidate["api"],
        "name": candidate["name"],
        "kind": candidate["kind"],
        "module": candidate["module"],
        "description": (
            candidate.get("description")
            or ""
        ),
        "examples": candidate.get(
            "examples",
            []
        ),
        "used_with": [
            x["api"]
            for x in candidate.get(
                "used_with",
                []
            )
        ],
    }


# =========================================================
# System prompt
# =========================================================

SYSTEM_PROMPT = """
You are a senior API architect designing a semantic capability
registry for Manim Community v0.19.0.

You are given EXISTING Manim API candidates.

Your task is to group these APIs into meaningful,
user-facing capabilities.

A capability represents something a user could naturally ask
an AI animation system to accomplish.

For example:

APIs:
- Axes
- CoordinateSystem.plot
- Dot
- ValueTracker
- Mobject.add_updater

Capability:
"Animate a point along a curve"

Another example:

APIs:
- MathTex
- TransformMatchingTex
- ReplacementTransform

Capability:
"Transform mathematical equations"

Another:

APIs:
- ThreeDAxes
- Surface
- ThreeDScene

Capability:
"Create and animate 3D surfaces"


CRITICAL RULES:

1. NEVER invent an API.

2. Only use API qualified names that appear in the input.

3. Do NOT create one capability per API.

4. Multiple APIs should be grouped when they commonly
   contribute to the same user-level goal.

5. A single API may belong to multiple capabilities.

6. Avoid extremely generic capabilities such as:
   - create animation
   - manipulate objects
   - modify scene
   - display objects

7. Prefer capabilities that correspond to natural user intent.

8. Capabilities should be useful for downstream code generation.

9. Do not make capabilities unnecessarily broad.

10. Low-level implementation APIs should normally be attached
    to a higher-level capability instead of becoming their own
    user-facing capability.

11. Examples are evidence of how APIs are composed.

12. API relationships such as "used_with" are also evidence.

13. An API does NOT need an example to participate in a capability.

14. If an API does not contribute to a meaningful capability,
    it may be omitted.

15. Preserve exact API qualified names.

16. Preserve exact example names.

Return ONLY valid JSON.
"""


# =========================================================
# User prompt
# =========================================================

def build_prompt(batch):

    compact = [
        compact_candidate(candidate)
        for candidate in batch
    ]

    return f"""
Create semantic capabilities from the following Manim APIs.

INPUT:

{json.dumps(
    compact,
    indent=2,
    ensure_ascii=False
)}


Return exactly:

{{
  "capabilities": [
    {{
      "id": "snake_case_unique_id",
      "name": "Human readable capability name",
      "description": "What this capability allows the system to accomplish.",
      "apis": [
        "exact.qualified.api.name"
      ],
      "examples": [
        "ExactExampleName"
      ],
      "intent_patterns": [
        "natural language request example"
      ],
      "constraints": []
    }}
  ]
}}


Additional requirements:

- Every API in "apis" MUST exist in the input.
- Every example in "examples" MUST exist in the input.
- Prefer approximately 2-10 APIs per capability when appropriate.
- A capability can contain one API if that API itself represents
  a meaningful user-level operation.
- Do not force unrelated APIs together.
- Do not create duplicate capabilities inside this batch.
- Keep IDs concise and descriptive.
- Do not include explanations outside the JSON.
"""


# =========================================================
# Generate capabilities
# =========================================================

def generate_batch(batch, batch_number):

    print(
        f"\nBatch {batch_number}: "
        f"{len(batch)} APIs"
    )

    messages = [
        SystemMessage(
            content=SYSTEM_PROMPT
        ),
        HumanMessage(
            content=build_prompt(batch)
        )
    ]

    response = llm_fast.invoke(messages)

    result = parse_json_response(
        response.content
    )

    capabilities = result.get(
        "capabilities",
        []
    )

    print(
        f"Generated capabilities: "
        f"{len(capabilities)}"
    )

    return capabilities


# =========================================================
# Run
# =========================================================

all_capabilities = []

batch_number = 0

for module_group in groups:

    for i in range(
        0,
        len(module_group),
        BATCH_SIZE
    ):

        batch = module_group[
            i:i + BATCH_SIZE
        ]

        batch_number += 1

        try:

            capabilities = generate_batch(
                batch,
                batch_number
            )

            all_capabilities.extend(
                capabilities
            )

        except Exception as e:

            print(
                f"ERROR in batch "
                f"{batch_number}: {e}"
            )


# =========================================================
# Validate API references
# =========================================================

valid_api_names = set(
    apis.keys()
)

invalid_api_refs = []

valid_capabilities = []

for capability in all_capabilities:

    valid_refs = []

    for api in capability.get(
        "apis",
        []
    ):

        if api in valid_api_names:
            valid_refs.append(api)

        else:
            invalid_api_refs.append({
                "capability":
                    capability.get("id"),
                "api": api
            })

    capability["apis"] = valid_refs

    if valid_refs:
        valid_capabilities.append(
            capability
        )


# =========================================================
# Validate example references
# =========================================================

all_example_names = set()

for candidate in candidates:

    for example in candidate.get(
        "examples",
        []
    ):
        all_example_names.add(
            example
        )


invalid_example_refs = []

for capability in valid_capabilities:

    valid_examples = []

    for example in capability.get(
        "examples",
        []
    ):

        if example in all_example_names:
            valid_examples.append(
                example
            )

        else:
            invalid_example_refs.append({
                "capability":
                    capability.get("id"),
                "example": example
            })

    capability["examples"] = (
        valid_examples
    )


# =========================================================
# Deduplicate IDs
# =========================================================

seen_ids = defaultdict(int)

for capability in valid_capabilities:

    original_id = capability["id"]

    seen_ids[
        original_id
    ] += 1

    count = seen_ids[
        original_id
    ]

    if count > 1:

        capability["id"] = (
            f"{original_id}_{count}"
        )


# =========================================================
# Final output
# =========================================================

output = {

    "library": {
        "name":
            api_data["library"]["name"],

        "package":
            api_data["library"]["package"],

        "version":
            api_data["library"]["version"],
    },

    "capabilities":
        valid_capabilities,

    "statistics": {

        "api_count":
            len(apis),

        "candidate_count":
            len(candidates),

        "raw_capability_count":
            len(all_capabilities),

        "capability_count":
            len(valid_capabilities),

        "invalid_api_references":
            len(invalid_api_refs),

        "invalid_example_references":
            len(invalid_example_refs),
    }
}


save_json(
    output,
    OUTPUT_FILE
)


# =========================================================
# Summary
# =========================================================

print("\n================================")
print("Capability generation complete")
print("================================")

print(
    f"APIs                 : {len(apis)}"
)

print(
    f"Candidates           : {len(candidates)}"
)

print(
    f"Raw capabilities     : "
    f"{len(all_capabilities)}"
)

print(
    f"Valid capabilities   : "
    f"{len(valid_capabilities)}"
)

print(
    f"Invalid API refs     : "
    f"{len(invalid_api_refs)}"
)

print(
    f"Invalid example refs : "
    f"{len(invalid_example_refs)}"
)

print(
    f"Saved                : "
    f"{OUTPUT_FILE}"
)