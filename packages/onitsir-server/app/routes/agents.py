"""SYNERGY #5: server-side implementation of GET /api/agents and
GET /api/agents/:category/:id, mirroring agentosirus's original route shape.

SYNERGY #1: `load_content()` resolves the agentosirus markdown persona body
for a specialist when available, falling back to the short ONITSIR
description otherwise — the roster is now a single unified source.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()


@router.get("/api/agents")
def list_agents(request: Request):
    roster = request.app.state.roster
    return [
        {
            "id": s.id, "name": s.name, "category": s.category,
            "description": s.description, "color": "indigo", "emoji": "\U0001F916",
            "vibe": "", "filePath": s.persona_path or "",
        }
        for s in roster.all()
    ]


@router.get("/api/agents/{category}/{agent_id}")
def get_agent(category: str, agent_id: str, request: Request):
    roster = request.app.state.roster
    try:
        specialist = roster.get(agent_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Agent not found.")
    if specialist.category != category:
        raise HTTPException(status_code=404, detail="Agent not found.")
    content = specialist.load_content()
    return {
        "id": specialist.id, "name": specialist.name, "category": specialist.category,
        "description": specialist.description, "color": "indigo", "emoji": "\U0001F916",
        "vibe": "", "filePath": specialist.persona_path or "", "content": content,
    }
