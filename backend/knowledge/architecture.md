Correct. From this point, the task is to build the LangGraph runtime around the knowledge system we already built. We should keep the architecture exactly to the pipeline we discussed:

```text
USER REQUEST
    ↓
1. Request Normalization
    ↓
2. Scene Director
    ↓
3. Capability Planner
    ↓
4. Knowledge Retrieval
    ↓
5. Code Generator
    ↓
6. Static Validator
    ↓
7. Manim Sandbox / Renderer
    ↓
8. Critic
    ↓
   PASS ─────────────→ VIDEO OUTPUT
    ↓
   FAIL
    ↓
9. Repair
    ↓
   back to appropriate node
```

The knowledge layer is already implemented and verified: Chroma has 158 capabilities, 597 APIs, and 75 examples, with structured API/example/capability retrieval working. 

Below is the specification I would give the coding agent. This is the implementation contract for the LangGraph system.

Build the LangGraph runtime for the Manim AI animation system.

The goal is:

```text
User natural-language request
        ↓
LangGraph
        ↓
Scene Plan
        ↓
Capability Plan
        ↓
Retrieved Manim knowledge
        ↓
Manim Python code
        ↓
Validated code
        ↓
Rendered video
        ↓
Critic evaluation
        ↓
Repair if necessary
        ↓
Final video
```

Do not introduce unrelated architecture, additional agents, additional databases, or unnecessary abstractions.

The existing Manim knowledge layer is the source of library knowledge.

==================================================

1. EXISTING KNOWLEDGE LAYER
   ==================================================

The knowledge layer already contains:

```text
Taxonomy
API Registry
Example Registry
Capability Registry
Relationship Graph
Chroma semantic retrieval
Relationship retrieval
ManimKnowledge orchestration
```

Current verified knowledge:

```text
Manim version: 0.19.0

Capabilities: 158
APIs: 597
Examples: 75
```

The runtime must interact with this knowledge through `ManimKnowledge`.

Do not make LangGraph nodes directly load:

```text
capabilities.json
api_registry.json
examples.json
examples_with_apis.json
api_relationships.json
```

The nodes should use the knowledge interface.

The knowledge layer answers:

```text
"What capabilities are relevant?"
"What APIs implement them?"
"What APIs work with them?"
"What official examples demonstrate them?"
"How are those APIs used?"
"What are the exact API signatures and methods?"
```

The LangGraph nodes answer:

```text
"What should the animation explain?"
"What capabilities are needed?"
"How should those capabilities be implemented?"
"Does the generated code work?"
"Does the rendered result satisfy the request?"
```

Keep these responsibilities separate.

==================================================
2. LANGGRAPH STATE
==================

Create one shared state object for the complete workflow.

The state should contain the information required by downstream nodes.

Conceptually:

```python
class AnimationState:
    request
    normalized_request

    project_context

    scene_plan
    capability_plan
    retrieved_knowledge

    generated_code

    validation_result
    execution_result

    critique_result
    repair_state

    final_video
```

Use the project's existing state implementation if one exists.

Do not create duplicate state models.

The state should also preserve:

```text
attempt number
maximum attempts
current failure category
current node/repair target
```

where required for bounded repair.

The state is the shared contract between nodes.

==================================================
3. NODE 1 — REQUEST NORMALIZATION
=================================

Purpose:

Convert the raw user request into a clean normalized request.

Input:

```text
raw user request
+
optional project context
+
optional constraints
+
optional voiceover configuration
```

Example:

```text
"Create a 20 second animation explaining gradient descent on a parabola."
```

Output:

```json
{
  "text": "Create a 20 second animation explaining gradient descent on a parabola.",
  "mode": "create",
  "duration": 20,
  "aspect_ratio": "16:9",
  "quality": "high",
  "voiceover_enabled": false
}
```

Do not perform Manim API retrieval here.

Do not generate code.

Do not create scene decomposition here unless the existing architecture explicitly combines normalization with planning.

Responsibilities:

```text
normalize request
identify mode
resolve explicit constraints
preserve project context
preserve user preferences
```

==================================================
4. NODE 2 — SCENE DIRECTOR
==========================

Purpose:

Convert normalized user intent into a structured animation/storyboard plan.

This is the highest-level reasoning node.

Input:

```text
normalized request
+
project context
+
global constraints
+
voiceover settings
```

The Scene Director does NOT need the full Manim API registry.

It should not search the API collection directly.

It should reason about:

```text
topic
objective
audience
difficulty
visual explanation
scene structure
timeline
narration
```

Output:

```text
ScenePlan
```

Conceptually:

```json
{
  "request_type": "create",

  "project_intent": {
    "topic": "Gradient descent",
    "objective": "Explain how iterative updates move toward a minimum.",
    "audience": "general learner",
    "difficulty": "intermediate"
  },

  "duration": {
    "seconds": 20,
    "source": "user"
  },

  "global_visual_direction": {
    "style": "clean mathematical educational animation",
    "composition": "centered graph with supporting labels",
    "color_strategy": "limited contrastive palette"
  },

  "scenes": [
    {
      "id": "setup",
      "purpose": "Introduce the parabola and starting point.",
      "duration": 4,
      "visual_elements": [
        "coordinate plane",
        "parabola",
        "starting point"
      ],
      "actions": [
        "show the coordinate plane",
        "draw the parabola",
        "introduce the starting point"
      ],
      "narration": null,
      "dependencies": []
    },

    {
      "id": "descent",
      "purpose": "Show iterative movement toward the minimum.",
      "duration": 10,
      "visual_elements": [
        "current point",
        "direction/update indication"
      ],
      "actions": [
        "move the point through successive positions",
        "show convergence toward the minimum"
      ],
      "narration": null,
      "dependencies": ["setup"]
    },

    {
      "id": "result",
      "purpose": "Show the final position near the minimum.",
      "duration": 6,
      "visual_elements": [
        "minimum",
        "final point",
        "result label"
      ],
      "actions": [
        "emphasize convergence"
      ],
      "narration": null,
      "dependencies": ["descent"]
    }
  ],

  "global_timeline": {
    "estimated_duration": 20
  }
}
```

Important boundary:

Scene Director says:

```text
"Show a point moving toward the minimum."
```

It does NOT say:

```text
"Use ValueTracker.add_updater()."
```

That belongs to the Capability Planner.

==================================================
5. NODE 3 — CAPABILITY PLANNER
==============================

Purpose:

Translate the Scene Plan into implementation-level Manim capabilities.

This is where the first interaction with the Manim knowledge layer becomes important.

Input:

```text
ScenePlan
+
global constraints
```

Knowledge used:

```text
Capability Registry
Chroma capability search
Capability inspection
API relationships
API registry
Official examples
```

The Capability Planner should use the knowledge layer progressively.

Do NOT retrieve all 158 capabilities.

Do NOT retrieve all 597 APIs.

Do NOT retrieve all 75 examples.

Use targeted retrieval.

For each scene:

```text
scene requirement
      ↓
search relevant capabilities
      ↓
inspect selected capabilities
      ↓
identify required implementation capabilities
      ↓
retrieve supporting API information
      ↓
retrieve related APIs
      ↓
retrieve relevant examples
```

Example:

Scene requirement:

```text
"A point should move continuously along a parabola."
```

The planner may identify:

```text
plot functions on coordinate systems
animate numerical parameters with value trackers
animate point on curve
```

Then resolve APIs such as:

```text
Axes
CoordinateSystem.plot
ValueTracker
Dot
Mobject.add_updater
```

and relevant relationships/examples.

The Capability Planner output should contain:

```json
{
  "scene_id": "descent",
  "duration": 10,

  "capabilities": [
    {
      "capability_id": "...",
      "priority": "required",
      "reason": "...",
      "targets": ["parabola", "moving_point"]
    }
  ],

  "implementation_requirements": [
    {
      "target": "moving_point",
      "requirement": "Point must remain synchronized with the changing parameter."
    }
  ],

  "api_candidates": [
    "..."
  ],

  "examples": [
    "..."
  ],

  "constraints": [
    "..."
  ]
}
```

The planner may use exact API information, but it still does NOT generate Python.

The planner's job is:

```text
Scene intent
    ↓
implementation capabilities
    ↓
technical requirements
    ↓
relevant Manim knowledge
```

==================================================
6. KNOWLEDGE RETRIEVAL
======================

Knowledge retrieval may be implemented as a separate node or as a deterministic subroutine inside Capability Planner, depending on the existing code structure.

Do not create an unnecessary LLM agent solely for retrieval.

The retrieval layer should use:

```text
ManimKnowledge
```

which combines:

```text
ChromaKnowledgeRepository
RelationshipRepository
```

Available conceptual operations:

```python
search_capabilities(query)
search_apis(query)
search_examples(query)

get_capability(id)
get_api(id)
get_example(id)

get_related_apis(api_id)
get_api_examples(api_id)
get_example_apis(example_id)
get_example_api_usage(example_id)
```

Use them progressively.

Example:

```text
User/Scene requirement
        ↓
search_capabilities()
        ↓
selected capability
        ↓
get_capability()
        ↓
capability.apis
        ↓
get_api()
        ↓
get_related_apis()
        ↓
get_api_examples()
        ↓
get_example()
        ↓
get_example_api_usage()
```

The resulting context should contain only knowledge relevant to the current scene.

==================================================
7. NODE 4 — CODE GENERATOR
==========================

Purpose:

Generate executable Manim Python code from the complete implementation context.

Input:

```text
normalized request
+
ScenePlan
+
CapabilityPlan
+
retrieved APIs
+
retrieved examples
+
relationships
+
constraints
+
current code if editing
```

The Code Generator is the first node responsible for Python.

It should use the existing Gemini wrapper.

Do not create another unrelated LLM configuration.

The generator must target:

```text
Manim 0.19.0
```

Requirements:

```text
use only retrieved/verified APIs where applicable
follow exact signatures
adapt official examples when useful
produce executable Python
respect scene duration
use semantic variable/object names
keep code editable
avoid hallucinated APIs
avoid unnecessary complexity
```

The generator should produce:

```text
generated_code
```

and optionally structured generation metadata.

It should not decide whether the animation visually succeeded.

That belongs to Critic.

==================================================
8. NODE 5 — STATIC VALIDATOR
============================

Purpose:

Catch deterministic code problems before running Manim.

This node does NOT need an LLM.

Input:

```text
generated_code
+
Manim 0.19.0 knowledge
```

Validation should include:

```text
AST parsing
imports
Manim symbol existence
API compatibility
signatures
Scene class
construct()
dangerous constructs
obvious resource violations
```

Output:

```json
{
  "status": "pass | fail",
  "errors": [
    {
      "type": "api_error",
      "message": "...",
      "line": 23
    }
  ],
  "warnings": []
}
```

If validation passes:

```text
Static Validator
       ↓
Sandbox Renderer
```

If validation fails:

```text
Static Validator
       ↓
Repair
```

Do not render code that fails basic static validation.

==================================================
9. NODE 6 — MANIM SANDBOX / RENDERER
====================================

Purpose:

Execute validated Manim code in an isolated environment and produce the video.

Never execute generated code inside the API process.

The renderer should eventually run through an isolated Manim environment/container.

Input:

```text
validated Manim code
+
render configuration
```

Render configuration includes:

```text
Manim version
resolution
quality
aspect ratio
output settings
timeout
```

Output:

```json
{
  "status": "success | failure",
  "video_path": "...",
  "duration": 20.1,
  "frames": "...",
  "logs": "...",
  "stderr": "...",
  "error": null
}
```

The renderer should also make representative frames available for visual evaluation.

If execution fails:

```text
Renderer
   ↓
Repair
```

If execution succeeds:

```text
Renderer
   ↓
Critic
```

==================================================
10. NODE 7 — CRITIC
===================

Purpose:

Determine whether the generated animation actually satisfies the user's intent.

Input:

```text
original request
+
ScenePlan
+
CapabilityPlan
+
generated code
+
execution result
+
rendered video/representative frames
+
duration
+
voiceover timing if enabled
```

The Critic should evaluate:

```text
instruction correctness
visual correctness
animation correctness
timing
composition
layout
readability
mathematical consistency
narration synchronization
runtime correctness
```

Visual checks include:

```text
overlap
cropping
objects outside frame
tiny text
excessive empty space
clutter
poor hierarchy
unexpected objects
```

Output:

```json
{
  "status": "pass | fail",

  "scores": {
    "instruction": 0.0,
    "visual": 0.0,
    "animation": 0.0,
    "timing": 0.0,
    "readability": 0.0
  },

  "issues": [
    {
      "type": "visual",
      "severity": "high",
      "description": "...",
      "target": "..."
    }
  ],

  "repair_plan": [
    {
      "target": "...",
      "change": "..."
    }
  ]
}
```

The Critic should compare:

```text
USER REQUEST
      vs
SCENE PLAN
      vs
RENDERED RESULT
```

not merely inspect whether the Python executed.

A successful render is NOT automatically a successful generation.

==================================================
11. NODE 8 — REPAIR
===================

Repair is a routing mechanism, not an unlimited new agent.

Maximum initial attempts:

```text
3
```

Classify failure:

```text
syntax
import
API
runtime
visual
timing
instruction
narration
```

Repair hierarchy:

```text
syntax/API/import/runtime
        ↓
Code Generator with diagnostics

implementation problem
        ↓
Capability Planner

story/intent problem
        ↓
Scene Director
```

For example:

```text
ValueTracker method does not exist
        ↓
Code Generator
```

But:

```text
The animation has no visual representation of the optimization step
        ↓
Capability Planner
```

And:

```text
The explanation itself is logically confusing
        ↓
Scene Director
```

Do not automatically restart the entire graph for every failure.

Preserve the existing state and repair the smallest appropriate layer.

After repair:

```text
Repair
  ↓
appropriate node
  ↓
Static Validator
  ↓
Renderer
  ↓
Critic
```

Stop after the maximum number of attempts.

If the final attempt fails, return a structured failure rather than looping indefinitely.

==================================================
12. FINAL VIDEO OUTPUT
======================

The successful path is:

```text
User
 ↓
Request Normalization
 ↓
Scene Director
 ↓
Capability Planner
 ↓
Knowledge Retrieval
 ↓
Code Generator
 ↓
Static Validator
 ↓
Sandbox Renderer
 ↓
Critic
 ↓
PASS
 ↓
Final Video
```

The final state should contain:

```text
final_video
generated_code
scene_plan
capability_plan
validation_result
execution_result
critique_result
```

The API layer can then return the video artifact to the user.

==================================================
13. COMPLETE EXAMPLE
====================

User asks:

```text
Create a 20 second animation explaining gradient descent on a parabola.
```

Step 1:

```text
Request Normalization
```

produces:

```text
topic = gradient descent
duration = 20
mode = create
```

Step 2:

```text
Scene Director
```

produces:

```text
Scene 1:
introduce parabola

Scene 2:
show starting point and iterative movement

Scene 3:
show convergence toward minimum
```

Step 3:

```text
Capability Planner
```

identifies conceptual requirements:

```text
plot a mathematical function
represent a moving point
animate a changing numerical parameter
keep point synchronized with curve
emphasize convergence
```

Step 4:

```text
Knowledge Retrieval
```

finds relevant capabilities and then exact APIs/examples.

For example, the knowledge system may resolve:

```text
Axes
CoordinateSystem.plot
ValueTracker
Dot
Mobject.add_updater
```

plus relevant official examples.

The exact APIs must come from retrieval, not be hard-coded into the planner.

Step 5:

```text
Code Generator
```

generates executable Manim 0.19.0 code.

Step 6:

```text
Static Validator
```

checks:

```text
syntax
imports
API existence
signatures
Scene
construct
```

Step 7:

```text
Sandbox Renderer
```

runs Manim and produces:

```text
20 second video
```

Step 8:

```text
Critic
```

checks:

```text
Does the point actually move toward the minimum?
Is the parabola visible?
Is the explanation readable?
Is the animation approximately 20 seconds?
Are labels inside the frame?
Is the visual result consistent with the Scene Plan?
```

If everything passes:

```text
FINAL VIDEO
```

If not:

```text
Critic
   ↓
Repair
   ↓
Code Generator / Capability Planner / Scene Director
   ↓
Validator
   ↓
Renderer
   ↓
Critic
```

==================================================
14. LANGGRAPH ROUTING
=====================

The graph should conceptually be:

```text
START
  ↓
request_normalization
  ↓
scene_director
  ↓
scene_plan_validation
  ↓
capability_planner
  ↓
knowledge_retrieval
  ↓
code_generator
  ↓
static_validator
  ↓
      ┌────────────── FAIL ──────────────┐
      │                                   ↓
      │                                repair
      │                                   │
      │                                   └──→ appropriate node
      │
      └──────── PASS ──→ renderer
                           ↓
                       execution check
                           │
                  ┌────────┴────────┐
                  │                 │
                FAIL              PASS
                  │                 ↓
                repair            critic
                                    ↓
                              ┌─────┴─────┐
                              │           │
                            FAIL        PASS
                              │           ↓
                            repair    END
```

Do not implement this as a single giant agent.

Each node should have one clear responsibility.

==================================================
15. RESPONSIBILITY BOUNDARIES
=============================

Use these boundaries strictly.

```text
Request Normalization
→ Understand request structure.

Scene Director
→ Decide what the animation should communicate.

Capability Planner
→ Decide what Manim capabilities are required.

Knowledge Retrieval
→ Find verified library knowledge needed for implementation.

Code Generator
→ Convert the plan + knowledge into Python.

Static Validator
→ Deterministically verify Python/API correctness.

Renderer
→ Execute Manim and produce the actual artifact.

Critic
→ Determine whether the artifact satisfies the intended result.

Repair
→ Route failures back to the smallest appropriate planning/generation layer.
```

No node should silently take over another node's responsibility.

==================================================
16. IMPORTANT KNOWLEDGE INTERACTION RULE

The LLM should never receive the complete Manim library.

Do not do:

```text
597 APIs → LLM
```

Instead:

```text
request
 ↓
scene requirement
 ↓
capability search
 ↓
selected capabilities
 ↓
API retrieval
 ↓
relationship retrieval
 ↓
example retrieval
 ↓
small relevant context
 ↓
LLM
```

This is the central purpose of the knowledge layer.

The LLM does not need to know the entire library.

It needs the right subset at the right time.

==================================================
17. IMPLEMENTATION ORDER

Implement in this order:

1. Inspect existing LangGraph/state code.

2. Define/fix shared AnimationState.

3. Implement Request Normalization.

4. Implement Scene Director.

5. Implement Scene Plan validation.

6. Implement Capability Planner.

7. Connect Capability Planner to existing ManimKnowledge.

8. Implement targeted knowledge retrieval.

9. Implement Code Generator.

10. Implement Static Validator.

11. Implement Renderer interface.

12. Implement Critic.

13. Implement bounded repair routing.

14. Connect the complete graph.

15. Run one complete end-to-end request.

Do not implement voiceover, skill memory, editor modifications, or production optimization until this create-animation pipeline works.

==================================================
18. FIRST END-TO-END ACCEPTANCE TEST

The first complete test should be:

```text
Create a 20 second animation explaining gradient descent on a parabola.
```

Expected pipeline:

```text
request
 ↓
ScenePlan
 ↓
CapabilityPlan
 ↓
retrieved Manim knowledge
 ↓
Python code
 ↓
static validation PASS
 ↓
Manim render PASS
 ↓
Critic PASS
 ↓
20 second video artifact
```

If Critic fails, verify the repair loop.

The goal is not merely:

```text
Python generated
```

or:

```text
Manim executed
```

The acceptance criterion is:

```text
User intent
    ↓
correct Scene Plan
    ↓
correct Manim implementation
    ↓
successful render
    ↓
visually/instructionally correct video
```

Only after this complete path works should additional functionality be added.

The mental model you should keep while the agent implements this is very simple:

```text
Scene Director
"What should happen?"

Capability Planner
"What kind of Manim capability can make that happen?"

Knowledge Base
"What exactly does Manim provide, and how is it used?"

Code Generator
"How do I write the Python?"

Validator
"Is this code technically valid?"

Renderer
"Does it actually execute?"

Critic
"Did the resulting animation actually do what we wanted?"

Repair
"Which layer needs to change?"
```

That is the core of your system. Once this create → render → critic loop works, you have the fundamental product pipeline. The editor, voiceover, and skill memory are extensions of this core rather than separate architectures.
