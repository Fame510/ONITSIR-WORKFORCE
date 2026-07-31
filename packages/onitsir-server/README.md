# onitsir-server

FastAPI bridge for [ONITSIR-WORKFORCE](https://github.com/Fame510/ONITSIR-WORKFORCE).
It exposes `onitsir-core`'s Engine, Roster, Router and Governor over the
`/api/*` contract that `agentosirus-web` already speaks, plus WebSocket
mission event streaming.

This package contains **no governance logic**. Every ruling comes from
`onitsir-core`'s `decide()`.

## Install

```bash
pip install -e ../onitsir-core
pip install -e .
uvicorn app.main:app --reload --port 8000
```

Requires Python 3.10 or newer. CI exercises 3.10, 3.11 and 3.12.

## Layout

| Path | Responsibility |
|---|---|
| `app/main.py` | App construction, CORS, roster warm-up, WebSocket route |
| `app/schemas.py` | Pydantic request/response models and the verdict/reason Literals mirrored by the TypeScript surface |
| `app/routes/agents.py` | Roster and division read routes |
| `app/routes/divisions.py` | Division listing |
| `app/routes/mission.py` | Mission creation, gate, verify-step, evidence, events |
| `app/routes/hitl.py` | Human-in-the-loop prompt and response |
| `app/routes/audit.py` | Ledger read and integrity verification |
| `app/routes/swarm.py` | Swarm register, heartbeat and status |
| `app/bridge/` | Transport abstraction: loopback and HTTP bridges |

Every route, its request and response shapes, event types, error shapes, and
the current known limitations are documented in
[`docs/API.md`](../../docs/API.md).

## Health check

```bash
curl http://localhost:8000/health
# {"status":"ok","roster_size":164}
```

## Tests

```bash
python -m pytest tests/ -v
```

## Operational warning

This server currently has **no authentication, no authorization and no rate
limiting on any route**, including the WebSocket endpoint, and CORS is open to
`*`. Mission state is held in a single-process in-memory dict. Do not expose it
to an untrusted network. See the known-limitations section of
[`docs/API.md`](../../docs/API.md) and
[`SECURITY.md`](../../SECURITY.md).

## Licensing

AGPL-3.0-or-later. See [`NOTICE.md`](../../NOTICE.md).
