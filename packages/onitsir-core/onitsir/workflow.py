"""The Workflow Machine — ONITSIR's mission phases (unified, unchanged).

Ported unchanged from ONITSIR/onitsir/workflow.py. Every mission — including
ones whose actual work (chat, tool calls, browser automation) happens in the
TypeScript agentosirus-web process — is driven through this same phase
machine:

    INTAKE -> SPEC -> PLAN -> BUILD -> VERIFY -> SHIP

Rules enforced here:
- Phases advance in order; you cannot skip ahead.
- A phase can only be completed with verification evidence that satisfies the
  Iron Law gate.
- The mission is only SHIPPED when every phase before it has been verified.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from .verification import Evidence, VerificationGate, VerificationError


class Phase(Enum):
    INTAKE = "intake"
    SPEC = "spec"
    PLAN = "plan"
    BUILD = "build"
    VERIFY = "verify"
    SHIP = "ship"

    @classmethod
    def ordered(cls) -> list["Phase"]:
        return [cls.INTAKE, cls.SPEC, cls.PLAN, cls.BUILD, cls.VERIFY, cls.SHIP]


class PhaseStatus(Enum):
    PENDING = "pending"
    ACTIVE = "active"
    VERIFIED = "verified"


@dataclass
class PhaseRecord:
    phase: Phase
    status: PhaseStatus = PhaseStatus.PENDING
    evidence: Evidence | None = None
    notes: str = ""


class Workflow:
    """Drives a mission through the ordered phases under the Iron Law gate."""

    def __init__(self, gate: VerificationGate | None = None):
        self._gate = gate or VerificationGate()
        self._order = Phase.ordered()
        self._records: dict[Phase, PhaseRecord] = {
            p: PhaseRecord(phase=p) for p in self._order
        }
        self._index = 0
        self._records[self._order[0]].status = PhaseStatus.ACTIVE

    @property
    def current(self) -> Phase:
        return self._order[self._index]

    @property
    def shipped(self) -> bool:
        return self._records[Phase.SHIP].status == PhaseStatus.VERIFIED

    def record(self, phase: Phase) -> PhaseRecord:
        return self._records[phase]

    def complete_current(self, evidence: Evidence, notes: str = "") -> Phase:
        """Verify+complete the current phase and advance. Returns the new current phase.

        Refuses (VerificationError) if the evidence fails the Iron Law gate — the
        phase stays ACTIVE and the workflow does not advance.
        """
        phase = self.current
        self._gate.check(evidence)  # raises VerificationError if not satisfied
        rec = self._records[phase]
        rec.status = PhaseStatus.VERIFIED
        rec.evidence = evidence
        rec.notes = notes
        if self._index < len(self._order) - 1:
            self._index += 1
            self._records[self.current].status = PhaseStatus.ACTIVE
        return self.current

    def progress(self) -> dict[str, str]:
        """A status snapshot: phase -> status."""
        return {p.value: self._records[p].status.value for p in self._order}

    def verified_count(self) -> int:
        return sum(
            1 for r in self._records.values() if r.status == PhaseStatus.VERIFIED
        )
