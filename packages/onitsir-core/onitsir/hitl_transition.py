"""HITL transition binding (SP/1.0 hardening).

`decide()` step 4 used to read one field off the pending transition record:

    if pending.get("decision") == "approve": return ("ALLOW", ...)

which meant a single operator approval authorised *every* subsequent call, for
any tool, with any arguments, until something cleared the record. The gap was
published as a known limitation in `docs/SHACKLE.md` §3: "An approval is
therefore bound to the pending transition record, not cryptographically bound
to a specific set of arguments."

This module closes that gap. An approval now applies to exactly one call:
same tool name, same nonce, same canonical argument digest. Anything else is
refused as `policy_violation:hitl_binding_mismatch` rather than honoured.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional, Tuple

from .canonical import NonCanonicalInput, canonical_hash

__all__ = [
    "HitlTransitionCheck",
    "BINDING_FIELDS",
    "validate_hitl_transition",
]

#: Fields a pending transition must carry for an approval to be honoured.
BINDING_FIELDS: Tuple[str, ...] = ("tool_name", "nonce", "args_digest")

_TERMINAL = {
    "approve": ("ALLOW", "hitl_transition:approve"),
    "reject": ("DENY", "hitl_transition:reject"),
    "modify": ("ALLOW", "hitl_transition:modify_successor"),
}
_PAUSING = {
    "defer": ("HITL", "hitl_transition:defer_escalate"),
    "escalate": ("HITL", "hitl_transition:defer_escalate"),
}


@dataclass(frozen=True)
class HitlTransitionCheck:
    """Outcome of evaluating a pending transition against the current call.

    - `matched is False` means step 4 does not apply and `decide()` must carry
      on to step 5. `verdict`/`reason` are `None`.
    - `matched is True` means step 4 is authoritative and `decide()` returns
      `(verdict, reason)` immediately.
    """
    matched: bool
    verdict: Optional[str] = None
    reason: Optional[str] = None
    bound: bool = False

    def as_tuple(self) -> Optional[Tuple[str, str]]:
        if not self.matched:
            return None
        return (str(self.verdict), str(self.reason))


def _digest_of(params: Any) -> Optional[str]:
    try:
        return canonical_hash(params if isinstance(params, Mapping) else {})
    except NonCanonicalInput:
        return None


def _binding_matches(pending: Mapping[str, Any], call: Mapping[str, Any]) -> bool:
    """Every binding field must be present on the record and equal to the call.

    A record missing any binding field is treated as unbound and therefore
    non-matching. Fail-closed: a legacy record cannot silently authorise a call
    it was never issued for.
    """
    for field in BINDING_FIELDS:
        if field not in pending:
            return False
    if pending.get("tool_name") != call.get("tool_name"):
        return False
    if pending.get("nonce") != call.get("nonce"):
        return False
    expected = _digest_of(call.get("params") or {})
    if expected is None:
        return False
    return pending.get("args_digest") == expected


def validate_hitl_transition(
    pending: Optional[Dict[str, Any]],
    call: Optional[Dict[str, Any]],
) -> HitlTransitionCheck:
    """Evaluate `decide()` step 4 with full nonce + argument-digest binding."""
    if not pending or not isinstance(pending, Mapping):
        return HitlTransitionCheck(matched=False)

    decision = pending.get("decision")
    if decision is None:
        # Awaiting an operator. Step 4 does not apply; later steps decide.
        return HitlTransitionCheck(matched=False)

    call = call or {}
    if not _binding_matches(pending, call):
        return HitlTransitionCheck(
            matched=True,
            verdict="DENY",
            reason="policy_violation:hitl_binding_mismatch",
            bound=False,
        )

    if decision in _TERMINAL:
        verdict, reason = _TERMINAL[decision]
        return HitlTransitionCheck(matched=True, verdict=verdict, reason=reason, bound=True)

    if decision in _PAUSING:
        verdict, reason = _PAUSING[decision]
        return HitlTransitionCheck(matched=True, verdict=verdict, reason=reason, bound=True)

    # An unrecognised decision string is not an approval.
    return HitlTransitionCheck(
        matched=True,
        verdict="DENY",
        reason="policy_violation:hitl_unknown_decision",
        bound=True,
    )
