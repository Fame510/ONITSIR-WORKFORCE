"""Canonicalization primitives for SHACKLE (SP/1.0).

Split out of `shackle.py` so that the *detection* of non-canonicalizable
input is a real, general property of the input rather than a magic sentinel
key a caller has to volunteer. Before this module existed, `decide()` step 1
fired only when a caller set `params["__noncanonical__"] = True`, which meant
a caller who simply did not set the sentinel could pass structurally
un-hashable input straight through the gate. That limitation was documented in
`docs/SHACKLE.md` §6; this module closes it.

Two properties matter and are enforced here, not assumed:

1. **Canonicalization is total or it fails loudly.** `assert_canonicalizable()`
   walks the whole structure and raises `NonCanonicalInput` for anything that
   cannot round-trip to one unambiguous JSON encoding. Argument binding is only
   meaningful if two different argument sets can never share a digest.
2. **Opaque context is detected structurally.** `has_opaque_context()` scans
   for known opacity markers anywhere in the parameter tree instead of the
   single top-level `params["ctx"] == "opaque"` equality check it replaces.

`NonCanonicalInput` subclasses `ValueError` so that callers written against
the previous `json.dumps(allow_nan=False)` behaviour keep working unchanged.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, Mapping, Sequence

__all__ = [
    "NonCanonicalInput",
    "OPAQUE_CONTEXT_KEYS",
    "OPAQUE_CONTEXT_VALUES",
    "MAX_CANONICAL_DEPTH",
    "assert_canonicalizable",
    "canonical_json",
    "canonical_hash",
    "has_opaque_context",
]


class NonCanonicalInput(ValueError):
    """Raised when a parameter structure has no single canonical JSON form.

    Subclasses `ValueError` deliberately: the previous implementation surfaced
    `json.dumps(..., allow_nan=False)`'s own `ValueError` for NaN/Infinity, and
    existing callers catch that. Widening the detection must not narrow the
    exception contract.
    """


#: Keys whose value marks the calling context as unevaluable by the gate.
OPAQUE_CONTEXT_KEYS = frozenset({"ctx", "context", "__context__"})

#: Values (compared case-insensitively) that mark a context as unevaluable.
OPAQUE_CONTEXT_VALUES = frozenset({"opaque", "untestable", "unknown", "unverifiable"})

#: Nesting ceiling. Deeper structures are refused rather than recursed into,
#: so a hostile caller cannot turn canonicalization into a stack exhaustion.
MAX_CANONICAL_DEPTH = 64


def _reject(what: str) -> None:
    raise NonCanonicalInput(f"non-canonicalizable input: {what}")


def _walk(node: Any, depth: int, seen: set) -> None:
    """Depth-first structural validation. Raises NonCanonicalInput on failure."""
    if depth > MAX_CANONICAL_DEPTH:
        _reject(f"nesting deeper than {MAX_CANONICAL_DEPTH} levels")

    if node is None or isinstance(node, (bool, str)):
        return

    if isinstance(node, int):
        # bool is an int subclass but was already handled above.
        return

    if isinstance(node, float):
        # NaN, +Inf and -Inf have no JSON literal. json.dumps(allow_nan=True)
        # would emit the non-standard NaN/Infinity tokens, which other
        # implementations are free to reject or parse differently.
        if node != node or node in (float("inf"), float("-inf")):
            _reject("NaN or Infinity has no canonical JSON form")
        return

    if isinstance(node, Mapping):
        marker = id(node)
        if marker in seen:
            _reject("circular reference")
        seen.add(marker)
        for key, value in node.items():
            if not isinstance(key, str):
                # json.dumps coerces int/float/bool/None keys to strings, so
                # {1: "a"} and {"1": "a"} would collide on one digest. That
                # would make argument binding forgeable, so it is refused.
                _reject(f"non-string mapping key {key!r} ({type(key).__name__})")
            _walk(value, depth + 1, seen)
        seen.discard(marker)
        return

    if isinstance(node, (list, tuple)):
        if isinstance(node, tuple):
            # A tuple serializes to a JSON array, so (1, 2) and [1, 2] would
            # share a digest despite being different Python values.
            _reject("tuple has the same JSON encoding as a list")
        marker = id(node)
        if marker in seen:
            _reject("circular reference")
        seen.add(marker)
        for item in node:
            _walk(item, depth + 1, seen)
        seen.discard(marker)
        return

    _reject(f"unsupported type {type(node).__name__}")


def assert_canonicalizable(params: Any) -> None:
    """Raise `NonCanonicalInput` unless `params` has exactly one JSON encoding.

    This is the general replacement for the old `params["__noncanonical__"]`
    sentinel. Detection no longer depends on the caller's cooperation.
    """
    if not isinstance(params, Mapping):
        _reject(f"params must be a mapping, got {type(params).__name__}")
    _walk(params, 0, set())
    try:
        json.dumps(
            params, sort_keys=True, separators=(",", ":"),
            ensure_ascii=False, allow_nan=False,
        )
    except NonCanonicalInput:
        raise
    except Exception as exc:  # pragma: no cover - defence in depth
        raise NonCanonicalInput(f"non-canonicalizable input: {exc}") from exc


def canonical_json(params: Dict[str, Any]) -> str:
    """Canonical JSON text: keys sorted, tight separators, UTF-8, no NaN.

    Validates first, so a caller never gets a digest for input that another
    conforming implementation would refuse.
    """
    assert_canonicalizable(params)
    return json.dumps(
        params, sort_keys=True, separators=(",", ":"),
        ensure_ascii=False, allow_nan=False,
    )


def canonical_hash(params: Dict[str, Any]) -> str:
    """SHA-256 hex digest over `canonical_json(params)`.

    Unchanged output for every input the previous implementation accepted;
    inputs it silently accepted but could not canonicalize now raise
    `NonCanonicalInput` (a `ValueError`).
    """
    return hashlib.sha256(canonical_json(params).encode("utf-8")).hexdigest()


def _is_opaque_value(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower() in OPAQUE_CONTEXT_VALUES


def has_opaque_context(params: Any, _depth: int = 0) -> bool:
    """True if any opacity marker appears anywhere in the parameter tree.

    Replaces the single top-level `params.get("ctx") == "opaque"` equality
    check. A nested or differently-spelled opacity marker used to slip past the
    gate entirely; it no longer does.
    """
    if _depth > MAX_CANONICAL_DEPTH:
        return False
    if isinstance(params, Mapping):
        for key, value in params.items():
            if isinstance(key, str) and key.lower() in OPAQUE_CONTEXT_KEYS and _is_opaque_value(value):
                return True
            if has_opaque_context(value, _depth + 1):
                return True
        return False
    if isinstance(params, Sequence) and not isinstance(params, (str, bytes, bytearray)):
        return any(has_opaque_context(item, _depth + 1) for item in params)
    return False
