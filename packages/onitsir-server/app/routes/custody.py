"""SP/1.0-Custody routes: server-side capability mediation.

Two routes, and the order between them is the whole point.

    POST /api/mission/{id}/authorize   decision, and a token if ALLOWed
    POST /api/mission/{id}/execute     runs the tool, redeeming that token

`/gate` (in `mission.py`) still exists and still returns a verdict. It is
advisory: a caller can ignore it. `/execute` is not advisory. For any tool in
`onitsir.custody.PROTECTED_TOOLS` it redeems a capability before the tool
implementation is looked up, so a caller that skipped `/authorize`, or that
was refused by it, has nothing to present and receives `403`.

That is the difference between a decided constraint and an enforced one, and
it is what `docs/ROADMAP.md` item 1 asked for.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from onitsir.custody import (
    CapabilityInvalid,
    CapabilityRequired,
    UnknownTool,
    is_protected,
)
from onitsir.shackle import classify_reason

from ..schemas import (
    AuthorizeRequest,
    AuthorizeResponse,
    CapabilityModel,
    ExecuteRequest,
    ExecuteResponse,
)
from .mission import _MISSIONS, _emit

router = APIRouter()


def _mission_or_404(mission_id: str) -> dict:
    m = _MISSIONS.get(mission_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Mission not found.")
    return m


@router.post("/api/mission/{mission_id}/authorize", response_model=AuthorizeResponse)
def authorize(mission_id: str, body: AuthorizeRequest, request: Request):
    """Decide, and mint a capability only for an ALLOWed protected tool.

    A `DENY` or a `HITL` returns no capability. There is no query parameter,
    header or body field that changes that, because the mint lives inside
    `CustodyDaemon.authorize()` and is reached only through a verdict.
    """
    m = _mission_or_404(mission_id)
    daemon = request.app.state.custody_daemon
    auth = daemon.authorize(
        m["governor"],
        mission_id=mission_id,
        tool_name=body.tool_name,
        cost_usd=body.cost_usd,
        nonce=body.nonce,
        params=body.params,
        tags=body.tags,
        ttl_s=body.ttl_s,
    )

    if auth.verdict == "HITL":
        m["hitl_required"] = True
        m["hitl_pending_phase"] = body.tool_name
        _emit(mission_id, "HITL_PROMPT", {"tool_name": body.tool_name, "reason": auth.reason})
    else:
        _emit(
            mission_id,
            "GOVERNOR_VERDICT",
            {"tool_name": body.tool_name, "verdict": auth.verdict, "reason": auth.reason},
        )

    if auth.granted:
        _emit(
            mission_id,
            "CAPABILITY_MINTED",
            {"tool_name": body.tool_name, "token_id": auth.capability.token_id},
        )

    return AuthorizeResponse(
        verdict=auth.verdict,
        reason=auth.reason,
        deny_reason=classify_reason(auth.reason).value,
        protected=is_protected(body.tool_name),
        capability=CapabilityModel(**auth.capability.to_dict()) if auth.capability else None,
    )


@router.post("/api/mission/{mission_id}/execute", response_model=ExecuteResponse)
def execute(mission_id: str, body: ExecuteRequest, request: Request):
    """Run a tool. Protected tools redeem a capability first, or get 403.

    Every refusal is raised out of the capability holder before the tool
    implementation is looked up, so a refused call cannot have run and then
    been reported as refused.
    """
    _mission_or_404(mission_id)
    executor = request.app.state.protected_executor

    try:
        result = executor.execute(
            body.tool_name,
            mission_id=mission_id,
            capability_token=body.capability_token,
            nonce=body.nonce,
            params=body.params,
        )
    except CapabilityRequired:
        _emit(
            mission_id,
            "CAPABILITY_REFUSED",
            {"tool_name": body.tool_name, "reason": "missing"},
        )
        raise HTTPException(
            status_code=403,
            detail={
                "ok": False,
                "tool_name": body.tool_name,
                "reason": "missing",
                "detail": (
                    f"{body.tool_name} is a protected tool. Obtain a capability from "
                    f"POST /api/mission/{mission_id}/authorize first."
                ),
            },
        )
    except CapabilityInvalid as exc:
        _emit(
            mission_id,
            "CAPABILITY_REFUSED",
            {"tool_name": body.tool_name, "reason": exc.reason},
        )
        raise HTTPException(
            status_code=403,
            detail={
                "ok": False,
                "tool_name": body.tool_name,
                "reason": exc.reason,
                "detail": exc.detail,
            },
        )
    except UnknownTool:
        raise HTTPException(
            status_code=404, detail=f"No implementation registered for {body.tool_name}."
        )

    _emit(mission_id, "TOOL_EXECUTED", {"tool_name": body.tool_name})
    return ExecuteResponse(ok=True, tool_name=body.tool_name, result=result)


@router.get("/api/mission/{mission_id}/custody")
def custody_log(mission_id: str, request: Request):
    """The custody chain for one mission: minted, spent and refused.

    Distinct from `/api/audit/{id}`, which records decisions. This records
    capability lifecycle, which is what answers "did anything execute without
    passing through the gate".
    """
    _mission_or_404(mission_id)
    holder = request.app.state.capability_holder
    return {
        "mission_id": mission_id,
        "entries": [e.to_dict() for e in holder.ledger.entries(mission_id)],
        "intact": holder.ledger.verify(),
        "live_capabilities": holder.live_count(),
    }
