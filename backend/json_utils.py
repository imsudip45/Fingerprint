"""
Helpers for parsing structured JSON emitted by foundation models.
"""
import json


def parse_model_json(raw: str):
    """Parse JSON even when the model wraps it with fences or extra text."""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        object_start = text.find("{")
        object_end = text.rfind("}")
        array_start = text.find("[")
        array_end = text.rfind("]")

        candidates = []
        if object_start != -1 and object_end > object_start:
            candidates.append(text[object_start:object_end + 1])
        if array_start != -1 and array_end > array_start:
            candidates.append(text[array_start:array_end + 1])

        for candidate in candidates:
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue
        raise