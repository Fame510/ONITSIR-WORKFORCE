<div align="center">
  <img src="assets/logo.png" alt="ONITSIR" width="360" />
</div>

# ONITSIR-WORKFORCE â "On It, Sir."

<div align="center">

[![CI](https://github.com/Fame510/ONITSIR-WORKFORCE/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Fame510/ONITSIR-WORKFORCE/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-296%20passing-brightgreen)](TEST_REPORT.md)
[![Conformance](https://img.shields.io/badge/SP%2F1.0-12%20vectors-blue)](docs/SHACKLE.md)
[![Code license: AGPL v3](https://img.shields.io/badge/code-AGPL--3.0-blue)](LICENSE)
[![Spec license: CC BY 4.0](https://img.shields.io/badge/spec-CC%20BY%204.0-lightgrey)](LICENSE-SPEC)
[![Fixtures: Apache 2.0](https://img.shields.io/badge/fixtures-Apache--2.0-lightgrey)](LICENSE-FIXTURES)
[![Python](https://img.shields.io/badge/python-3.10%20%7C%203.11%20%7C%203.12-blue)](packages/onitsir-core)

</div>

A two-process, two-language AI agency operating system that fuses **ONITSIR**
(the governed execution core) and **agentosirus** (the execution surface and
human interface), plus governance/robotics-inspired modules ported from
**ADROS**, **AgentOmega**, **SINGULARITY**, **morphic-kernel**, and **Dux**.

This supersedes both original repositories. ONITSIR is not subordinate to
agentosirus, nor vice versa â they are laterally fused, the same way ONITSIR
itself fuses Roster + Governor + Method + Machine into one engine. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design rationale
and [`docs/SYNERGIES.md`](docs/SYNERGIES.md) for a standalone reference to
all 25 synergies implemented here.

---

## What this system is

- **The Roster** â a unified specialist workforce: **164 specialist records
  across 14 categories** in a single source of truth, resolving ONITSIR's JSON
  metadata and agentosirus's markdown persona bodies through one loader.
  Note that this release ships **one** full persona markdown body; the other
  163 entries are metadata records without a persona file. The CI roster smoke
  test prints the indexed persona count directly, so the gap is visible rather
  than implied. Tracked as [`docs/ROADMAP.md`](docs/ROADMAP.md) item 9.
- **The Router** â deterministic goalâcrew matching, used both as ONITSIR's
  own crew staffer and as a cheap pre-filter for agentosirus's LLM planner.
- **The Governor (Shackle)** â a fail-closed policy surface (ALLOW/DENY/HITL)
  with budget/loop/repeat circuit breakers, a declarative JSON-rule veto
  layer, additive ethics scoring, bounded-timeout human-in-the-loop, and a
  tamper-evident (optionally Ed25519-signed) hash-chained audit ledger. This
  is the **single canonical implementation** â TypeScript never
  re-implements it, only mirrors verdict types for display.
- **The Iron Law (Verification Gate)** â "no completion claims without
  fresh, passing evidence" â extended with pluggable evidence producers for
  chain steps, tool-integration side effects, and Dux-format research output.
- **The Workflow** â an `intake â spec â plan â build â verify â ship` phase
  machine that drives every mission, even ones whose actual work happens in
  the TypeScript process.
- **agentosirus-web** â the specialist prompt library, multi-provider LLM
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
python -m pytest tests/ -v          # 222 tests

cd ../onitsir-server
pip install -e .
python -m pytest tests/ -v          # 30 tests
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
npm ci                   # ci, not install: the lockfile is authoritative
npm run dev              # static/offline mode (apiShim.ts answers /api/*)

# or, governed mode:
VITE_BACKEND_URL=http://localhost:8000 npm run dev
```

Run the frontend test suite:

```bash
npm run test             # vitest â 44 tests
npx tsc --noEmit          # strict type-check â 0 errors
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
function (`onitsir-core/onitsir/shackle.py`) â the single canonical
implementation in the entire system:

```
goal -> route -> [ Shackle: may this run? ] -> run -> [ Iron Law: did it pass? ] -> ship
```

`decide()` checks, in strict precedence order: malformed input â circuit
open â duplicate nonce (replay) â HITL transition contract â budget
exhausted â max repeat exceeded â HITL-always mode â HITL budget threshold â
opaque/untestable context â default ALLOW. Steps 1, 4 and 9 are fail-closed:
input that cannot be canonicalized is denied, an operator decision is honoured
only for the exact call it was granted for, and a context the gate cannot read
is denied rather than escalated. On top of this, `Governor.evaluate()`
layers ADROS's declarative JSON-rule veto engine (SYNERGY #11) and additive
ethics scoring (SYNERGY #12) â a hard veto always wins, exactly like ADROS's
`SafetyKernel`: "a positive score can never outvote a hard veto."

Every ruling is recorded in a hash-chained, optionally Ed25519-signed
`AuditLedger` (SYNERGY #9) whose integrity can be verified at any time via
`GET /api/audit/:mission_id/verify`.

## Test results

**296 automated tests pass** across the whole system â 222 `onitsir-core` and
30 `onitsir-server` pytest tests, plus 44 `agentosirus-web` vitest tests â
alongside a clean TypeScript strict-mode compile and the 12-vector SP/1.0
conformance suite. All of it runs in CI on every push across nine job
instances, against Python 3.10, 3.11 and 3.12, and the merge gate requires all
nine.

Full breakdown, including what is deliberately **not** measured, in
[`TEST_REPORT.md`](TEST_REPORT.md).

What is not measured, stated here so nothing is inferred from a test count:
there is no coverage measurement and no coverage gate, no static security
analysis in CI, and no property-based tests. 296 is a count, not a coverage
figure. See [`docs/ROADMAP.md`](docs/ROADMAP.md) items 6 to 8.

## Conformance

This repository implements **SP/1.0** (`SPEC_VERSION = "1.0.0"`,
`STANDARD_NAME = "ONITSIR"`), with 12 conformance vectors across three levels:

| Level | Vectors | Clauses |
|---|---|---|
| `L1_IRON_LAW` (mandatory) | 5 | IL-1 â¦ IL-4 |
| `L2_GOVERNANCE` | 4 | GV-1 â¦ GV-4 |
| `L3_PROVIDER_CONTRACT` | 3 | PC-1 |

For the shipped implementation the runner reports verdict `CONFORMANT` at
`highest_level = "L3_PROVIDER_CONTRACT"`. Reproduce it with `onitsir conformance`.

The full normative decision surface â all ten precedence steps, the HITL
transition table, canonicalization rules and their limitations, and an explicit
"what SHACKLE does not do" section â is specified in
[`docs/SHACKLE.md`](docs/SHACKLE.md).

Passing the vectors means an implementation reproduces those vectors. It is not
a security certification and not an endorsement. See
[`docs/GOVERNANCE.md`](docs/GOVERNANCE.md).

## What SHACKLE does and does not claim

Read this before citing the governance surface anywhere.

**What it does.** Given an input, the decision is deterministic and
reproducible. Arguments are bound into the canonical hash of the recorded
entry. Deny reasons carry defined semantics. Every ruling is appended to a
hash-chained, optionally Ed25519-signed ledger whose integrity is checkable at
any time. That is **decision evidence**, and the conformance vectors test it.

**What it does not do.** SHACKLE is a decision surface, not an enforcement
boundary. It does not hold the protected capability and does not mediate the
call, so a caller that ignores a `DENY` is not stopped by SHACKLE itself.
Verdicts are not bound to specific arguments â there is no nonce-scoped,
single-use, argument-digest-bound authorization. The ledger is
tamper-**evident**, not tamper-proof, and when signing is enabled the key lives
in the same process as the ledger.

The project therefore does not describe the executor as demonstrably
constrained. Closing that gap is [`docs/ROADMAP.md`](docs/ROADMAP.md) item 1.

## Independent verification

**Scope note first, so nothing here is misread.** The independent verification
below was performed against the **SHACKLE reference implementation** at its
master commit `62dcbc7f`, covering **15** vectors. It was **not** performed
against this repository, which ships 12 vectors. It is cited here because
SHACKLE is the governance surface this repository implements, and because the
distinction the reviewer drew shapes how this project states its claims. No
part of ONITSIR-WORKFORCE has been independently verified.

With that scope stated: an outside reviewer, GitHub user
[`nutstrut`](https://github.com/crewAIInc/crewAI/issues/6025#issuecomment-5123740195),
independently reproduced that conformance material and posted the result
publicly on 2026-07-29:

> I pulled current master at 62dcbc7f and reran the conformance material: all
> 15 vectors reproduce, and the v1 hash chain detects tampering and reordering
> under the published tests.

In the same comment the reviewer drew the distinction this project now uses
throughout, noting that they would not yet call the executor demonstrably
constrained, and separating decision evidence from enforced constraint â the
daemon holds the signing key but not the protected capability. That assessment
is accurate and is why the section above exists and why
[`docs/ROADMAP.md`](docs/ROADMAP.md) opens with enforcement.

The same reviewer also corrected an earlier claim of ours. In their words, the
prior SHACKLE fixture pass they can substantiate is from July 4 against 9
fixtures, not a June verification. The corrected version is what stands, and
the incorrect one is not repeated anywhere in this repository.

Scope of that verification, stated precisely: it covers fixture reproduction,
determinism, argument binding, deny-reason semantics, and the published
surface. It does **not** cover mediation, custody, bypass resistance,
production security, or any v2 daemon, and it is not a certification.

## Licensing

Three parts, so a third party can implement and test against the specification
without taking a copyleft obligation on their own code:

| Part | License | Scope |
|---|---|---|
| Code | [AGPL-3.0-or-later](LICENSE) | Everything not listed below |
| Specification | [CC BY 4.0](LICENSE-SPEC) | `docs/*.md` |
| Conformance fixtures | [Apache-2.0](LICENSE-FIXTURES) | `packages/onitsir-core/onitsir/conformance/vectors/*.json` |

Attribution string and full rationale in [`NOTICE.md`](NOTICE.md).

## Documentation

| Document | What it is for |
|---|---|
| [`docs/SHACKLE.md`](docs/SHACKLE.md) | The normative decision surface |
| [`docs/API.md`](docs/API.md) | Every route, with limitations |
| [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md) | Decision authority, frozen surface |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Full design rationale |
| [`docs/SYNERGIES.md`](docs/SYNERGIES.md) | All 25 synergies |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Running it, with a production checklist |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Every known limitation, and what closing it takes |
| [`TEST_REPORT.md`](TEST_REPORT.md) | What is tested, and what is not measured |
| [`SECURITY.md`](SECURITY.md) | Reporting, and the current security posture |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Setup and the hard rules |
| [`CHANGELOG.md`](CHANGELOG.md) | Release history |

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
