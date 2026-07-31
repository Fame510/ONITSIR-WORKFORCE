"""ONITSIR (unified) â "On It, Sir." The governed execution core of the
unified ONITSIR + agentosirus product.

Per the unified architecture design (see docs/ARCHITECTURE.md), this Python
package is the governed "brain": it owns the Roster, the Router, the
Governor (Shackle), the Iron Law verification gate, and the phase Workflow
machine â plus the new governance/robotics-inspired modules ported from
ADROS, AgentOmega, SINGULARITY, morphic-kernel and Dux across all 25
synergies (see docs/SYNERGIES.md).

- **The Roster** (`roster.py`): unified specialist workforce, resolving both
  ONITSIR's JSON metadata and agentosirus's markdown persona bodies (#1).
- **The Router** (`router.py`): deterministic goal->crew matching + a
  pre-filter for agentosirus's LLM planner (#2).
- **The Governor / Shackle** (`shackle.py`): fail-closed policy surface,
  fusing ONITSIR + ADROS + AgentOmega's three independent SHACKLE
  implementations into one (#3, #6, #9, #10, #11, #12, #16).
- **The Verification Gate / Iron Law** (`verification.py`): no completion
  without fresh, passing evidence; pluggable EvidenceProducers (#4, #14, #18).
- **The Workflow** (`workflow.py`): intake->spec->plan->build->verify->ship.
- **The Engine** (`engine.py`): now async-capable, HITL-bounded (#10, #21).
- **Swarm** (`swarm/coordinator.py`): multi-mission scheduling (#17).
- **Conformance** (`conformance/`): certificate-issuing test harness (#20).
- **Custody** (`custody/`): SP/1.0-Custody. The enforcement point the
  decision surface previously lacked - a protected tool is unreachable
  without a single-use, argument-bound capability, and only a decision that
  returned `ALLOW` can mint one.
"""
from .roster import Roster, Specialist
from .router import Router, Assignment
from .workflow import Workflow, Phase, PhaseStatus
from .verification import VerificationGate, Evidence, VerificationError, EvidenceProducer
from .shackle import (
    decide, canonical_hash, Governor, GovernorConfig, AuditLedger, LedgerEntry,
    VerdictEnum, DenyReason, HitlMode, classify_reason,
)
from .ethics import EthicsEngine, TAG_WEIGHTS
from .shackle_rules import ShackleValidator
from .cost_model import ACTION_COST_USD, estimate_cost
from .engine import Engine, Mission
from .custody import (
    Capability, CapabilityHolder, CapabilityInvalid, CapabilityRequired,
    CustodyDaemon, CustodyLedger, ProtectedExecutor, PROTECTED_TOOLS, is_protected,
)

__version__ = "1.0.0"
__all__ = [
    "Roster", "Specialist",
    "Router", "Assignment",
    "Workflow", "Phase", "PhaseStatus",
    "VerificationGate", "Evidence", "VerificationError", "EvidenceProducer",
    "decide", "canonical_hash", "Governor", "GovernorConfig",
    "AuditLedger", "LedgerEntry", "VerdictEnum", "DenyReason", "HitlMode", "classify_reason",
    "EthicsEngine", "TAG_WEIGHTS",
    "ShackleValidator",
    "ACTION_COST_USD", "estimate_cost",
    "Engine", "Mission",
    "Capability", "CapabilityHolder", "CapabilityInvalid", "CapabilityRequired",
    "CustodyDaemon", "CustodyLedger", "ProtectedExecutor", "PROTECTED_TOOLS",
    "is_protected",
]
