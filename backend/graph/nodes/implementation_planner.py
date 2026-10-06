from __future__ import annotations

from typing import Any

from graph.nodes.retrieval import get_knowledge
from graph.state import AnimationState


THREED_SCENE_API = "manim.scene.three_d_scene.ThreeDScene"
SCENE_API = "manim.scene.scene.Scene"


def plan_implementation(state: AnimationState) -> dict[str, Any]:
    """Build a verified implementation plan from retrieved knowledge."""
    knowledge = get_knowledge()
    scene_plan = state.get("scene_plan") or {}
    storyboard_scenes = {
        scene.get("id"): scene
        for scene in scene_plan.get("scenes", [])
        if isinstance(scene, dict) and scene.get("id")
    }
    capability_plan = state.get("capability_plan") or {}
    retrieved = state.get("retrieved_knowledge") or {}
    retrieved_scenes = {
        scene.get("scene_id"): scene
        for scene in retrieved.get("scenes", [])
        if isinstance(scene, dict)
    }
    rejected: list[str] = []
    planned_scenes: list[dict[str, Any]] = []
    any_3d = False

    for idx, scene in enumerate(capability_plan.get("scenes", []), 1):
        if not isinstance(scene, dict):
            continue
        scene_id = scene.get("scene_id") or scene.get("id") or f"scene_{idx}"
        storyboard = storyboard_scenes.get(scene_id, {})
        context = retrieved_scenes.get(scene_id, {})
        candidates = context.get("implementation_candidates", [])
        verified_apis = _resolve_candidates(knowledge, candidates, rejected)
        is_3d = _is_3d_scene(scene, state) or _is_3d_scene(storyboard, state)
        if is_3d:
            any_3d = True

        selected_capabilities = [
            capability.get("capability_id")
            for capability in scene.get("capabilities", [])
            if isinstance(capability, dict) and capability.get("capability_id")
        ]

        base_api_id = THREED_SCENE_API if is_3d else SCENE_API
        base_api = knowledge.get_api(base_api_id)
        if base_api is None:
            rejected.append(base_api_id)
        else:
            verified_apis = _prepend_unique(base_api, verified_apis)

        required_components = []
        for requirement in scene.get("implementation_requirements", []):
            if not isinstance(requirement, dict):
                continue
            required_components.append(
                {
                    "purpose": requirement.get("target") or "scene component",
                    "requirement": requirement.get("requirement", ""),
                    "api_ids": [api.get("id") for api in verified_apis if api.get("id")],
                }
            )

        spatial_budget = _build_layout_blueprint(
            storyboard or scene,
            selected_capabilities,
            is_3d,
        )

        staging_transition = storyboard.get("staging_transition") or {
            "clear_mode": "fade_out_all",
            "persistent_elements": [],
            "transition_note": "Clear temporary objects between acts",
        }

        section_name = storyboard.get("purpose") or f"Act {idx}"

        related_ids = [
            relationship.get("target")
            for relationship in context.get("related_apis", [])
            if relationship.get("target")
        ]
        supporting_apis = []
        for api_id in _unique_strings(related_ids):
            api = knowledge.get_api(api_id)
            if api is None:
                rejected.append(api_id)
                continue
            supporting_apis.append(api)

        planned_scenes.append(
            {
                "scene_id": scene_id,
                "section_name": section_name,
                "scene_type": "3d" if is_3d else "2d",
                "selected_capabilities": selected_capabilities,
                "base_scene": {"api": base_api_id if base_api else None},
                "required_components": required_components,
                "spatial_budget": spatial_budget,
                "visual_pattern": None,
                "staging_transition": staging_transition,
                "verified_apis": verified_apis,
                "supporting_apis": supporting_apis,
                "reference_examples": context.get("relationship_examples", [])[:8],
                "constraints": [
                    "Use only verified Manim 0.19.0 APIs",
                    "Do not invent API names or signatures",
                ],
            }
        )

    target_class = state.get("scene_class") or "Scene1"
    base_class = "ThreeDScene" if any_3d else "Scene"

    implementation_plan = {
        "target_class": target_class,
        "base_class": base_class,
        "helper_methods": [],
        "scenes": planned_scenes,
        "global_rules": [
            "Use only verified Manim 0.19.0 APIs",
            "Define modular helper functions for complex graphical structures",
            "Maintain spatial margin and avoid object overlap",
            "Use self.next_section() to delineate storyboard scenes",
        ],
    }
    trace = dict(state.get("retrieval_trace") or {})
    trace["rejected_candidates"] = _unique_strings(
        [*trace.get("rejected_candidates", []), *rejected]
    )
    trace["apis_selected"] = _unique_strings(
        [api.get("id") for scene in planned_scenes for api in scene.get("verified_apis", [])]
    )
    return {"implementation_plan": implementation_plan, "retrieval_trace": trace}


def _resolve_candidates(knowledge: Any, candidates: list[dict[str, Any]], rejected: list[str]) -> list[dict[str, Any]]:
    """Verify candidate APIs against the knowledge repository."""
    resolved: list[dict[str, Any]] = []
    seen: set[str] = set()
    for candidate in candidates:
        api_id = candidate.get("id") or candidate.get("qualified_name")
        if not isinstance(api_id, str) or api_id in seen:
            continue
        exact = knowledge.get_api(api_id)
        if exact is None:
            rejected.append(api_id)
        else:
            seen.add(api_id)
            resolved.append(exact)
    return resolved


def _prepend_unique(api: dict[str, Any], records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    api_id = api.get("id")
    return [api] + [record for record in records if record.get("id") != api_id]


def _is_3d_scene(scene: dict[str, Any], state: AnimationState) -> bool:
    """Detect if a scene requires 3D rendering based on context."""
    text = " ".join(
        str(value)
        for value in [
            state.get("request"),
            scene.get("purpose"),
            scene.get("visual_elements"),
            scene.get("actions"),
        ]
        if value
    ).lower()
    return any(token in text for token in ("3d", "three-dimensional", "three dimensional"))


def _build_layout_blueprint(
    scene: dict[str, Any],
    selected_capabilities: list[str],
    is_3d: bool,
) -> dict[str, Any]:
    """Create deterministic spatial and updater rules for code generation."""
    text = " ".join(
        [
            str(scene.get("purpose", "")),
            str(scene.get("visual_elements", "")),
            str(scene.get("actions", "")),
            " ".join(selected_capabilities),
        ]
    ).lower()

    dynamic = any(
        token in text
        for token in (
            "move",
            "moving",
            "track",
            "dynamic",
            "continuously",
            "gradient",
            "value_tracker",
            "updater",
        )
    )

    if is_3d:
        archetype = "three_d_scene"
        coord_system = "3D camera frame with explicit axes"
        stage_bounds = "x=-5..5, y=-3..3, z=-3..3"
        anchors: dict[str, Any] = {"center": [0, 0, 0]}
        params: dict[str, Any] = {"camera_phi": 75, "camera_theta": -45}
    elif any(token in text for token in ("tree", "bst", "binary search tree", "heap", "trie", "root", "leaf", "subtree")):
        archetype = "hierarchical_tree"
        coord_system = "2D camera frame"
        stage_bounds = "x=-5.5..5.5, y=-2.5..2.2"
        anchors = {
            "level_0": [0.0, 2.0, 0.0],
            "level_1_left": [-2.5, 0.5, 0.0],
            "level_1_right": [2.5, 0.5, 0.0],
            "level_2_ll": [-3.75, -1.0, 0.0],
            "level_2_lr": [-1.25, -1.0, 0.0],
            "level_2_rl": [1.25, -1.0, 0.0],
            "level_2_rr": [3.75, -1.0, 0.0],
        }
        params = {"node_radius": 0.45, "font_size": 22, "buff": 0.1}
    elif any(token in text for token in ("array", "list", "sort", "bubble", "swap", "stack", "queue", "grid")):
        archetype = "array_and_sequences"
        coord_system = "2D camera frame"
        stage_bounds = "x=-5.5..5.5, y=-2.5..2.2"
        anchors = {"array_center": [0.0, 0.0, 0.0], "pointer_zone": [0.0, -1.2, 0.0]}
        params = {"cell_size": 0.8, "max_width": 11.0, "auto_scale": True}
    elif any(token in text for token in ("graph", "network", "dijkstra", "bfs", "dfs", "vertex", "edge")):
        archetype = "graph_and_network"
        coord_system = "2D camera frame"
        stage_bounds = "x=-5.0..5.0, y=-2.2..2.2"
        anchors = {"center": [0.0, 0.0, 0.0]}
        params = {"vertex_radius": 0.35, "edge_buff": 0.1}
    elif any(token in text for token in ("curve", "parabola", "sine", "cosine", "tangent", "derivative", "integral", "plot", "axes", "function")):
        archetype = "coordinate_calculus_and_curves"
        coord_system = "2D coordinate axes"
        stage_bounds = "x=-5.5..5.5, y=-2.8..2.2"
        anchors = {"axes_center": [0.0, -0.2, 0.0]}
        params = {"x_length": 9.0, "y_length": 4.5}
    else:
        archetype = "general_composition"
        coord_system = "2D camera frame"
        stage_bounds = "x=-5.5..5.5, y=-2.5..2.2"
        anchors = {"header": [0.0, 3.2, 0.0], "center": [0.0, 0.0, 0.0], "footer": [0.0, -3.2, 0.0]}
        params = {"margin": 0.4}

    return {
        "archetype": archetype,
        "coordinate_system": coord_system,
        "zones": {
            "header": {"anchor": "UP", "height": 0.9, "reserved": True},
            "main_stage": {"anchor": "ORIGIN", "bounds": stage_bounds},
            "footer": {"anchor": "DOWN", "height": 0.6, "reserved": True},
        },
        "coordinate_anchors": anchors,
        "layout_parameters": params,
        "rules": [
            "Place the title in the header and keep it outside the main stage.",
            "Use VGroup.arrange or next_to with an explicit buff for related labels.",
            "Keep a frame margin of at least 0.35 and scale long text to fit.",
            "Do not stack independent objects at ORIGIN. Use explicit coordinate anchors.",
            "Check label placement after every transform or movement.",
        ],
        "dynamic_bindings": [
            {
                "target": "moving objects and attached labels",
                "strategy": "always_redraw or add_updater with a callable that recomputes next_to",
                "required": dynamic,
            }
        ],
    }


def _unique_strings(values: list[Any]) -> list[str]:
    result: list[str] = []
    for value in values:
        if isinstance(value, str) and value and value not in result:
            result.append(value)
    return result
