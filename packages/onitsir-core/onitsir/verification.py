"""The Verification Gate — ONITSIR's Iron Law (unified).

Ported unchanged in its core discipline from ONITSIR/onitsir/verification.py:
"NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE."

SYNERGY #4 (Give agentosirus's swarm chain real verification via the Iron
Law): adds the `EvidenceProducer` protocol — a pluggable way to turn a raw
result (e.g. an agentosirus chain-step's LLM output) into `Evidence` the
gate can check, ending the old practice of treating any non-empty LLM
response as "done". Concrete producers live in `onitsir/evidence_producers/`.

SYNERGY #14 (context tiering) and #18 (Dux-format research evidence) build
on top of this same EvidenceProducer seam.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Protocol


class VerificationError(Exception):
    """Raised when a completion is claimed without valid evidence."""


@dataclass(frozen=True)
class Evidence:
    """Proof that a phase actually did what it claims.

    - `command`: what was run to prove the claim (e.g. a test command).
    - `output`: the real output produced.
    - `passed`: the objectively-checked pass signal (e.g. exit code == 0).
    - `at`: capture timestamp; the gate rejects stale evidence.
    """
    command: str
    output: str
    passed: bool
    at: float = field(default_factory=time.time)


class VerificationGate:
    """Validates evidence before any completion claim is allowed through.

    `max_age_s` enforces *fresh* evidence — the Iron Law rejects "it passed
    earlier". Set to None to disable the freshness check (not recommended).
    """

    def __init__(self, max_age_s: float | None = 3600.0):
        self.max_age_s = max_age_s

    def check(self, evidence: Evidence | None) -> None:
        """Raise VerificationError unless evidence justifies a success claim."""
        if evidence is None:
            raise VerificationError(
                "Iron Law: cannot claim completion — no verification evidence attached."
            )
        if not evidence.command or not evidence.command.strip():
            raise VerificationError("Iron Law: evidence has no command to prove the claim.")
        if not evidence.passed:
            raise VerificationError(
                "Iron Law: evidence shows the check did NOT pass — completion refused."
            )
        if not evidence.output or not evidence.output.strip():
            raise VerificationError("Iron Law: evidence has no captured output to inspect.")
        if self.max_age_s is not None:
            age = time.time() - evidence.at
            if age > self.max_age_s:
                raise VerificationError(
                    f"Iron Law: evidence is stale ({age:.0f}s old > {self.max_age_s:.0f}s). "
                    "Re-run the verification."
                )

    def is_satisfied(self, evidence: Evidence | None) -> bool:
        try:
            self.check(evidence)
            return True
        except VerificationError:
            return False


class EvidenceProducer(Protocol):
    """SYNERGY #4: pluggable evidence-check abstraction.

    A concrete producer inspects a raw result (a chain-step output, a tool
    call's response, a research-mission markdown doc, ...) and returns
    Evidence the VerificationGate can check. This is the seam that lets
    agentosirus's `handleChain()` results, GitHub/Firecrawl tool-call
    outcomes (#7), and research-mission outputs (#18) all be verified
    through the SAME Iron Law gate instead of each domain reinventing its
    own ad hoc "looks done" heuristic.
    """

    def produce(self, *, command: str, raw_output: str, context: dict) -> Evidence:
        ...
