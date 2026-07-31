"""Mission routes — the core of the new governed surface.

SYNERGY #2: GET /api/router/prefilter — deterministic Router shortlist for
  agentosirus's LLM "Lead Swarm Architect" planner.
SYNERGY #8: POST /api/router/route — confidence-scored crew suggestion for
  TeamBuilder's free-text "Suggest a team" box.
SYNERGY #3: POST /api/mission/{id}/gate — wraps Governor.evaluate(); the
  single server-side source of ALLOW/DENY/HITL truth.
SYNERGY #4: POST /api/mission/{id}/verify-step — Iron Law check for one
  agentosirus chain step via ChainStepEvidenceProducer.
SYNERGY #7: POST /api/mission/{id}/evidence — evidence-wrap tool-integration
  side effects (GitHub writes, Firecrawl scrapes) from integrations.ts.
SYNERGY #24: mission state changes are recorded so WS /ws/mission/{id}
  (see main.py) can stream them live to agentosirus's activityBus/MindMap.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from onitsir.engine import Engine, Mission
from onitsir.evidence_producers import ChainStepEvidenceProducer
from onitsir.router import Router
from onitsir.shackle import GovernorConfig, Governor, classify_reason
from onitsir.verification import Evidence

from ..schemas import (
    EvidenceRequest, GateRequest, GateResponse, HitlDecisionRequest,
    MissionStatus, MissionSubmitRequest, PreFilterRequest, RouteRequest,
    VerifyStepRequest, VerifyStepResponse,
)

router = APIRouter()

# In-memory mission registry (a real deployment would back this with Redis/DB;
# kept simple + explicit here since the architecture's contract is the shape
# of the routes, not the persistence layer).
_MISSIONS: Dict[str, Dict[str, Any]] = {}
_EVIDENCE_PRODUCER = ChainStepEvidenceProducer()


def _mission_events(mission_id: str) -> list[dict]:
    return _MISSIONS[mission_id].setdefault("events", [])


def _emit(mission_id: str, event_type: str, payload: dict) -> None:
    """SYNERGY #24: append a mission event; WS handler in main.py polls/streams
    this list to agentosirus-web's activityBus/MindMap."""
    _mission_events(mission_id).append({"type": event_type, **payload})


@router.get("/api/router/prefilter")
def router_prefilter(goal: str, limit: int = 8, request: Request = None):
    """SYNERGY #2."""
    roster = request.app.state.roster
    r = Router(roster)
    try:
        assignments = r.pre_filter(goal, limit=limit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return [a.to_dict() for a in assignments]


@router.post("/api/router/route")
def router_route(body: RouteRequest, request: Request):
    """SYNERGY #8."""
    roster = request.app.state.roster
    r = Router(roster)
    try:
        assignments = r.route(body.goal, crew_size=body.crew_size)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return [a.to_dict() for a in assignments]


@router.post("/api/mission")
def submit_mission(body: MissionSubmitRequest, request: Request):
    roster = request.app.state.roster
    engine = Engine(
        roster=roster,
        crew_size=body.crew_size,
        governor_config=GovernorConfig(budget_usd=body.budget_usd, hitl_mode=body.hitl_mode),
    )
    mission_id = str(uuid.uuid4())
    crew = engine.preview_crew(body.goal)
    governor = Governor(GovernorConfig(budget_usd=body.budget_usd, hitl_mode=body.hitl_mode))
    _MISSIONS[mission_id] = {
        "goal": body.goal,
        "crew": crew,
        "governor": governor,
        "phase_log": [],
        "shipped": False,
        "blocked_reason": None,
        "hitl_required": False,
        "hitl_pending_phase": None,
        "events": [],
    }
    _emit(mission_id, "MISSION_CREATED", {"goal": body.goal, "crew": [a.to_dict() for a in crew]})
    return {"mission_id": mission_id, "crew": [a.to_dict() for a in crew]}


@router.get("/api/mission/{mission_id}")
def get_mission(mission_id: str):
    m = _MISSIONS.get(mission_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Mission not found.")
    return MissionStatus(
        mission_id=mission_id,
        goal=m["goal"],
        crew=[a.to_dict() for a in m["crew"]],
        phase_log=m["phase_log"],
        shipped=m["shipped"],
        blocked_reason=m["blocked_reason"],
        hitl_required=m["hitl_required"],
        hitl_pending_phase=m["hitl_pending_phase"],
        audit_intact=m["governor"].ledger.verify(),
    )


@router.post("/api/mission/{mission_id}/gate", response_model=GateResponse)
def gate_mission_step(mission_id: str, body: GateRequest):
    """SYNERGY #3: agentosirus's onitsirClient.ts calls this before each
    handleChain() step. Server-side decide() is the ONLY governance
    implementation — TypeScript never re-implements this logic (SYNERGY #6)."""
    m = _MISSIONS.get(mission_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Mission not found.")
    governor: Governor = m["governor"]
    verdict, reason = governor.evaluate(
        body.tool_name, cost_usd=body.cost_usd, nonce=body.nonce,
        params=body.params, tags=body.tags,
    )
    if verdict == "HITL":
        governor.request_hitl(body.tool_name, reason)
        m["hitl_required"] = True
        m["hitl_pending_phase"] = body.tool_name
        _emit(mission_id, "HITL_PROMPT", {"tool_name": body.tool_name, "reason": reason})
    else:
        _emit(mission_id, "GOVERNOR_VERDICT", {"tool_name": body.tool_name, "verdict": verdict, "reason": reason})
    return GateResponse(verdict=verdict, reason=reason, deny_reason=classify_reason(reason).value)


@router.post("/api/mission/{mission_id}/hitl")
def hitl_decision(mission_id: str, body: HitlDecisionRequest):
    """SYNERGY #10: operator APPROVE/REJECT/MODIFY, mirroring AgentOmega's
    HITL_RESPONSE WS message."""
    m = _MISSIONS.get(mission_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Mission not found.")
    governor: Governor = m["governor"]
    governor.resolve_hitl(body.decision)
    m["hitl_required"] = False
    m["hitl_pending_phase"] = None
    _emit(mission_id, "HITL_RESPONSE", {"decision": body.decision})
    return {"ok": True, "decision": body.decision}


@router.post("/api/mission/{mission_id}/verify-step", response_model=VerifyStepResponse)
def verify_step(mission_id: str, body: VerifyStepRequest):
    """SYNERGY #4: Iron Law check for one agentosirus chain step."""
    m = _MISSIONS.get(mission_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Mission not found.")
    evidence: Evidence = _EVIDENCE_PRODUCER.produce(
        command=body.command or f"verify-step:{body.agent_id}",
        raw_output=body.output,
        context={"task": body.task, "agent_id": body.agent_id},
    )
    m["phase_log"].append(f"chain-step:{body.agent_id}: {'verified' if evidence.passed else 'FAILED evidence check'}")
    _emit(mission_id, "STEP_VERIFIED", {"agent_id": body.agent_id, "passed": evidence.passed})
    return VerifyStepResponse(passed=evidence.passed, command=evidence.command, output_summary=evidence.output)


@router.post("/api/mission/{mission_id}/evidence")
def post_evidence(mission_id: str, body: EvidenceRequest):
    """SYNERGY #7: evidence-wrap tool-integration side effects (GitHub
    writes, Firecrawl scrapes) — integrations.ts's asEvidence() wrapper
    posts here; Workflow.complete_current() can consume the resulting
    Evidence directly."""
    m = _MISSIONS.get(mission_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Mission not found.")
    evidence = Evidence(command=body.command, output=body.output, passed=body.passed)
    m["phase_log"].append(f"tool-evidence:{body.tool_name}: {'passed' if evidence.passed else 'FAILED'}")
    _emit(mission_id, "TOOL_EVIDENCE", {"tool_name": body.tool_name, "passed": evidence.passed})
    return {"ok": True, "passed": evidence.passed}


@router.get("/api/mission/{mission_id}/events")
def get_mission_events(mission_id: str, since: int = 0):
    """SYNERGY #24: polling fallback for environments without WS support;
    the real-time path is WS /ws/mission/{id} in main.py."""
    m = _MISSIONS.get(mission_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Mission not found.")
    events = _mission_events(mission_id)
    return {"events": events[since:], "next_since": len(events)}
