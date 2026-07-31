# INTEROP.md — Python↔TypeScript Interop Contract

This document specifies the `Transport` abstraction and the Python↔TypeScript
bridge contract used by the unified ONITSIR system (SYNERGY #21, and the
supporting infrastructure for SYNERGY #3, #5, #10, #24). It is the refined,
post-implementation version of architecture doc section 2.3.

## 1. Why a bridge exists

`onitsir-core` (Python) owns the Roster, Router, Governor, Verification
Gate, and Workflow. `agentosirus-web` (TypeScript) owns the LLM provider
dispatch, tool integrations, and UI. Neither process can call the other's
in-memory objects directly, so the two languages talk over a well-defined
RPC contract, implemented by `onitsir-server` (FastAPI).

## 2. Transport abstraction

Defined in `packages/onitsir-server/app/bridge/transport.py`:

```python
class Transport(abc.ABC):
    name: str = "abstract"

    @abc.abstractmethod
    async def send(self, phase: str, payload: dict) -> TransportResult:
        ...
```

Two concrete implementations ship in this repo:

- **`LoopbackTransport`** (`app/bridge/loopback.py`) — in-process, used by
  tests and single-process dev setups. Ported in spirit from SINGULARITY's
  `InMemoryTransport`.
- **`HttpBridge`** (`app/bridge/http_bridge.py`) — makes a real HTTP call to
  agentosirus-web's `/internal/execute-phase` endpoint. Ported in spirit
  from SINGULARITY's `RdmaTransport` (the "real fabric" counterpart).

`Engine.run_async()`'s `verifier` callable is constructed with whichever
transport the deployment configures — callers never need to know which one
is in use, matching SINGULARITY's swap-without-caller-changes guarantee.

## 3. REST contract (control plane)

Implemented server-side in `packages/onitsir-server/app/routes/`:

| Route | Method | Synergy | Purpose |
|---|---|---|---|
| `/api/divisions` | GET | #5, #9 | Live division list with computed `agentCount` |
| `/api/agents` | GET | #5 | Full specialist metadata list |
| `/api/agents/:category/:id` | GET | #1, #5 | Resolves full persona markdown body |
| `/api/router/prefilter` | GET | #2 | Deterministic shortlist for the LLM planner |
| `/api/router/route` | POST | #8 | Confidence-scored crew for TeamBuilder |
| `/api/mission` | POST | #5 | Submit a goal, get a mission id + crew |
| `/api/mission/:id` | GET | #5 | Poll mission status/phase_log |
| `/api/mission/:id/gate` | POST | #3, #6 | The ONLY place `decide()` is consulted |
| `/api/mission/:id/verify-step` | POST | #4 | Iron Law check for one chain step |
| `/api/mission/:id/evidence` | POST | #7 | Evidence-wrap a tool-integration side effect |
| `/api/mission/:id/hitl` | POST | #10 | Operator approve/reject/modify |
| `/api/mission/:id/events` | GET | #24 | Polling fallback for mission events |
| `/api/audit/:id`, `/api/audit/:id/verify` | GET | #9, #24 | Hash-chain ledger + integrity check |
| `/api/swarm/status` | GET | #17 | Fleet-wide mission-worker view |

## 4. WebSocket contract (streaming plane)

`WS /ws/mission/:id` (in `packages/onitsir-server/app/main.py`) streams
`MissionEvent` JSON objects — `MISSION_CREATED`, `GOVERNOR_VERDICT`,
`HITL_PROMPT`, `HITL_RESPONSE`, `STEP_VERIFIED`, `TOOL_EVIDENCE` — consumed
by `agentosirus-web/src/lib/onitsirClient.ts::subscribeMission()`, which
maps each event onto `activityBus`'s `addNode`/`updateNode`/`linkNodes`
calls (SYNERGY #24). No changes are needed to `MindMap.tsx` itself, since it
already renders the generic `MindGraph` shape.

## 5. Data serialization

Pydantic models in `packages/onitsir-server/app/schemas.py` mirror
`agentosirus-web/src/types.ts`'s interfaces field-for-field — `Agent`,
`Division`, `Message`, `RouterAssignment`, `MissionEvent` — so the JSON
shape is identical on both sides with no translation layer.

`VerdictLiteral`/`DenyReasonLiteral`/`HitlModeLiteral` in `schemas.py` are
the Python-side source of truth for the value sets TypeScript renders
(never re-implements); `infra/scripts/sync-shackle-types.mjs` checks that
`agentosirus-web/src/types.ts`'s corresponding union types have not drifted
(SYNERGY #6).

## 6. Static/offline mode

When no backend is configured, `agentosirus-web/src/lib/apiShim.ts` answers
`/api/*` locally (unchanged from the original agentosirus), using local
mirrors of the Router pre-filter (SYNERGY #2) and chain-step evidence check
(SYNERGY #4), the QEC sanity filter (SYNERGY #22), and the local
hash-chained ledger (SYNERGY #23, `src/lib/localLedger.ts`) as the offline
audit trail. `SettingsPanel.tsx`'s "ONITSIR backend" field toggles between
the two modes with zero other frontend changes required.
