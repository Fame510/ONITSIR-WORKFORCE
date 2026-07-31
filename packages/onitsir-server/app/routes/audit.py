"""SYNERGY #9/#24: audit ledger endpoints, mirroring AgentOmega's audit
endpoints (`GET /api/audit/:mission_id`, `GET /api/audit/:mission_id/verify`).
Rendered by agentosirus-web's `AuditLedgerView.tsx`.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .mission import _MISSIONS

router = APIRouter()


@router.get("/api/audit/{mission_id}")
def get_audit(mission_id: str):
    m = _MISSIONS.get(mission_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Mission not found.")
    ledger = m["governor"].ledger
    return {
        "mission_id": mission_id,
        "entries": [
            {
                "index": e.index, "at": e.at, "tool_name": e.tool_name,
                "verdict": e.verdict, "reason": e.reason,
                "prev_hash": e.prev_hash, "entry_hash": e.entry_hash,
                "signed": bool(e.signature),
            }
            for e in ledger.entries
        ],
        "head": ledger.head,
    }


@router.get("/api/audit/{mission_id}/verify")
def verify_audit(mission_id: str):
    m = _MISSIONS.get(mission_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Mission not found.")
    ledger = m["governor"].ledger
    return {"mission_id": mission_id, "intact": ledger.verify(), "length": len(ledger)}
