"""SYNERGY #17: swarm registry and fleet status routes.

`GET /api/swarm/status` gives the fleet-wide view rendered by
agentosirus-web's `SwarmStatus.tsx` admin panel. The register and heartbeat
routes take validated JSON bodies; they previously accepted raw query
parameters, which bypassed validation and produced no useful OpenAPI schema.

Note that none of these routes are authenticated. Any caller that can reach
the port can register a worker or send a heartbeat on another worker's behalf.
See SECURITY.md and docs/ROADMAP.md item 4.
"""
from __future__ import annotations

from fastapi import APIRouter, Request

from onitsir.swarm import AgentDescriptor

from ..schemas import (
    SwarmHeartbeatRequest,
    SwarmHeartbeatResponse,
    SwarmRegisterRequest,
    SwarmRegisterResponse,
)

router = APIRouter()


@router.get("/api/swarm/status")
def swarm_status(request: Request) -> dict:
    """Return total agent count, a breakdown by liveness status, and the
    number of active assignments.

    Liveness is recomputed on read from each worker's last heartbeat, so a
    worker that stopped reporting is reflected here without any background
    task.
    """
    coordinator = request.app.state.swarm_coordinator
    return coordinator.status_summary()


@router.post("/api/swarm/register", response_model=SwarmRegisterResponse)
def swarm_register(body: SwarmRegisterRequest, request: Request) -> SwarmRegisterResponse:
    """Register a mission worker, or re-register an existing one.

    Registering an `agent_id` that already exists replaces the descriptor and
    resets its heartbeat, which is the intended way for a restarted worker to
    rejoin.
    """
    coordinator = request.app.state.swarm_coordinator
    agent = coordinator.register(
        AgentDescriptor(
            agent_id=body.agent_id,
            capabilities=list(body.capabilities),
            x=body.x,
            y=body.y,
        )
    )
    return SwarmRegisterResponse(
        agent_id=agent.agent_id,
        status=agent.status.value,
        capabilities=list(agent.capabilities),
    )


@router.post("/api/swarm/heartbeat", response_model=SwarmHeartbeatResponse)
def swarm_heartbeat(body: SwarmHeartbeatRequest, request: Request) -> SwarmHeartbeatResponse:
    """Refresh a worker's liveness timestamp.

    Returns `ok: false` rather than raising when the `agent_id` is unknown, so
    that a worker whose registration was lost on a server restart can detect
    the condition and re-register instead of failing.
    """
    coordinator = request.app.state.swarm_coordinator
    ok = coordinator.heartbeat(body.agent_id, x=body.x, y=body.y)
    return SwarmHeartbeatResponse(ok=ok)
