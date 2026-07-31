"""Engine.run() / run_async() including HITL timeout (SYNERGY #10)."""
import asyncio

import pytest

from onitsir.engine import Engine
from onitsir.shackle import GovernorConfig
from onitsir.verification import Evidence
from onitsir.workflow import Phase


def _demo_verifier(phase: Phase) -> Evidence:
    return Evidence(command=f"check {phase.value}", output="1 passed", passed=True)


def _failing_verifier(phase: Phase) -> Evidence:
    return Evidence(command=f"check {phase.value}", output="1 failed", passed=False)


async def _async_demo_verifier(phase: Phase) -> Evidence:
    return _demo_verifier(phase)


def test_engine_ships_a_mission_with_passing_evidence(sample_roster):
    engine = Engine(roster=sample_roster, crew_size=2)
    mission = engine.run("build a brand identity kit", verifier=_demo_verifier)
    assert mission.shipped is True
    assert mission.audit_intact is True
    assert len(mission.phase_log) == 6  # 6 phases


def test_engine_blocks_on_failing_evidence(sample_roster):
    engine = Engine(roster=sample_roster, crew_size=2)
    mission = engine.run("build a brand identity kit", verifier=_failing_verifier)
    assert mission.shipped is False
    assert mission.blocked_reason is not None


def test_engine_denies_on_budget_exhaustion(sample_roster):
    # budget_usd=0.0 means decide()'s "budget_remaining_usd <= 0 and
    # budget_usd > 0" branch never triggers (budget_usd must be > 0 for
    # this check), so the very first phase must be allowed but ANY cost
    # deduction with a tiny positive budget guarantees exhaustion on the
    # second phase -- mirroring test_governor_budget_exhaustion_denies above.
    engine = Engine(
        roster=sample_roster, crew_size=2,
        governor_config=GovernorConfig(budget_usd=0.01), phase_cost_usd=0.01,
    )
    mission = engine.run("build a brand identity kit", verifier=_demo_verifier)
    assert mission.shipped is False
    assert "policy DENY" in mission.blocked_reason


def test_engine_preview_crew_does_not_execute(sample_roster):
    engine = Engine(roster=sample_roster, crew_size=2)
    crew = engine.preview_crew("frontend engineering work")
    assert crew


# --- HITL bounded-timeout integration (SYNERGY #10) -------------------------
def test_engine_run_hitl_timeout_resolves_to_denied_mission(sample_roster):
    engine = Engine(
        roster=sample_roster, crew_size=2,
        governor_config=GovernorConfig(budget_usd=10.0, hitl_mode="always", hitl_timeout_s=0.01),
    )
    mission = engine.run("build a brand identity kit", verifier=_demo_verifier, hitl_resolver=None)
    assert mission.shipped is False
    assert mission.hitl_required is True


def test_engine_run_hitl_approved_by_resolver(sample_roster):
    engine = Engine(
        roster=sample_roster, crew_size=2,
        governor_config=GovernorConfig(budget_usd=10.0, hitl_mode="always"),
    )

    def approve_everything(phase: str, reason: str) -> str:
        return "approve"

    mission = engine.run("build a brand identity kit", verifier=_demo_verifier, hitl_resolver=approve_everything)
    assert mission.shipped is True


def test_engine_run_hitl_rejected_by_resolver(sample_roster):
    engine = Engine(
        roster=sample_roster, crew_size=2,
        governor_config=GovernorConfig(budget_usd=10.0, hitl_mode="always"),
    )

    def reject_everything(phase: str, reason: str) -> str:
        return "reject"

    mission = engine.run("build a brand identity kit", verifier=_demo_verifier, hitl_resolver=reject_everything)
    assert mission.shipped is False


# --- async engine (SYNERGY #21 bridge) --------------------------------------
def test_engine_run_async_ships_mission(sample_roster):
    engine = Engine(roster=sample_roster, crew_size=2)
    mission = asyncio.run(engine.run_async("build a brand identity kit", verifier=_async_demo_verifier))
    assert mission.shipped is True


def test_engine_run_async_hitl_timeout(sample_roster):
    engine = Engine(
        roster=sample_roster, crew_size=2,
        governor_config=GovernorConfig(budget_usd=10.0, hitl_mode="always", hitl_timeout_s=0.01),
    )
    mission = asyncio.run(engine.run_async("build a brand identity kit", verifier=_async_demo_verifier))
    assert mission.shipped is False
    assert mission.hitl_required is True
