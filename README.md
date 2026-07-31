# ONITSIR (unified) — "On It, Sir."

A two-process, two-language AI agency operating system that fuses **ONITSIR**
(the governed execution core) and **agentosirus** (the execution surface and
human interface), plus governance/robotics-inspired modules ported from
**ADROS**, **AgentOmega**, **SINGULARITY**, **morphic-kernel**, and **Dux**.

This supersedes both original repositories. ONITSIR is not subordinate to
agentosirus, nor vice versa — they are laterally fused, the same way ONITSIR
itself fuses Roster + Governor + Method + Machine into one engine. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design rationale
and [`docs/SYNERGIES.md`](docs/SYNERGIES.md) for a standalone reference to
all 25 synergies implemented here.

---

## What this system is

- **The Roster** — a unified specialist workforce (164+ specialists across
  14 categories), resolving both ONITSIR's JSON metadata and agentosirus's
  full markdown persona bodies from a single source of truth.
- **The Router** — deterministic goal→crew matching, used both as ONITSIR's
  own crew staffer and as a cheap pre-filter for agentosirus's LLM planner.
- **The Governor (Shackle)** — a fail-closed policy surface (ALLOW/DENY/HITL)
  with budget/loop/repeat circuit breakers, a declarative JSON-rule veto
  layer, additive ethics scoring, bounded-timeout human-in-the-loop, and a
  tamper-evident (optionally Ed25519-signed) hash-chained audit ledger. This
  is the **single canonical implementation** — TypeScript never
  re-implements it, only mirrors verdict types for display.
- **The Iron Law (Verification Gate)** — "no completion claims without
  fresh, passing evidence" — extended with pluggable evidence producers for
  chain steps, tool-integration side effects, and Dux-format research output.
- **The Workflow** — an `intake → spec → plan → build → verify → ship` phase
  machine that drives every mission, even ones whose actual work happens in
  the TypeScript process.
- **agentosirus-web** — the specialist prompt library, multi-provider LLM
  dispatch (14 providers), tool integrations (GitHub/Firecrawl/Playwright/
  KlingAI), and all UI (chat, team builder, live mind map, mission console,
  audit ledger view, HITL prompts).

## Directory structure

```
onitsir-unified/
  README.md                    # this file
  docs/
    ARCHITECTURE.md              # full architecture design (source of truth)
    SYNERGIES.md                 # all 25 synergies, standalone reference
    INTEROP.md                   # Python<->TypeScript bridge contract
    ROSTER_FORMAT.md             # roster.json + persona.md dual-format spec
  packages/
    onitsir-core/               # PYTHON: the governed engine
    onitsir-server/             # PYTHON: FastAPI bridge (REST + WS)
    agentosirus-web/            # TYPESCRIPT: execution surface + UI
  infra/
    docker-compose.yml           # onitsir-server + agentosirus-web + nginx + prometheus
    nginx.conf, prometheus.yml, alert_rules.yml
    scripts/sync-shackle-types.mjs
  research/
    dux/                        # imported Dux research corpus (SYNERGY #18)
```

## All 25 synergies

See [`docs/SYNERGIES.md`](docs/SYNERGIES.md) for full descriptions. Summary:

| # | Synergy | Source repo(s) |
|---|---|---|
| 1 | Unified specialist roster | ONITSIR, agentosirus |
| 2 | Deterministic Router pre-filter | ONITSIR, agentosirus |
| 3 | Shackle Governor as agentosirus's policy gate | ONITSIR, agentosirus |
| 4 | Iron Law verification for chain steps | ONITSIR, agentosirus |
| 5 | ONITSIR as backend behind `/api/*` | ONITSIR, agentosirus |
| 6 | Single governance source of truth | ONITSIR, agentosirus |
| 7 | Evidence-wrap tool integrations | ONITSIR, agentosirus |
| 8 | Router-driven team suggestions | ONITSIR, agentosirus |
| 9 | Specialist-count drift fix | ONITSIR, agentosirus |
| 10 | Bounded-timeout HITL | ONITSIR, agentosirus, AgentOmega |
| 11 | Declarative JSON-rule veto layer | ADROS |
| 12 | Additive ethics tag-weight scoring | ADROS |
| 13 | Self-diagnostic CI test mode | ADROS |
| 14 | HOT/WARM/COLD context tiering | SINGULARITY |
| 15 | WASM capability-gated sandbox | morphic-kernel |
| 16 | Governed browser automation | AgentOmega |
| 17 | Swarm coordinator | ADROS |
| 18 | Dux-format research evidence contract | Dux |
| 19 | Theoretical CS Researcher persona | Dux, ONITSIR, agentosirus |
| 20 | Conformance/certificate framework | ADROS |
| 21 | Transport abstraction | SINGULARITY |
| 22 | Deterministic-collapse sanity filter | morphic-kernel |
| 23 | Local hash-chained ledger | morphic-kernel |
| 24 | Live mission event streaming | ONITSIR, agentosirus |
| 25 | Real vs decorative telemetry separation | SINGULARITY |

## Running it

### 1. Python core + server

```bash
cd packages/onitsir-core
pip install -e .
python -m pytest tests/ -v          # 103 tests

cd ../onitsir-server
pip install -e .
python -m pytest tests/ -v          # 15 tests
uvicorn app.main:app --reload --port 8000
```

Try the CLI directly:

```bash
onitsir roster                      # live specialist count/categories
onitsir crew "launch a mobile game" # preview a staffed crew
onitsir run "launch a mobile game"  # run a demo mission end to end
onitsir shackle                     # demo the Governor
onitsir shackle-rules               # demo declarative vetoes (Synergy #11)
onitsir ethics                      # demo additive ethics scoring (Synergy #12)
onitsir conformance                 # run the conformance suite (Synergy #20)
onitsir swarm-demo                  # demo the swarm coordinator (Synergy #17)
```

### 2. TypeScript execution surface

```bash
cd packages/agentosirus-web
npm install
npm run dev              # static/offline mode (apiShim.ts answers /api/*)

# or, governed mode:
VITE_BACKEND_URL=http://localhost:8000 npm run dev
```

Run the frontend test suite:

```bash
npm run test             # vitest — 19 tests
npx tsc --noEmit          # strict type-check — 0 errors
node scripts/conformance-check.mjs   # SYNERGY #20 TS-side provider contract check
```

### 3. Full stack via Docker Compose

```bash
cd infra
docker compose up --build
```

Brings up `onitsir-server` (port 8000), `agentosirus-web` (port 4173), the
Playwright/KlingAI `companion` service (port 8787), an `nginx` reverse proxy
(port 80) so the browser only talks to one origin, and Prometheus (port
9090) for observability.

## Governance model

Every governed action passes through the Shackle Governor's `decide()`
function (`onitsir-core/onitsir/shackle.py`) — the single canonical
implementation in the entire system:

```
goal -> route -> [ Shackle: may this run? ] -> run -> [ Iron Law: did it pass? ] -> ship
```

`decide()` checks, in strict precedence order: malformed input → circuit
open → duplicate nonce (replay) → HITL transition contract → budget
exhausted → max repeat exceeded → HITL-always mode → HITL budget threshold →
opaque/untestable context → default ALLOW. On top of this, `Governor.evaluate()`
layers ADROS's declarative JSON-rule veto engine (SYNERGY #11) and additive
ethics scoring (SYNERGY #12) — a hard veto always wins, exactly like ADROS's
`SafetyKernel`: "a positive score can never outvote a hard veto."

Every ruling is recorded in a hash-chained, optionally Ed25519-signed
`AuditLedger` (SYNERGY #9) whose integrity can be verified at any time via
`GET /api/audit/:mission_id/verify`.

## Test results

137 automated tests pass across the whole system (103 onitsir-core + 15
onitsir-server pytest tests, 19 agentosirus-web vitest tests), plus a clean
TypeScript strict-mode compile. Full breakdown in
[`/home/user/workspace/onitsir_unified_test_report.md`](../onitsir_unified_test_report.md).

## Sourcing

This design and implementation is grounded in direct inspection of all 7
Fame510 repositories: [ONITSIR](https://github.com/Fame510/ONITSIR),
[agentosirus](https://github.com/Fame510/agentosirus),
[ADROS](https://github.com/Fame510/ADROS),
[SINGULARITY](https://github.com/Fame510/SINGULARITY),
[morphic-kernel](https://github.com/Fame510/morphic-kernel),
[AgentOmega](https://github.com/Fame510/AgentOmega), and
[Dux](https://github.com/Fame510/Dux). Every ported module includes inline
comments referencing its source file and synergy number.
