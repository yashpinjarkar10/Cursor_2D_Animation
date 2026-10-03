from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from config import DEFAULT_REPAIR_MAX_TOKENS, get_llm
from graph.nodes.code_generator import _compact_api, _compact_example, _compact_implementation_plan
from graph.nodes.retrieval import get_knowledge
from graph.state import AnimationState
from prompts import REPAIR_PROMPT


def repair_code(state: AnimationState) -> dict[str, Any]:
    """Repair generated code after validation or rendering failure."""
    attempt_count = int(state.get("attempt_count", 0))
    max_attempts = int(state.get("max_attempts", 3))
    last_error = state.get("last_error") or state.get("error") or "Unknown failure"
    repair_context = _retrieve_repair_context(state, last_error)

    print(f"Repairing code (attempt {attempt_count + 1}/{max_attempts})...")

    if attempt_count >= max_attempts:
        return {
            "error": f"Repair attempts exhausted after {attempt_count} attempts: {last_error}",
            "last_error": last_error,
            "repair_knowledge": repair_context,
            "retrieval_trace": repair_context.get("retrieval_trace", state.get("retrieval_trace")),
        }

    next_attempt = attempt_count + 1
    try:
        llm = get_llm(temperature=0.1, max_tokens=DEFAULT_REPAIR_MAX_TOKENS)
        response = llm.invoke(
            [
                SystemMessage(content=REPAIR_PROMPT),
                HumanMessage(
                    content=json.dumps(
                        {
                            "attempt": next_attempt,
                            "failure_type": state.get("failure_type"),
                            "repair_target": state.get("repair_target"),
                            "error": last_error,
                            "validation_result": state.get("validation_result"),
                            "execution_result": _compact_execution_result(state.get("execution_result") or {}),
                            "current_code": state.get("generated_code"),
                            "implementation_plan": _compact_implementation_plan(
                                state.get("implementation_plan") or {}
                            ),
                            "retrieved_knowledge": _compact_repair_context(repair_context),
                        },
                        ensure_ascii=False,
                    )
                ),
            ]
        )
        repaired_code = _strip_code_fence(str(response.content))
    except Exception as exc:
        return {
            "attempt_count": next_attempt,
            "error": f"Code repair failed: {exc}",
            "last_error": str(exc),
            "failure_type": "runtime",
        }

    if "from manim import" not in repaired_code:
        repaired_code = "from manim import *\n\n" + repaired_code

    return {
        "generated_code": repaired_code,
        "attempt_count": next_attempt,
        "repair_knowledge": repair_context,
        "retrieval_trace": repair_context.get("retrieval_trace", state.get("retrieval_trace")),
        "error": None,
        "last_error": None,
        "failure_type": None,
        "repair_target": None,
    }


def _retrieve_repair_context(state: AnimationState, error: str) -> dict[str, Any]:
    request = state.get("request") or "Manim animation"
    symbols = _extract_error_symbols(error)
    query = (
        f"{request}\nFailure type: {state.get('failure_type')}\n"
        f"Renderer or validator error: {error}\n"
        f"Failing symbols or arguments: {', '.join(symbols) or 'unknown'}\n"
        "Find the verified Manim 0.19.0 API, signature, method, or related example that fixes this failure."
    )
    try:
        knowledge = get_knowledge()
        context = knowledge.search_implementation_context(query)
        exact_apis = []
        exact_examples = []
        for symbol in symbols:
            api = knowledge.get_api(symbol)
            if api is not None:
                exact_apis.append(api)
                for example_id in knowledge.get_api_examples(symbol)[:3]:
                    example = knowledge.get_example(example_id)
                    if example is not None:
                        exact_examples.append(example)
        context["error_symbols"] = symbols
        context["exact_apis"] = _unique_records(exact_apis)
        context["exact_examples"] = _unique_records(exact_examples)
        trace = dict(state.get("retrieval_trace") or {})
        trace.setdefault("queries", []).append(query)
        trace.setdefault("repair_queries", []).append(query)
        return {**context, "retrieval_trace": trace}
    except Exception as exc:
        return {"query": query, "warning": str(exc), "implementation_candidates": []}


def _extract_error_symbols(error: str) -> list[str]:
    """Extract API-like names and unexpected arguments from common Python errors."""
    patterns = [
        r"name ['\"]([A-Za-z_][\w.]*)['\"] is not defined",
        r"has no attribute ['\"]([A-Za-z_]\w*)['\"]",
        r"unexpected keyword argument ['\"]([A-Za-z_]\w*)['\"]",
        r"Unknown (?:Manim )?symbol: ([A-Za-z_]\w*)",
        r"Unknown method [A-Za-z_]\w*\.([A-Za-z_]\w*)",
    ]
    symbols: list[str] = []
    for pattern in patterns:
        for match in re.findall(pattern, error):
            if match not in symbols:
                symbols.append(match)
    return symbols


def _unique_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    seen: set[str] = set()
    for record in records:
        record_id = record.get("id") or record.get("qualified_name")
        if not record_id or record_id in seen:
            continue
        seen.add(record_id)
        unique.append(record)
    return unique


def _compact_repair_context(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "query": str(context.get("query", ""))[:800],
        "error_symbols": context.get("error_symbols", [])[:12],
        "exact_apis": [_compact_api(api) for api in context.get("exact_apis", [])[:8]],
        "exact_examples": [
            _compact_example(example) for example in context.get("exact_examples", [])[:2]
        ],
        "implementation_candidates": [
            _compact_api(api) for api in context.get("implementation_candidates", [])[:8]
        ],
    }


def _compact_execution_result(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": result.get("status"),
        "error": str(result.get("error") or "")[-1200:],
    }


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:python)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    return text
