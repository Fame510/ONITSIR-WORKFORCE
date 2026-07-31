"""SYNERGY #17: GET /api/swarm/status — fleet-wide view of active mission
workers, rendered by agentosirus-web's new `SwarmStatus.tsx` admin panel.
"""
from __future__ import annotations

from fastapi import APIRouter, Request

from onitsir.swarm import AgentDescriptor, SwarmTask

router = APIRouter()


@router.get("/api/swarm/status")
def swarm_status(request: Request):
    coordinator = request.app.state.swarm_coordinator
    return coordinator.status_summary()


@router.post("/api/swarm/register")
def swarm_register(agent_id: str, capabilities: str = "", request: Request = None):
    coordinator = request.app.state.swarm_coordinator
    caps = [c.strip() for c in capabilities.split(",") if c.strip()]
    agent = coordinator.register(AgentDescriptor(agent_id=agent_id, capabilities=caps))
    return {"agent_id": agent.agent_id, "status": agent.status.value}


@router.post("/api/swarm/heartbeat")
def swarm_heartbeat(agent_id: str, request: Request = None):
    coordinator = request.app.state.swarm_coordinator
    ok = coordinator.heartbeat(agent_id)
    return {"ok": ok}
