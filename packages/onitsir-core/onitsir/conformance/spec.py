"""ONITSIR Conformance Standard — the clause registry (SYNERGY #20).

Ported from ADROS/backend/conformance/spec.py's structure (Clause dataclass,
Level enum, CLAUSES registry) and re-targeted at ONITSIR's own governance
surfaces: the Iron Law (VerificationGate) and the Shackle Governor
(decide()). Each clause is exercised by declarative JSON test vectors (see
`conformance/vectors/*.json`) executed through `conformance/runner.py`.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List

SPEC_VERSION = "1.0.0"
STANDARD_NAME = "ONITSIR"


class Level(str, Enum):
    """Conformance levels. An implementation may claim the highest contiguous
    level it fully passes. IRON_LAW is mandatory for any conformance claim."""
    IRON_LAW = "L1_IRON_LAW"           # VerificationGate: no fake success
    GOVERNANCE = "L2_GOVERNANCE"        # Shackle decide(): fail-closed policy
    PROVIDER_CONTRACT = "L3_PROVIDER_CONTRACT"  # agentosirus LLM provider shape


@dataclass(frozen=True)
class Clause:
    id: str
    level: Level
    title: str
    statement: str
    kind: str  # which runner capability the vectors exercise


CLAUSES: List[Clause] = [
    # --- Level 1: Iron Law ---------------------------------------------------
    Clause(
        "IL-1", Level.IRON_LAW,
        "No completion without evidence",
        "An implementation MUST refuse a completion claim when no Evidence is "
        "attached to the phase.",
        "iron_law",
    ),
    Clause(
        "IL-2", Level.IRON_LAW,
        "Failing evidence MUST refuse completion",
        "An implementation MUST refuse a completion claim when the attached "
        "Evidence has passed=False, regardless of how detailed the output is.",
        "iron_law",
    ),
    Clause(
        "IL-3", Level.IRON_LAW,
        "Stale evidence MUST refuse completion",
        "An implementation MUST refuse a completion claim when the attached "
        "Evidence is older than the configured max_age_s freshness window.",
        "iron_law",
    ),
    Clause(
        "IL-4", Level.IRON_LAW,
        "Valid fresh passing evidence MUST be accepted",
        "An implementation MUST accept a completion claim when Evidence is "
        "fresh, has a non-empty command/output, and passed=True.",
        "iron_law",
    ),
    # --- Level 2: Governance ---------------------------------------------------
    Clause(
        "GV-1", Level.GOVERNANCE,
        "Circuit-open state always denies",
        "An implementation MUST return DENY for any call once circuit_tripped "
        "is True, regardless of budget or other state.",
        "governance",
    ),
    Clause(
        "GV-2", Level.GOVERNANCE,
        "Budget exhaustion denies",
        "An implementation MUST return DENY when budget_remaining_usd <= 0 "
        "and budget_usd > 0.",
        "governance",
    ),
    Clause(
        "GV-3", Level.GOVERNANCE,
        "HITL-always mode routes every call to HITL",
        "An implementation MUST return HITL for every call when "
        "hitl_mode == 'always' and no higher-precedence DENY condition fires.",
        "governance",
    ),
    Clause(
        "GV-4", Level.GOVERNANCE,
        "Within-thresholds calls default ALLOW",
        "An implementation MUST return ALLOW when no DENY/HITL condition is "
        "triggered.",
        "governance",
    ),
    # --- Level 3: Provider contract ---------------------------------------
    Clause(
        "PC-1", Level.PROVIDER_CONTRACT,
        "GenerateResult has required fields",
        "An implementation's provider adapter MUST return an object with "
        "non-empty 'text' and 'provider' fields on success.",
        "provider_contract",
    ),
]

CLAUSES_BY_ID: Dict[str, Clause] = {c.id: c for c in CLAUSES}
MANDATORY_LEVEL = Level.IRON_LAW


def clauses_for_level(level: Level) -> List[Clause]:
    return [c for c in CLAUSES if c.level == level]
