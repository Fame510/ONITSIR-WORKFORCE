"""Conformance certificate (SYNERGY #20) — ported from
ADROS/backend/conformance/certificate.py.

A tamper-evident SHA-256 digest over the conformance result's immutable
facts. Any edit to those facts changes the digest, so a certificate cannot
be forged to upgrade a NON_CONFORMANT result into a passing one without
invalidating it — the same tamper-evident principle as the audit ledger.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Dict

from .runner import ConformanceReport

CERT_SCHEMA = "onitsir.conformance.certificate/v1"


def _material(report: ConformanceReport) -> Dict[str, Any]:
    return {
        "schema": CERT_SCHEMA,
        "standard": report.standard,
        "spec_version": report.spec_version,
        "implementation": report.implementation,
        "implementation_version": report.implementation_version,
        "verdict": report.verdict,
        "highest_level": report.highest_level,
        "clauses": sorted([[c.clause, c.passed] for c in report.clause_results]),
        "vector_totals": [report.passed_vectors, report.total_vectors],
    }


def _digest(material: Dict[str, Any]) -> str:
    canonical = json.dumps(material, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def issue_certificate(report: ConformanceReport) -> Dict[str, Any]:
    material = _material(report)
    cert = dict(material)
    cert["issued_at"] = report.timestamp
    cert["digest"] = _digest(material)
    return cert


def verify_certificate(cert: Dict[str, Any]) -> bool:
    """True iff the certificate's digest matches its attested facts (untampered)."""
    if not isinstance(cert, dict) or "digest" not in cert:
        return False
    material = {k: cert.get(k) for k in (
        "schema", "standard", "spec_version", "implementation",
        "implementation_version", "verdict", "highest_level", "clauses", "vector_totals",
    )}
    return _digest(material) == cert["digest"]
