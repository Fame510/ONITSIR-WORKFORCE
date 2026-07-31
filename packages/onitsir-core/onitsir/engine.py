"""The Engine — where the systems fuse into one product (unified).

Ported from ONITSIR/onitsir/engine.py and extended per the architecture doc
section 2.1: "The Engine becomes an async, server-hosted engine ... its
verifier callable is now satisfied by round-tripping to the TypeScript
execution surface over the RPC bridge."

SYNERGY #10 (bounded-timeout HITL): when the Governor rules HITL, `run()` now
actually WAITS (bounded by `governor_config.hitl_timeout_s`) for an operator
resolution via `governor.resolve_hitl()` instead of immediately returning a
paused Mission with no resume path. On timeout, the call always resolves to
safe DENY (ported from AgentOmega's `_await_hitl()`).

Both a synchronous `run()` (backward-compatible with ONITSIR's original CLI
and demo verifier) and an async `run_async()` (used by onitsir-server, whose
verifier bridges to agentosirus-web over a Transport — SYNERGY #21) are
provided.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Optional, Union

from .roster import Roster
from .router import Assignment, Router
from .shackle import Governor, GovernorConfig
from .verification import Evidence, VerificationError, VerificationGate
from .workflow import Phase, Workflow

Verifier = Callable[[Phase], Evidence]
AsyncVerifier = Callable[[Phase], Awaitable[Evidence]]


@dataclass
class Mission:
    goal: str
    crew: list[Assignment] = field(default_factory=list)
    phase_log: list[str] = field(default_factory=list)
    shipped: bool = False
    blocked_reason: str | None = None
    hitl_required: bool = False
    hitl_pending_phase: str | None = None
    governor: Governor | None = None

    @property
    def crew_names(self) -> list[str]:
        return [a.specialist.name for a in self.crew]

    @property
    def audit_intact(self) -> bool:
        """True iff the governance audit ledger has not been tampered with."""
        return self.governor is None or self.governor.ledger.verify()


class Engine:
    def __init__(
        self,
        roster: Roster | None = None,
        gate: VerificationGate | None = None,
        crew_size: int = 3,
        governor_config: GovernorConfig | None = None,
        phase_cost_usd: float = 0.0,
    ):
        self._roster = roster or Roster.load()
        self._router = Router(self._roster)
        self._gate = gate or VerificationGate()
        self._crew_size = crew_size
        self._governor_config = governor_config
        self._phase_cost_usd = phase_cost_usd

    def _new_mission_state(self, goal: str) -> tuple[Mission, Governor, Workflow]:
        mission = Mission(goal=goal)
        mission.crew = self._router.route(goal, crew_size=self._crew_size)
        governor = Governor(self._governor_config)
        mission.governor = governor
        workflow = Workflow(gate=self._gate)
        return mission, governor, workflow

    def run(
        self,
        goal: str,
        verifier: Verifier,
        hitl_resolver: Optional[Callable[[str, str], str]] = None,
    ) -> Mission:
        """Run a full mission synchronously. Never claims 'shipped' without
        (a) Shackle allowing each phase to start and (b) the Iron Law passing
        its evidence.

        SYNERGY #10: when Shackle rules HITL, `hitl_resolver(phase, reason)`
        (if provided) is called to obtain an operator decision
        ("approve"/"reject"/anything else -> reject). If no resolver is
        given, or the resolver itself signals "timeout", the call resolves
        to safe DENY exactly like `governor.hitl_timeout()` — the engine can
        never silently "just stop" with no resume path.
        """
        mission, governor, workflow = self._new_mission_state(goal)

        while not workflow.shipped:
            phase = workflow.current

            verdict, reason = governor.evaluate(
                f"phase:{phase.value}", cost_usd=self._phase_cost_usd
            )

            if verdict == "HITL":
                mission.hitl_required = True
                mission.hitl_pending_phase = phase.value
                # The pending record is bound to this phase and to the empty
                # argument set the phase gate was evaluated with, so an operator
                # answer cannot be read as an answer about a different phase.
                governor.request_hitl(
                    f"phase:{phase.value}", reason,
                    nonce=f"{mission.goal}:{phase.value}", params={},
                )
                decision = hitl_resolver(phase.value, reason) if hitl_resolver else "timeout"
                if decision == "approve":
                    governor.resolve_hitl("approve")
                    verdict, reason = "ALLOW", "hitl_transition:approve"
                elif decision == "timeout":
                    verdict, reason = governor.hitl_timeout()
                else:
                    governor.resolve_hitl("reject")
                    verdict, reason = "DENY", "hitl_transition:reject"
                # The engine consumes the operator's answer here rather than
                # routing it back through decide(), so it must retire the
                # record itself. Leaving it in place would carry a phase-scoped
                # approval into the NEXT phase, where it no longer matches the
                # binding and would be refused as a mismatch.
                governor.clear_hitl()

            if verdict == "DENY":
                mission.blocked_reason = f"{phase.value}: policy DENY — {reason}"
                mission.phase_log.append(f"{phase.value}: BLOCKED (policy) — {reason}")
                mission.shipped = False
                return mission

            evidence = verifier(phase)
            try:
                workflow.complete_current(evidence)
                mission.phase_log.append(f"{phase.value}: verified")
            except VerificationError as e:
                mission.blocked_reason = f"{phase.value}: {e}"
                mission.phase_log.append(f"{phase.value}: BLOCKED — {e}")
                mission.shipped = False
                return mission

        mission.shipped = True
        return mission

    async def run_async(
        self,
        goal: str,
        verifier: AsyncVerifier,
        hitl_resolver: Optional[Callable[[str, str], Awaitable[str]]] = None,
    ) -> Mission:
        """SYNERGY #21: async counterpart of `run()`, for `onitsir-server`.

        `verifier` is the async bridge function described in architecture
        doc section 2.3 item 4 — it round-trips to agentosirus-web (via a
        Transport, e.g. LoopbackTransport or HttpBridge) to actually execute
        the phase's work, then runs it through an EvidenceProducer, and
        returns Evidence back into this Workflow.
        """
        mission, governor, workflow = self._new_mission_state(goal)

        while not workflow.shipped:
            phase = workflow.current

            verdict, reason = governor.evaluate(
                f"phase:{phase.value}", cost_usd=self._phase_cost_usd
            )

            if verdict == "HITL":
                mission.hitl_required = True
                mission.hitl_pending_phase = phase.value
                governor.request_hitl(
                    f"phase:{phase.value}", reason,
                    nonce=f"{mission.goal}:{phase.value}", params={},
                )
                if hitl_resolver is not None:
                    decision = await hitl_resolver(phase.value, reason)
                else:
                    decision = "timeout"
                if decision == "approve":
                    governor.resolve_hitl("approve")
                    verdict, reason = "ALLOW", "hitl_transition:approve"
                elif decision == "timeout":
                    verdict, reason = governor.hitl_timeout()
                else:
                    governor.resolve_hitl("reject")
                    verdict, reason = "DENY", "hitl_transition:reject"
                # See run(): the answer is consumed here, so the record is
                # retired here. A phase-scoped approval must not survive into
                # the next phase.
                governor.clear_hitl()

            if verdict == "DENY":
                mission.blocked_reason = f"{phase.value}: policy DENY — {reason}"
                mission.phase_log.append(f"{phase.value}: BLOCKED (policy) — {reason}")
                mission.shipped = False
                return mission

            evidence = await verifier(phase)
            try:
                workflow.complete_current(evidence)
                mission.phase_log.append(f"{phase.value}: verified")
            except VerificationError as e:
                mission.blocked_reason = f"{phase.value}: {e}"
                mission.phase_log.append(f"{phase.value}: BLOCKED — {e}")
                mission.shipped = False
                return mission

        mission.shipped = True
        return mission

    def preview_crew(self, goal: str) -> list[Assignment]:
        """Route only — show who would be staffed, no execution."""
        return self._router.route(goal, crew_size=self._crew_size)
