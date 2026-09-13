from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from config import get_llm
from graph.state import AnimationState
from prompts import REPAIR_PROMPT


def repair_code(state: AnimationState) -> dict[str, Any]:
    """Repair generated code after validation or rendering failure."""
    attempt_count = int(state.get("attempt_count", 0))
    max_attempts = int(state.get("max_attempts", 3))
    last_error = state.get("last_error") or state.get("error") or "Unknown failure"

    if attempt_count >= max_attempts:
        return {
            "error": f"Repair attempts exhausted after {attempt_count} attempts: {last_error}",
            "last_error": last_error,
        }

    next_attempt = attempt_count + 1
    try:
        llm = get_llm(temperature=0.1)
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
                            "execution_result": state.get("execution_result"),
                            "current_code": state.get("generated_code"),
                            "retrieved_knowledge": state.get("retrieved_knowledge"),
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
        "error": None,
        "last_error": None,
        "failure_type": None,
        "repair_target": None,
    }


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:python)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    return text
