# Orchestration boundary between the API and the LangGraph workflow
from __future__ import annotations

from typing import Any, AsyncIterator
from uuid import UUID

from graph.graph import graph, initial_state


# Raised when the animation graph does not produce a rendered video
class GenerationError(Exception):
    def __init__(self, message: str, state: dict[str, Any]) -> None:
        super().__init__(message)
        self.state = state


# Server-Sent Event wrapper for streaming generation progress to clients
class SSEEvent:
    def __init__(self, event: str, data: Any) -> None:
        self.event = event
        self.data = data

    def to_sse_format(self) -> str:
        return f"event: {self.event}\ndata: {self.data}\n\n"


# Stream LangGraph execution events mapped to user-friendly SSE events
async def stream_generation_events(
    *,
    generation_id: UUID,
    query: str,
    mode: str,
    duration: float | None,
    aspect_ratio: str,
    quality: str,
    voiceover_enabled: bool,
    project_context: dict[str, Any] | None,
) -> AsyncIterator[SSEEvent | dict[str, Any]]:
    state = initial_state(
        query,
        generation_id=str(generation_id),
        mode=mode,
        voiceover_enabled=voiceover_enabled,
        duration=duration,
        aspect_ratio=aspect_ratio,
        project_context=project_context,
        render_config={"quality": quality, "duration": duration},
    )
    
    # Emit started event
    yield SSEEvent("started", {
        "generation_id": str(generation_id),
        "status": "processing"
    })
    
    # Track if we've already yielded key events to avoid duplicates
    yielded_events = set()
    
    async for update in graph.astream(state, stream_mode="updates"):
        node_output = next(iter(update.values()), None)
        if isinstance(node_output, dict):
            state.update(node_output)
        
        # Map specific node states to user-friendly SSE events
        # Only yield each event once
        scene_plan = state.get("scene_plan")
        if scene_plan is not None and isinstance(scene_plan, dict) and "scene_planned" not in yielded_events:
            yield SSEEvent("scene_planned", {
                "progress": 0.15,
                "scenes_count": len(scene_plan.get("scenes", []))
            })
            yielded_events.add("scene_planned")
        
        capability_plan = state.get("capability_plan")
        if capability_plan is not None and isinstance(capability_plan, dict) and "capabilities_planned" not in yielded_events:
            yield SSEEvent("capabilities_planned", {
                "progress": 0.25,
                "capabilities": capability_plan.get("scenes", [])
            })
            yielded_events.add("capabilities_planned")
        
        retrieval_trace = state.get("retrieval_trace")
        if retrieval_trace is not None and isinstance(retrieval_trace, dict) and "knowledge_retrieved" not in yielded_events:
            yield SSEEvent("knowledge_retrieved", {
                "progress": 0.4,
                "apis_count": len(retrieval_trace.get("apis", []))
            })
            yielded_events.add("knowledge_retrieved")
        
        implementation_plan = state.get("implementation_plan")
        if implementation_plan is not None and isinstance(implementation_plan, dict) and "implementation_planned" not in yielded_events:
            yield SSEEvent("implementation_planned", {
                "progress": 0.5
            })
            yielded_events.add("implementation_planned")
        
        generated_code = state.get("generated_code")
        if generated_code is not None and "code_generated" not in yielded_events:
            yield SSEEvent("code_generated", {
                "progress": 0.65,
                "code_length": len(str(state.get("generated_code", "")))
            })
            yielded_events.add("code_generated")
        
        validation_result = state.get("validation_result")
        if validation_result is not None and isinstance(validation_result, dict):
            if validation_result.get("status") == "pass" and "validated_pass" not in yielded_events:
                yield SSEEvent("validated", {
                    "progress": 0.75,
                    "status": "pass"
                })
                yielded_events.add("validated_pass")
            elif validation_result.get("status") == "fail" and "validated_fail" not in yielded_events:
                yield SSEEvent("validated", {
                    "progress": 0.75,
                    "status": "fail",
                    "errors": validation_result.get("errors", [])
                })
                yielded_events.add("validated_fail")
        
        execution_result = state.get("execution_result")
        if execution_result is not None and isinstance(execution_result, dict):
            if execution_result.get("status") == "success" and "rendering" not in yielded_events:
                yield SSEEvent("rendering", {
                    "progress": 0.85,
                    "estimated_seconds": execution_result.get("duration", 5)
                })
                yielded_events.add("rendering")
            elif execution_result.get("status") != "success" and "rendering_error" not in yielded_events:
                yield SSEEvent("rendering", {
                    "progress": 0.85,
                    "error": execution_result.get("error", "Unknown error")
                })
                yielded_events.add("rendering_error")
    
    # Final check - if we have an error, yield it now
    # If successful, yield the final state for persistence
    execution = state.get("execution_result") or {}
    if execution.get("status") != "success" or not state.get("final_video"):
        error_msg = _final_error(state)
        yield SSEEvent("error", {
            "error": error_msg,
            "generation_id": str(generation_id),
            "failure_type": "generation"
        })
    else:
        # Yield final state for successful generation so it can be persisted
        yield state


def _final_error(state: dict[str, Any]) -> str:
    if state.get("error"):
        return str(state["error"])

    execution = state.get("execution_result") or {}
    if execution.get("error"):
        return str(execution["error"])

    validation = state.get("validation_result") or {}
    errors = validation.get("errors") or []
    if errors:
        first_error = errors[0]
        return str(first_error.get("message") if isinstance(first_error, dict) else first_error)

    return "Generation failed"


# Run LangGraph and return final in-memory state without persistence
async def run_generation(
    *,
    generation_id: UUID,
    query: str,
    mode: str,
    duration: float | None,
    aspect_ratio: str,
    quality: str,
    voiceover_enabled: bool,
    project_context: dict[str, Any] | None,
) -> dict[str, Any]:
    state = initial_state(
        query,
        generation_id=str(generation_id),
        mode=mode,
        voiceover_enabled=voiceover_enabled,
        duration=duration,
        aspect_ratio=aspect_ratio,
        project_context=project_context,
        render_config={"quality": quality, "duration": duration},
    )
    final_state: dict[str, Any] = dict(state)

    async for update in graph.astream(state, stream_mode="updates"):
        node_output = next(iter(update.values()), None)
        if isinstance(node_output, dict):
            final_state.update(node_output)

    execution = final_state.get("execution_result") or {}
    if execution.get("status") != "success" or not final_state.get("final_video"):
        raise GenerationError(_final_error(final_state), final_state)

    return final_state
