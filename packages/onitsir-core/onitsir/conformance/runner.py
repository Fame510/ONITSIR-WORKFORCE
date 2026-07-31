"""Conformance runner (SYNERGY #20) — execute the standard's vectors.

Ported from ADROS/backend/conformance/runner.py's structure (VectorResult /
ClauseResult / ConformanceReport / ConformanceRunner), re-targeted at
ONITSIR's Iron Law (`VerificationGate`) and Governor (`decide()`) instead of
ADROS's safety kernel/embodiment/swarm surfaces.

A clause passes iff EVERY vector bound to it passes. An implementation is
CONFORMANT at a level iff every clause at that level (and all lower levels)
passes.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..shackle import decide
from ..verification import Evidence, VerificationGate
from .spec import (
    CLAUSES, CLAUSES_BY_ID, MANDATORY_LEVEL, SPEC_VERSION, STANDARD_NAME,
    Level, clauses_for_level,
)

VECTORS_DIR = os.path.join(os.path.dirname(__file__), "vectors")


@dataclass
class VectorResult:
    vector_id: str
    clause: str
    kind: str
    passed: bool
    detail: str = ""


@dataclass
class ClauseResult:
    clause: str
    level: str
    title: str
    passed: bool
    vector_ids: List[str] = field(default_factory=list)
    failures: List[str] = field(default_factory=list)


@dataclass
class ConformanceReport:
    implementation: str
    implementation_version: str
    standard: str = STANDARD_NAME
    spec_version: str = SPEC_VERSION
    verdict: str = "NON_CONFORMANT"
    highest_level: Optional[str] = None
    total_vectors: int = 0
    passed_vectors: int = 0
    clause_results: List[ClauseResult] = field(default_factory=list)
    vector_results: List[VectorResult] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)

    def summary_line(self) -> str:
        return (f"{self.standard} {self.spec_version} :: {self.implementation} "
                f"v{self.implementation_version} -> {self.verdict} "
                f"({self.passed_vectors}/{self.total_vectors} vectors, "
                f"highest level: {self.highest_level})")

    def as_dict(self) -> Dict[str, Any]:
        return {
            "standard": self.standard,
            "spec_version": self.spec_version,
            "implementation": self.implementation,
            "implementation_version": self.implementation_version,
            "verdict": self.verdict,
            "highest_level": self.highest_level,
            "total_vectors": self.total_vectors,
            "passed_vectors": self.passed_vectors,
            "clause_results": [c.__dict__ for c in self.clause_results],
            "timestamp": self.timestamp,
        }


def load_vectors() -> List[Dict[str, Any]]:
    vectors: List[Dict[str, Any]] = []
    for fn in sorted(os.listdir(VECTORS_DIR)):
        if not fn.endswith(".json"):
            continue
        with open(os.path.join(VECTORS_DIR, fn), "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, list):
            raise ValueError(f"vector file {fn} must contain a JSON list")
        vectors.extend(data)
    return vectors


def _run_iron_law(inp: Dict[str, Any], expect: Dict[str, Any]):
    gate = VerificationGate(max_age_s=inp.get("max_age_s", 3600.0))
    evidence = None
    if inp.get("has_evidence", True):
        at = time.time() - inp.get("age_s", 0.0)
        evidence = Evidence(
            command=inp.get("command", "test"),
            output=inp.get("output", "ok"),
            passed=inp.get("passed", True),
            at=at,
        )
    ok_expected = expect.get("accepted", True)
    accepted = gate.is_satisfied(evidence)
    return accepted == ok_expected, f"accepted={accepted}"


def _run_governance(inp: Dict[str, Any], expect: Dict[str, Any]):
    config = inp.get("config", {})
    state = inp.get("state", {})
    call = inp.get("call", {})
    verdict, reason = decide(config, state, call)
    ok = True
    bits = [f"verdict={verdict}", f"reason={reason}"]
    if "verdict" in expect:
        ok = ok and verdict == expect["verdict"]
    return ok, "; ".join(bits)


def _run_provider_contract(inp: Dict[str, Any], expect: Dict[str, Any]):
    result = inp.get("result", {})
    ok = bool(result.get("text")) and bool(result.get("provider"))
    if "should_pass" in expect:
        ok = ok == bool(expect["should_pass"])
    return ok, f"result={result}"


_RUNNERS = {
    "iron_law": _run_iron_law,
    "governance": _run_governance,
    "provider_contract": _run_provider_contract,
}


class ConformanceRunner:
    def __init__(self, implementation: str = "onitsir-core", implementation_version: str = "1.0.0") -> None:
        self.implementation = implementation
        self.implementation_version = implementation_version

    def run(self) -> ConformanceReport:
        vectors = load_vectors()
        vector_results: List[VectorResult] = []
        by_clause: Dict[str, List[VectorResult]] = {c.id: [] for c in CLAUSES}

        for vec in vectors:
            clause_id = vec["clause"]
            if clause_id not in CLAUSES_BY_ID:
                raise ValueError(f"vector {vec.get('id')} references unknown clause {clause_id}")
            kind = CLAUSES_BY_ID[clause_id].kind
            runner = _RUNNERS[kind]
            try:
                ok, detail = runner(vec.get("input", {}), vec.get("expect", {}))
            except Exception as exc:  # noqa: BLE001 - a crash IS a conformance failure
                ok, detail = False, f"runner raised {type(exc).__name__}: {exc}"
            vr = VectorResult(vector_id=vec["id"], clause=clause_id, kind=kind, passed=ok, detail=detail)
            vector_results.append(vr)
            by_clause[clause_id].append(vr)

        clause_results: List[ClauseResult] = []
        for clause in CLAUSES:
            vrs = by_clause[clause.id]
            passed = len(vrs) > 0 and all(v.passed for v in vrs)
            clause_results.append(ClauseResult(
                clause=clause.id, level=clause.level.value, title=clause.title, passed=passed,
                vector_ids=[v.vector_id for v in vrs],
                failures=[f"{v.vector_id}: {v.detail}" for v in vrs if not v.passed]
                or ([] if vrs else ["no vectors bound to clause"]),
            ))

        highest = self._highest_level(clause_results)
        mandatory_ok = all(cr.passed for cr in clause_results if cr.level == MANDATORY_LEVEL.value)
        verdict = "CONFORMANT" if mandatory_ok and highest is not None else "NON_CONFORMANT"

        return ConformanceReport(
            implementation=self.implementation,
            implementation_version=self.implementation_version,
            verdict=verdict,
            highest_level=highest,
            total_vectors=len(vector_results),
            passed_vectors=sum(1 for v in vector_results if v.passed),
            clause_results=clause_results,
            vector_results=vector_results,
        )

    @staticmethod
    def _highest_level(clause_results: List[ClauseResult]) -> Optional[str]:
        passed_ids = {cr.clause for cr in clause_results if cr.passed}
        ordered = [Level.IRON_LAW, Level.GOVERNANCE, Level.PROVIDER_CONTRACT]
        highest: Optional[str] = None
        for level in ordered:
            level_clauses = clauses_for_level(level)
            if level_clauses and all(c.id in passed_ids for c in level_clauses):
                highest = level.value
            else:
                break
        return highest
