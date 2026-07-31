"""SYNERGY #10: dedicated HITL status route, complementing the
POST /api/mission/{id}/hitl decision endpoint in mission.py.
Rendered by agentosirus-web's `HitlPrompt.tsx`."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .mission import _MISSIONS

router = APIRouter()


@router.get("/api/mission/{mission_id}/hitl")
def get_hitl_status(mission_id: str):
    m = _MISSIONS.get(mission_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Mission not found.")
    governor = m["governor"]
    pending = governor._pending_hitl
    return {
        "mission_id": mission_id,
        "hitl_required": m["hitl_required"],
        "pending_phase": m["hitl_pending_phase"],
        "pending": pending,
        "timeout_s": governor.config.hitl_timeout_s,
    }
