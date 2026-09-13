import json
from pathlib import Path


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def extract_records(data):
    """
    Normalize common top-level JSON structures.

    Supports:
        [...]
        {"items": [...]}
        {"data": [...]}
        {"capabilities": [...]}
        {"apis": [...]}
        {"examples": [...]}
    """

    if isinstance(data, list):
        return data

    if isinstance(data, dict):

        possible_keys = [
            "items",
            "data",
            "records",
            "capabilities",
            "apis",
            "examples",
        ]

        for key in possible_keys:
            value = data.get(key)

            if isinstance(value, list):
                return value

    raise ValueError(
        f"Unsupported JSON structure: {type(data).__name__}"
    )