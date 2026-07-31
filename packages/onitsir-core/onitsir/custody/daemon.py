"""The custody daemon - the only thing that may mint a capability.

The daemon is the join between the decision layer and the enforcement point.
It runs `Governor.evaluate()` and mints a capability if, and only if, the
verdict is `ALLOW`. A `DENY` and a `HITL` both return no token, so a caller
that ignores either of them arrives at the executor empty-handed.

Keeping the mint inside the daemon rather than exposing `CapabilityHolder.mint`
to route code is the whole point. There is one place in the system where a
capability comes into existence, and that place cannot be reached without a
decision.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional

from ..canonical import NonCanonicalInput
from ..shackle import Governor
from .capability_holder import Capability, CapabilityHolder
from .executor import is_protected


@dataclass(frozen=True)
class Authorization:
    """The daemon's answer to "may this call run, and with what token?"."""

    verdict: str
    reason: str
    capability: Optional[Capability] = None

    @property
    def granted(self) -> bool:
        return self.capability is not None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "verdict": self.verdict,
            "reason": self.reason,
            "capability": self.capability.to_dict() if self.capability else None,
        }


class CustodyDaemon:
    """Decision plus custody, in that order, with no way to skip the first."""

    def __init__(self, holder: CapabilityHolder) -> None:
        self.holder = holder

    def authorize(
        self,
        governor: Governor,
        *,
        mission_id: str,
        tool_name: str,
        cost_usd: float = 0.0,
        nonce: Optional[str] = None,
        params: Optional[Mapping[str, Any]] = None,
        tags: Optional[List[str]] = None,
        ttl_s: Optional[float] = None,
    ) -> Authorization:
        args: Dict[str, Any] = dict(params or {})
        verdict, reason = governor.evaluate(
            tool_name, cost_usd=cost_usd, nonce=nonce, params=args, tags=tags or []
        )

        if verdict != "ALLOW":
            # A tripped circuit invalidates capabilities already outstanding
            # for this mission: they were minted under an assumption that no
            # longer holds.
            if governor.circuit_tripped:
                self.holder.revoke_mission(mission_id)
            return Authorization(verdict=verdict, reason=reason)

        if not is_protected(tool_name):
            # Unprotected tools need no capability; returning one would imply
            # a guarantee the executor does not enforce for them.
            return Authorization(verdict=verdict, reason=reason)

        try:
            capability = self.holder.mint(
                mission_id=mission_id,
                tool_name=tool_name,
                nonce=nonce,
                params=args,
                ttl_s=ttl_s,
            )
        except NonCanonicalInput:
            # Unreachable through decide(), which denies non-canonicalizable
            # input at step 1. Handled anyway: a capability that cannot be
            # argument-bound must never be issued.
            return Authorization(
                verdict="DENY", reason="policy_violation:malformed_input"
            )

        return Authorization(verdict=verdict, reason=reason, capability=capability)
