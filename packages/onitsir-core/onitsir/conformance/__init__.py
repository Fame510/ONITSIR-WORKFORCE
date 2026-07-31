"""SYNERGY #20: Conformance/Certificate framework — ported from
ADROS/backend/conformance/{spec,runner,certificate}.py.

Adapted from ADROS's robot-safety-kernel clauses to ONITSIR's own domain:
proving (with versioned test vectors) that the Iron Law's VerificationGate
truly rejects stale/failing/missing evidence in all cases, and that the
Shackle Governor's decide() surface behaves per its documented precedence.
"""
from .spec import CLAUSES, CLAUSES_BY_ID, Level, SPEC_VERSION, STANDARD_NAME
from .runner import ConformanceRunner, ConformanceReport
from .certificate import issue_certificate, verify_certificate

__all__ = [
    "CLAUSES", "CLAUSES_BY_ID", "Level", "SPEC_VERSION", "STANDARD_NAME",
    "ConformanceRunner", "ConformanceReport",
    "issue_certificate", "verify_certificate",
]
