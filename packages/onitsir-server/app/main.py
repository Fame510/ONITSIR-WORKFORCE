"""SYNERGY #5: FastAPI app mounting REST + WS routes.

Implements agentosirus's existing `/api/divisions`, `/api/agents`,
`/api/agents/:category/:id`, `/api/chat`, `/api/chain` contract server-side
(reading from the unified roster), PLUS the new governed routes: mission
submission/status, gate, verify-step, evidence, hitl, audit, router
prefilter/route, and swarm status.

SYNERGY #24: `WS /ws/mission/{id}` streams phase transitions + Governor
verdicts + ledger entries live to agentosirus's activityBus/MindMap,
following AgentOmega's REST+WS server.py split and ADROS's `/ws/telemetry`
pattern.
"""
from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from onitsir.roster import Roster
from onitsir.swarm import SwarmCoordinator

from .routes import agents, audit, divisions, hitl, mission, swarm


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Warm the roster and swarm coordinator once, before serving traffic.

    This replaces the deprecated `@app.on_event("startup")` hook. Roster.load()
    reads and indexes the roster from disk, which is why it is done once here
    rather than per request.

    Note for callers and tests: the roster is only attached inside this
    context. A bare `TestClient(app)` without the `with` block never enters
    the lifespan, so `app.state.roster` will be unset and `/health` will
    report `roster_size: 0`. Always use `with TestClient(app) as client:`.
    """
    app.state.roster = Roster.load()
    app.state.swarm_coordinator = SwarmCoordinator()
    yield


app = FastAPI(
    title="onitsir-server",
    description="FastAPI bridge exposing onitsir-core's governed Engine to agentosirus-web.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(divisions.router)
app.include_router(agents.router)
app.include_router(mission.router)
app.include_router(hitl.router)
app.include_router(audit.router)
app.include_router(swarm.router)


@app.get("/health")
def health():
    return {"status": "ok", "roster_size": len(app.state.roster) if hasattr(app.state, "roster") else 0}


@app.websocket("/ws/mission/{mission_id}")
async def ws_mission(websocket: WebSocket, mission_id: str):
    """SYNERGY #24: streams mission events (phase transitions, Governor
    verdicts, HITL prompts, ledger entries) live. `onitsirClient.ts`
    subscribes here and calls activityBus's `addNode`/`updateNode`/
    `linkNodes` for each event, using DenyReason/Verdict to set node
    color/state — no changes needed to MindMap.tsx itself."""
    await websocket.accept()
    from .routes.mission import _MISSIONS, _mission_events

    last_sent = 0
    try:
        while True:
            m = _MISSIONS.get(mission_id)
            if m is None:
                await websocket.send_json({"type": "ERROR", "detail": "mission not found"})
                await asyncio.sleep(1.0)
                continue
            events = _mission_events(mission_id)
            for ev in events[last_sent:]:
                await websocket.send_json(ev)
            last_sent = len(events)
            await asyncio.sleep(0.25)
    except WebSocketDisconnect:
        pass
