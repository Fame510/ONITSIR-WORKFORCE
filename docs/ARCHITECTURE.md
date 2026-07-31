# Unified Architecture Design: ONITSIR + agentosirus

**Author's note on sourcing:** This design synthesizes direct source-code analysis of all 7 Fame510 repositories, cloned and read in full: [ONITSIR](https://github.com/Fame510/ONITSIR), [agentosirus](https://github.com/Fame510/agentosirus), [ADROS](https://github.com/Fame510/ADROS), [SINGULARITY](https://github.com/Fame510/SINGULARITY), [morphic-kernel](https://github.com/Fame510/morphic-kernel), [AgentOmega](https://github.com/Fame510/AgentOmega), and [Dux](https://github.com/Fame510/Dux). Per-repo detail lives in `repo_briefs/<name>.md`; this document is the combined synthesis and unification plan.

---

## 1. How ONITSIR and agentosirus Should Be Unified

ONITSIR and agentosirus are not competing systems — they are **two halves of one product that were built separately and never wired together**, and the evidence for this is structural, not aspirational:

- **Same roster, two formats.** ONITSIR's [`data/roster.json`](https://github.com/Fame510/ONITSIR/blob/main/data/roster.json) (164 entries) and agentosirus's markdown persona library (163 files) share **identical category names and near-identical counts**: design (8/8), engineering (23/23), marketing (26/26), strategy (16/16), game-development (20/20), specialized (24/24), paid-media (7/7), sales (8/8), project-management (6/6), spatial-computing (6/6), support (6/6), testing (8/8), product (5/5), integrations (1/1). ONITSIR has the routable metadata (id/category/keywords) but only short descriptions; agentosirus has the full system-prompt bodies but no deterministic router — each is missing exactly what the other has.
- **Same governance concept, three implementations.** "SHACKLE" appears as ONITSIR's `shackle.py` (pure `decide()` + hash-chained ledger), ADROS's `cognitive/shackle.py` (declarative JSON-rule veto engine), and AgentOmega's `app/shackle.py` (Ed25519-signed, 9-formally-invariant governor vendoring "SHACKLE SP/1.0"). agentosirus has **none** of this — its `handleChain()` swarm executor has no budget ceiling, no repeat-call breaker, no audit trail.
- **Same execution-contract shape.** agentosirus's `apiShim.ts` faithfully mirrors `server.ts`'s original Express routes (`/api/divisions`, `/api/agents`, `/api/chat`, `/api/chain`) purely to run without a backend. This is the exact seam where a real Python backend can be substituted with **zero frontend changes**.
- **Same "no fake success" ethos, different domains.** ONITSIR's Iron Law ("no completion without fresh, passing, real evidence"), SINGULARITY's `TeleportReport` ("nothing here fabricates performance numbers"), and morphic-kernel's `QEC_FATAL` (fail-closed on ambiguity) are all the same underlying design philosophy independently reinvented three times. agentosirus's swarm chain currently violates this ethos: a chain step is "done" once the LLM returns non-empty text, with no verification step at all.

**The unification principle:** ONITSIR becomes the **governed execution core** (Python) — it owns the roster, the routing decision, the governance gate, the verification gate, and the phase machine. agentosirus becomes the **execution surface and human interface** (TypeScript/React) — it owns the specialist prompts, the multi-provider LLM dispatch, the tool integrations (GitHub/Firecrawl/Playwright/Kling), and all UI/visualization. Neither is subordinate; they are laterally fused the same way ONITSIR itself fuses Roster+Governor+Method+Machine into one engine. The unified system is still called **ONITSIR** (per the task's directive) but is now a two-process, two-language system: a Python "brain" and a TypeScript "body," talking over a well-defined RPC contract, matching agentosirus's own philosophical framing of specialists "living" inside The Agency's cockpit while ONITSIR decides what work gets staffed, approved, and shipped.

---

## 2. The Unified Architecture

### 2.1 What stays Python

- **The Roster** (`onitsir/roster.py`) — extended to index agentosirus's markdown persona bodies alongside the existing JSON metadata (see Synergy #1). Roster loading, scoring, and search remain pure Python, stdlib-only.
- **The Router** (`onitsir/router.py`) — deterministic goal→crew matching remains Python; it becomes the **first-pass filter** before any LLM-based refinement happens in TypeScript (Synergy #2).
- **The Governor / Shackle** (`onitsir/shackle.py`) — remains the single source of truth for policy decisions (`decide()`), enhanced with AgentOmega's `DenyReason`/`HitlMode` enums (Synergy #10) and Ed25519 signing (Synergy #9). This is the system's **fail-closed brainstem** — it must never be reimplemented divergently in TypeScript again (see Synergy #6 for how the JS side instead calls into it).
- **The Verification Gate / Iron Law** (`onitsir/verification.py`) — remains Python; extended with pluggable "evidence producers" that can validate agentosirus's chain-step outputs (Synergy #4, #14).
- **The Workflow phase machine** (`onitsir/workflow.py`) — remains Python; drives every mission, including ones whose actual work (chat, tool calls, browser automation) happens in the TypeScript process.
- **The Engine** (`onitsir/engine.py`) — becomes an **async, server-hosted** engine (wrapped in FastAPI, following ADROS's and AgentOmega's precedent) rather than a synchronous library call; its `verifier` callable is now satisfied by round-tripping to the TypeScript execution surface over the RPC bridge.
- **New governance/robotics-inspired modules ported from ADROS/AgentOmega**: a declarative JSON-rule veto layer (Synergy #11), a swarm/task-coordinator for multi-mission scheduling (Synergy #17), a conformance/certificate test harness (Synergy #20).

### 2.2 What stays TypeScript

- **The specialist prompt library** (agentosirus's `design/`, `engineering/`, `marketing/`, etc.) — remains Markdown, now indexed by an extended `build-agent-index.mjs` that also emits the JSON shape ONITSIR's `Roster.load()` expects (Synergy #1), and includes the currently-orphaned `strategy/` and `integrations/` directories (a real bug fix, not just a synergy).
- **The multi-provider LLM dispatcher** (`src/lib/llm.ts`, `providers.ts`) — remains TypeScript; this is agentosirus's strongest asset (14 providers, free-tier-first routing, graceful fallover) and there is no reason to duplicate it in Python.
- **The tool integration clients** (`src/lib/integrations.ts`: GitHub, Firecrawl, Playwright, KlingAI) — remain TypeScript, callable both from the browser UI and, via the new backend, from ONITSIR-orchestrated missions (Synergy #5, #16).
- **All UI**: `MasterAgentHub`, `TeamBuilder`, `MindMap`, `SettingsPanel`, `AgentChat`, `AgentDetail` — remain React/TypeScript, becoming the front-end for ONITSIR missions instead of (or in addition to) agentosirus's own standalone chains.
- **The companion service** (`companion/server.mjs`) — remains a local Node service for privileged browser/KlingAI actions the browser sandbox forbids; ONITSIR-governed browser missions route through it via AgentOmega's hardened pattern (Synergy #16).
- **The activity bus / live mind-map** (`src/lib/activityBus.ts`, `MindMap.tsx`) — remains TypeScript, now fed by real ONITSIR phase/Governor/ledger events over the wire instead of only local chain-step events (Synergy #5, #24).

### 2.3 How they communicate — the Python↔TypeScript interop strategy

Today, neither repo has any cross-language bridge — ONITSIR has no HTTP surface at all (pure library+CLI), and agentosirus's `apiShim.ts` only intercepts its *own* `fetch` calls client-side. The unification requires a **new, explicit RPC layer**, and the clearest template already exists inside the portfolio: ADROS and AgentOmega both already do exactly this shape of thing (FastAPI + WebSocket, Pydantic schemas, REST for control-plane, WS for streaming).

**Chosen strategy: FastAPI backend wrapping `onitsir.Engine`, consumed by agentosirus's existing `apiShim.ts` contract.**

1. **Transport**: HTTP/REST for request-response calls (route a crew, fetch roster, submit a mission), WebSocket for streaming (phase transitions, Governor verdicts, ledger entries, chain-step progress) — directly matching AgentOmega's `server.py` split (REST governance endpoints + WS agent driving) and ADROS's `main.py` split (REST + `/ws/telemetry`).
2. **Contract preservation**: Because agentosirus's `apiShim.ts` already implements `GET /api/divisions`, `GET /api/agents`, `GET /api/agents/:category/:id`, `POST /api/scrape`, `POST /api/chat`, `POST /api/chain` as a faithful mirror of the original `server.ts` Express routes, the new Python FastAPI backend implements these **same routes** server-side. `installApiShim()` is simply not installed when a real backend is configured (a `VITE_BACKEND_URL` env var / `SettingsPanel` toggle switches agentosirus from "static/client-only" mode to "ONITSIR-backed" mode) — **zero component-level frontend changes required**.
3. **New governed routes** are additive: `POST /api/mission` (submit a goal, get a `Mission` id — routes internally through ONITSIR's `Engine.run()`), `GET /api/mission/:id` (poll status/phase_log), `WS /ws/mission/:id` (stream phase transitions + Governor verdicts + ledger entries live), `GET /api/audit/:mission_id` + `GET /api/audit/:mission_id/verify` (mirroring AgentOmega's audit endpoints), `POST /api/mission/:id/hitl` (operator APPROVE/REJECT/MODIFY, mirroring AgentOmega's `HITL_RESPONSE` WS message).
4. **The `verifier` callback problem**: ONITSIR's `Engine.run(goal, verifier)` requires a synchronous-ish Python callable that inspects a `Phase` and returns `Evidence`. In the unified system, this callable is implemented as an **async bridge function** that: (a) calls the TypeScript side (via an internal HTTP call to a `/internal/execute-phase` endpoint that agentosirus's Node/companion process exposes, or directly invokes `llm.ts`'s logic if the backend is later ported to run inside the same Node process via a shared execution layer), (b) waits for the chain/chat result, (c) runs it through a pluggable evidence-extraction step (lint/schema/test check per Synergy #14), and (d) returns an `Evidence` object back into the Python `Workflow`.
5. **Data serialization**: Pydantic models on the Python side (matching agentosirus's existing `Agent`/`Division`/`Message`/`TeamScenario` TypeScript interfaces field-for-field) ensure the JSON shape is identical on both sides — no translation layer needed beyond standard JSON.
6. **Why not gRPC/message-queue**: SINGULARITY's `Transport` abstraction pattern (Synergy #21) argues for *not* hard-coding HTTP everywhere — the bridge should be defined as an abstract `Transport` interface (`LoopbackTransport` for tests/single-process dev, `HttpTransport`/`WebSocketTransport` for the real split-process deployment) so the interop mechanism can evolve (e.g., to a shared-memory or message-queue transport for lower latency) without touching caller code in either language.
7. **Deployment topology**: two processes — `onitsir-server` (Python, FastAPI, owns Roster/Governor/Workflow/Engine state) and `agentosirus-web` (Vite/React static build + optional Node companion for privileged actions), reverse-proxied together (following ADROS's Nginx + FastAPI Docker Compose pattern) so the browser only ever talks to one origin.

### 2.4 Directory Structure for the Unified ONITSIR System

```
onitsir-unified/
  README.md                        # unified product README (supersedes both originals)
  docs/
    ARCHITECTURE.md                  # this document, refined post-implementation
    INTEROP.md                         # Transport abstraction + Python<->TS contract spec (per SINGULARITY pattern)
    ROSTER_FORMAT.md                     # unified roster.json + persona.md dual-format spec

  packages/
    onitsir-core/                      # PYTHON — the governed engine (evolves from ONITSIR repo)
      pyproject.toml
      onitsir/
        roster.py                        # extended: loads roster.json AND resolves persona.md content by id
        router.py                          # unchanged core scoring; new pre_filter() used by TS planner (Synergy #2)
        shackle.py                          # unchanged decide(); + shackle_rules/ JSON veto layer (Synergy #11)
          shackle_rules/
            onitsir-baseline.shackle.json      # ported from ADROS's declarative rule format
        verification.py                       # unchanged Evidence/VerificationGate; + evidence_producers/ (Synergy #14)
        workflow.py                             # unchanged Phase/Workflow state machine
        engine.py                                 # Engine now async; verifier bridges to onitsir-bridge
        audit_ledger.py                             # NEW: extracted from shackle.py, upgraded w/ Ed25519 signing (Synergy #9)
        conformance/                                  # NEW: ported from ADROS — spec.py, runner.py, certificate.py, vectors/
        swarm/
          coordinator.py                                # NEW: ported from ADROS's SwarmCoordinator (Synergy #17)
        cli.py                                            # unchanged onitsir CLI
      data/
        roster.json                                         # generated FROM personas/ at build time (Synergy #1)
      tests/                                                   # existing 75 tests + new bridge/conformance tests

    onitsir-server/                    # PYTHON — FastAPI bridge (NEW, modeled on ADROS/AgentOmega server.py)
      app/
        main.py                          # FastAPI app: mounts REST + WS routes
        routes/
          divisions.py, agents.py, mission.py, audit.py, hitl.py
        bridge/
          transport.py                     # abstract Transport (Synergy #21)
          loopback.py                        # in-process bridge for dev/tests
          http_bridge.py                       # calls agentosirus-web's /internal/execute endpoints
        schemas.py                             # Pydantic models mirroring src/types.ts exactly
      tests/

    agentosirus-web/                   # TYPESCRIPT — the execution surface + UI (evolves from agentosirus repo)
      personas/                          # RENAMED from flat category dirs: single source of truth
        design/*.md, engineering/*.md, ... , strategy/*.md, integrations/*.md   # ALL 14 categories now indexed (bug fix)
      scripts/
        build-agent-index.mjs              # extended: also emits roster.json shape for onitsir-core (Synergy #1)
      src/
        main.tsx, App.tsx, types.ts, index.css
        components/
          MasterAgentHub.tsx, TeamBuilder.tsx, MindMap.tsx, SettingsPanel.tsx,
          AgentChat.tsx, AgentDetail.tsx, AgentCard.tsx, LiveSandbox.tsx
          MissionConsole.tsx               # NEW: displays ONITSIR phase log + Governor verdicts (Synergy #24)
          AuditLedgerView.tsx              # NEW: renders hash-chain + signature verification status (Synergy #9, #24)
          HitlPrompt.tsx                   # NEW: operator APPROVE/REJECT/MODIFY UI (Synergy #10, #16)
        lib/
          llm.ts, providers.ts, keyVault.ts, activityBus.ts       # unchanged
          integrations.ts                    # unchanged clients; now also invocable server-side (Synergy #5)
          apiShim.ts                           # unchanged for static/offline mode; bypassed when backend configured
          onitsirClient.ts                       # NEW: typed client for the new /api/mission, /ws/mission/:id routes
          shackle.ts                               # NEW: thin TS mirror of decide() verdict TYPES ONLY (display, not decisioning) — decisioning stays server-side (Synergy #6)
          qec.ts                                     # NEW: ported deterministic-collapse sanity filter for chain plans (Synergy #22)
      companion/
        server.mjs                           # unchanged: Playwright + KlingAI privileged actions
      sandbox/
        wasmIsolateEngine.ts                    # NEW: ported from morphic-kernel for safe generated-code execution (Synergy #15)

  infra/
    docker-compose.yml                 # onitsir-server + agentosirus-web + nginx reverse proxy (per ADROS pattern)
    prometheus.yml, alert_rules.yml       # NEW: observability, ported from ADROS

  research/
    dux/                                # imported from Dux repo as the research-specialist output store (Synergy #18, #25)
      problems.md
      p_vs_np/literature_review.md
```

---

## 3. All 25 Synergies

### Core ONITSIR ↔ agentosirus synergies (1–10)

**1. Unify the specialist roster into one source of truth.**
Source repos: ONITSIR, agentosirus.
What it does: Eliminates the duplicate roster definitions (ONITSIR's 164-entry `roster.json` metadata vs. agentosirus's 163 markdown persona bodies) by making the markdown files canonical and generating `roster.json` from their YAML frontmatter + a keyword-extraction pass (reusing ONITSIR's own `scripts/gen_roster.py` stopword-based extraction logic).
Implementation approach: Extend agentosirus's `scripts/build-agent-index.mjs` to also emit a `roster.json`-shaped file (id/name/category/description/keywords) alongside `agents-index.json`; ONITSIR's `Roster.load()` reads that generated file. Fix the existing bug where `strategy/` and most of `integrations/` are excluded from the `divisions` array.
Files to create/modify: `agentosirus-web/scripts/build-agent-index.mjs` (extend), `onitsir-core/onitsir/roster.py` (add `Specialist.persona_path` field + `load_content()` method), new `onitsir-core/data/roster.json` becomes a build artifact, not hand-authored.

**2. Replace agentosirus's LLM-based "Swarm Architect" planner with ONITSIR's deterministic `Router` as a pre-filter.**
Source repos: ONITSIR, agentosirus.
What it does: Cuts the cost/latency of `handleChain()`'s specialist-selection step by having ONITSIR's free, instant `Router.route(goal, crew_size=8)` propose a shortlist before the LLM "Lead Swarm Architect" prompt (which today receives the *entire* 163-agent roster dump) picks from a much smaller, pre-scored candidate list.
Implementation approach: Add `router.pre_filter(goal, limit=8) -> list[Assignment]` in Python; expose it via `GET /api/router/prefilter?goal=...` on the new FastAPI bridge; modify `handleChain()` in `apiShim.ts`/`onitsirClient.ts` to call this endpoint first and pass only the shortlisted agents into the planner prompt.
Files to create/modify: `onitsir-core/onitsir/router.py` (add `pre_filter`), `onitsir-server/app/routes/mission.py` (new endpoint), `agentosirus-web/src/lib/apiShim.ts` (`handleChain` calls prefilter before building `coordinatorInstruction`).

**3. Port ONITSIR's Shackle Governor to TypeScript as agentosirus's policy gate — decisioning stays server-side.**
Source repos: ONITSIR, agentosirus.
What it does: Gives agentosirus's swarm chain execution the budget/loop/repeat circuit breakers and hash-chained audit ledger it currently entirely lacks, using a template (`site/app.js`) ONITSIR itself already wrote.
Implementation approach: The canonical `decide()` runs server-side in `onitsir-core` (single source of truth — see Synergy #6 for why not duplicating it in JS); `onitsirClient.ts` calls `POST /api/mission/:id/gate` before each chain step, receiving `{verdict, reason}`; on `DENY`/`HITL` the chain halts/pauses exactly as ONITSIR's Python `Engine.run()` does.
Files to create/modify: `onitsir-server/app/routes/mission.py` (`/gate` endpoint wrapping `Governor.evaluate()`), `agentosirus-web/src/lib/onitsirClient.ts` (`checkGate()` call inserted into `handleChain()`'s per-step loop).

**4. Give agentosirus's swarm chain real verification via ONITSIR's Iron Law.**
Source repos: ONITSIR, agentosirus.
What it does: Ends the practice of treating any non-empty LLM response as "done" — each `ChainStep`'s output is validated by a pluggable evidence-check (schema validation, lint, or a follow-up "did this satisfy the task" LLM judge) before the next specialist in the chain builds on it.
Implementation approach: Define `EvidenceProducer` protocol in Python (`onitsir-core/onitsir/verification.py`); implement a first concrete producer `ChainStepEvidenceProducer` that calls back into `agentosirus-web` for a lightweight self-check; wire it into `handleChain()` so each step's result is POSTed to `/api/mission/:id/verify-step` before advancing.
Files to create/modify: `onitsir-core/onitsir/verification.py` (add `EvidenceProducer` ABC), `onitsir-core/onitsir/evidence_producers/chain_step.py` (new), `onitsir-server/app/routes/mission.py` (`/verify-step` endpoint), `agentosirus-web/src/lib/apiShim.ts` (`handleChain` posts each step for verification).

**5. Expose ONITSIR as a backend service that agentosirus's React UI drives, over the existing `/api/*` contract.**
Source repos: ONITSIR, agentosirus.
What it does: Turns agentosirus into the full-featured chat/team-builder/mind-map frontend for ONITSIR's governed `Engine.run()`, with zero rewrite of `MasterAgentHub`/`TeamBuilder`/`MindMap` since `apiShim.ts` already mirrors the exact route shape a real backend would need.
Implementation approach: Stand up `onitsir-server` (FastAPI) implementing `/api/divisions`, `/api/agents`, `/api/agents/:category/:id`, `/api/chat`, `/api/chain` server-side (reading from the unified roster); add a `SettingsPanel` toggle ("Use ONITSIR backend") that disables `installApiShim()` and points `fetch` at the real server origin instead.
Files to create/modify: `onitsir-server/app/main.py`, `onitsir-server/app/routes/{divisions,agents}.py`, `agentosirus-web/src/main.tsx` (conditional `installApiShim()` call), `agentosirus-web/src/components/SettingsPanel.tsx` (new backend-mode toggle).

**6. Establish ONITSIR's Python `decide()` as the single governance source of truth; TypeScript only mirrors verdict types for display.**
Source repos: ONITSIR, agentosirus.
What it does: Prevents the "three independent SHACKLE implementations" problem (already visible across ONITSIR/ADROS/AgentOmega) from becoming a fourth divergent copy in TypeScript — agentosirus never re-implements policy logic, it only renders `Verdict`/`DenyReason` values it receives from the server.
Implementation approach: Define `Verdict`/`DenyReason`/`HitlMode` as a shared JSON schema (generated from Python enums via `pydantic`'s `.model_json_schema()`); TypeScript types (`shackle.ts`) are generated/kept in sync from that schema rather than hand-written; add a CI check that fails if the two drift.
Files to create/modify: `onitsir-core/onitsir/shackle.py` (upgrade to enum-based `DenyReason`/`HitlMode` per Synergy #10), `agentosirus-web/src/lib/shackle.ts` (generated types only, no `decide()` logic), `infra/scripts/sync-shackle-types.mjs` (new codegen script).

**7. Use ONITSIR's `Evidence`/`VerificationGate` to gate agentosirus's tool-integration calls (GitHub writes, Firecrawl scrapes).**
Source repos: ONITSIR, agentosirus.
What it does: Applies the Iron Law beyond LLM text generation to real side-effecting actions — e.g., a GitHub `writeFile`/`createRepo` call made by a specialist during a mission should itself be recorded as `Evidence` (command = the API call signature, output = the response, passed = HTTP 2xx) and checked by the gate before the mission phase is marked verified.
Implementation approach: Wrap `github.writeFile`/`createIssue`/`createRepo` calls in `integrations.ts` with an `asEvidence()` helper that posts the call outcome to `/api/mission/:id/evidence`; the Python `Workflow.complete_current()` consumes it directly.
Files to create/modify: `agentosirus-web/src/lib/integrations.ts` (`asEvidence` wrapper), `onitsir-server/app/routes/mission.py` (`/evidence` endpoint).

**8. Surface ONITSIR's crew/confidence scoring directly in agentosirus's `TeamBuilder` UI.**
Source repos: ONITSIR, agentosirus.
What it does: `TeamBuilder.tsx` currently only offers hand-curated "scenarios" (startup MVP, marketing campaign, etc.) mapping to hardcoded agent-id lists; adding a free-text goal box that calls ONITSIR's `Router.route()` lets users get a data-driven, confidence-scored crew suggestion (high/medium/low, per `Assignment.confidence`) for arbitrary goals, not just the 3–4 preset scenarios.
Implementation approach: Add a `POST /api/router/route {goal, crew_size}` endpoint returning `Assignment[]` with confidence tiers; add a "Suggest a team" input to `TeamBuilder.tsx` that calls it and pre-populates the team list.
Files to create/modify: `onitsir-server/app/routes/mission.py` (`/router/route` endpoint), `agentosirus-web/src/components/TeamBuilder.tsx` (new goal-input + suggestion UI).

**9. Fix the "144 vs 163 vs 164" specialist-count drift by making the count a live, computed value everywhere.**
Source repos: ONITSIR, agentosirus.
What it does: agentosirus's UI copy hardcodes "144 specialized AI agent personalities" / "144 COGNITIVE SPECIALISTS" in three places (`metadata.json`, `App.tsx`, `MasterAgentHub.tsx`) while the actual persona count is 163 and ONITSIR's roster.json has 164 — this synergy makes the number always reflect `roster.categories()`/`len(roster)` live from the unified data source.
Implementation approach: Replace all hardcoded specialist-count strings with a value fetched from `GET /api/divisions` (which already returns the live agent list) or computed at build time from the unified `roster.json`.
Files to create/modify: `agentosirus-web/src/App.tsx`, `agentosirus-web/src/components/MasterAgentHub.tsx`, `agentosirus-web/metadata.json` (remove/replace hardcoded "144" strings with `{agents.length}` template values).

**10. Adopt AgentOmega's bounded-timeout HITL pattern for both ONITSIR's `Engine` and agentosirus's `handleChain`.**
Source repos: ONITSIR, agentosirus, AgentOmega.
What it does: Replaces ONITSIR's current "just stop with `hitl_required=True`, no resume path" behavior with AgentOmega's pattern (emit prompt over WebSocket, wait with a bounded timeout, timeout always resolves to safe DENY) — giving agentosirus's UI a real "approve/reject/modify" HITL prompt component tied to live mission state.
Implementation approach: Port `HitlMode`/timeout-resolution logic from `AgentOmega/app/shackle.py` and `engine.py` into `onitsir-core/onitsir/shackle.py` and `engine.py`; add `WS /ws/mission/:id` messages for `HITL_PROMPT`/`HITL_RESPONSE`; build `HitlPrompt.tsx` in agentosirus to render and respond to them.
Files to create/modify: `onitsir-core/onitsir/shackle.py` (add `HitlMode` enum + timeout logic), `onitsir-core/onitsir/engine.py` (bounded-wait HITL loop), `onitsir-server/app/routes/hitl.py` (new), `agentosirus-web/src/components/HitlPrompt.tsx` (new).

### ADROS-sourced synergies (11–13)

**11. Add ADROS's declarative JSON-rule veto engine as a complementary policy layer in ONITSIR.**
Source repo: ADROS.
What it does: Lets operators define/version custom hard-veto rules (e.g., "never let a specialist post to a public GitHub repo without explicit consent tag") as data (JSON) rather than code, exactly as ADROS's `ShackleValidator` does via `ADROS_SHACKLE_RULES`.
Implementation approach: Port `ShackleValidator` (any_tags/all_tags/forbid_environment/require_reversible_if_tags predicates) into `onitsir-core`; load a baseline ruleset file at boot, allow override via `ONITSIR_SHACKLE_RULES` env var; call `validate()` inside `Governor.evaluate()` as an additional hard-veto check before returning ALLOW.
Files to create/modify: `onitsir-core/onitsir/shackle_rules.py` (ported `ShackleValidator`), `onitsir-core/data/shackle_rules/onitsir-baseline.shackle.json` (new baseline ruleset), `onitsir-core/onitsir/shackle.py` (`Governor.evaluate()` calls the validator).

**12. Reuse ADROS's additive `EthicsEngine` tag-weight model as a content-aware scoring layer in ONITSIR's Governor.**
Source repo: ADROS.
What it does: Adds a dimension to ONITSIR's currently resource-only governance (budget/loop/repeat) — tagging a proposed action with semantic tags (`privacy_violation`, `consent_given`, `human_safety`) and additively scoring it, so agentosirus's specialists can be governed on content-safety grounds, not just cost.
Implementation approach: Port `TAG_WEIGHTS`/`EthicsEngine.score()` into `onitsir-core`; extend `Governor.evaluate(tool_name, cost_usd, nonce, params, tags=[])` to run the ethics score alongside `decide()`, with a below-threshold score producing a DENY verdict routed through the existing ledger.
Files to create/modify: `onitsir-core/onitsir/ethics.py` (ported `EthicsEngine`), `onitsir-core/onitsir/shackle.py` (`Governor.evaluate` accepts `tags`).

**13. Adopt ADROS's `--test` self-diagnostic mode as a CI gate for agentosirus.**
Source repo: ADROS.
What it does: agentosirus currently has zero automated tests; ADROS's `run.py --test` pattern (exercise every subsystem deterministically, no external services needed) becomes the template for a first agentosirus test suite covering `llm.ts` provider routing, `keyVault.ts` config migration, and `apiShim.ts` route handling with mocked `fetch`.
Implementation approach: Add `vitest` (already a devDependency pattern seen in morphic-kernel) to agentosirus; write `src/lib/__tests__/{llm,keyVault,apiShim}.test.ts` mocking `fetch`/`localStorage`; add `npm run test:diagnostic` mirroring ADROS's self-check philosophy.
Files to create/modify: `agentosirus-web/package.json` (add `vitest` devDependency + `test` script), `agentosirus-web/src/lib/__tests__/llm.test.ts`, `keyVault.test.ts`, `apiShim.test.ts` (new).

### SINGULARITY-sourced synergies (14, 21, 25)

**14. Apply HOT/WARM/COLD context tiering to agentosirus's chat/swarm conversation history.**
Source repo: SINGULARITY.
What it does: Cuts token costs on long `MasterAgentHub` conversations and multi-step chains by tiering history the way SINGULARITY tiers KV-cache blocks — recent turns (HOT) always sent in full, mid-range (WARM) summarized, full history (COLD) available on demand only.
Implementation approach: Port the `Tier` enum + `assign_tiers()` selection concept into a TypeScript `contextTiering.ts`; `llm.ts`'s `generate()` calls it to build the `history` array sent to providers, tracking token savings for display in `SettingsPanel`.
Files to create/modify: `agentosirus-web/src/lib/contextTiering.ts` (new, ported concept), `agentosirus-web/src/lib/llm.ts` (`chatMessages()` uses tiered history).

**21. Adopt SINGULARITY's `Transport` abstraction as the Python↔TypeScript bridge design.**
Source repo: SINGULARITY.
What it does: Provides the swap-without-caller-changes pattern (`InMemoryTransport` vs. `rdma.py`) as the direct template for the unified system's own bridge — `LoopbackTransport` for single-process dev/tests, `HttpTransport`/`WebSocketTransport` for the real split-process deployment.
Implementation approach: Define `Transport` ABC in `onitsir-server/app/bridge/transport.py` with `send(phase, payload) -> response` as the core method; implement `LoopbackTransport` (direct in-process call, used by tests) and `HttpBridge` (real network call to agentosirus-web); `Engine`'s verifier is constructed with whichever transport the deployment config selects.
Files to create/modify: `onitsir-server/app/bridge/transport.py` (new ABC), `onitsir-server/app/bridge/loopback.py`, `onitsir-server/app/bridge/http_bridge.py` (new).

**25. Use SINGULARITY's "never fabricate numbers" discipline to separate real telemetry from decorative UI in agentosirus.**
Source repo: SINGULARITY.
What it does: `MasterAgentHub.tsx` currently includes explicitly-labeled "mock HUD telemetry that oscillates for visual realism" (arc reactor power, core temp, grid throughput) alongside real data (provider/model used, chain step status). This synergy enforces a clear visual/code separation so real Governor/ledger/cost data (once wired via Synergy #3/#9) is never confused with decorative flourishes.
Implementation approach: Extract all decorative telemetry into an isolated `CockpitFlourish.tsx` component clearly namespaced/commented as non-authoritative; route all real governance/audit data through a separate `MissionTelemetry.tsx` component sourced from `/ws/mission/:id`.
Files to create/modify: `agentosirus-web/src/components/CockpitFlourish.tsx` (new, extracted decorative state), `agentosirus-web/src/components/MissionTelemetry.tsx` (new, real data only), `agentosirus-web/src/components/MasterAgentHub.tsx` (refactored to use both, clearly separated).

### morphic-kernel-sourced synergies (15, 22, 23)

**15. Use morphic-kernel's capability-gated WASM sandbox to safely execute AI-generated code from either system.**
Source repo: morphic-kernel.
What it does: Neither ONITSIR nor agentosirus can currently safely *run* code an LLM writes (agentosirus's `LiveSandbox.tsx` name implies intent but no verified isolation exists). morphic-kernel's `wasmIsolateEngine.js` + `symbolicVerifier.js` provide real, working capability-gated, gas-metered isolation.
Implementation approach: Port `wasmIsolateEngine.js`/`watCompiler.js`/`symbolicVerifier.js` into `agentosirus-web/sandbox/`; wire `LiveSandbox.tsx` to actually execute generated code through this isolate instead of (presumably) rendering only; feed successful sandboxed execution results back to ONITSIR as `Evidence` (Synergy #4).
Files to create/modify: `agentosirus-web/sandbox/wasmIsolateEngine.ts`, `symbolicVerifier.ts`, `watCompiler.ts` (ported/adapted from morphic-kernel), `agentosirus-web/src/components/LiveSandbox.tsx` (wired to real execution).

**22. Port morphic-kernel's `QecEngine` deterministic-collapse pattern to sanity-check agentosirus's LLM-generated chain plans.**
Source repo: morphic-kernel.
What it does: Prevents `handleChain()` from blindly executing a malformed or policy-violating LLM-proposed plan by running it through a deterministic filter (do the referenced agent IDs exist? is crew size within `Governor` budget? any duplicate/circular steps?) that fails closed (`QEC_FATAL`-equivalent) on ambiguity, before any step executes.
Implementation approach: Port the collapse-then-score-then-fail-closed pattern into `agentosirus-web/src/lib/qec.ts`; call it on the parsed `plan.chain` inside `handleChain()` immediately after the planner LLM call returns, before the per-step execution loop begins.
Files to create/modify: `agentosirus-web/src/lib/qec.ts` (new, ported pattern), `agentosirus-web/src/lib/apiShim.ts` (`handleChain` calls `collapse(plan.chain)` before executing).

**23. Adopt morphic-kernel's hash-chained provenance ledger as the TypeScript-side ledger for local/offline mode.**
Source repo: morphic-kernel.
What it does: When agentosirus runs in pure static/offline mode (no `onitsir-server` backend configured), it still needs *some* audit trail for chain executions; morphic-kernel's `provenanceLedger.js` (file-backed in Node, adaptable to `localStorage`/IndexedDB in-browser) is a working, ready-made implementation rather than requiring a fresh port of ONITSIR's Python ledger.
Implementation approach: Adapt `appendProvenance`/`readLedger`/`verifyLedger` to a browser-storage backend (`localStorage` under a versioned key, matching `keyVault.ts`'s pattern); wire it into `apiShim.ts`'s `handleChain()` as the fallback ledger when no backend is configured.
Files to create/modify: `agentosirus-web/src/lib/localLedger.ts` (adapted from morphic-kernel's `provenanceLedger.js`), `agentosirus-web/src/lib/apiShim.ts` (`handleChain` appends to `localLedger` when offline).

### AgentOmega-sourced synergy (16, plus contributes to #6, #9, #10 above)

**16. Bring AgentOmega's SHACKLE-gated Playwright browser runtime into agentosirus as its governed "Browser" specialist backend.**
Source repo: AgentOmega.
What it does: agentosirus's existing `playwright` client (`integrations.ts`, backed by the local `companion/server.mjs`) currently performs open/read/click/type/screenshot with zero governance. AgentOmega's `HardenedAgentEngine` pattern (every action SHACKLE-gated pre-execution, cost-modeled, audited) upgrades this into a properly governed browser-automation specialist.
Implementation approach: Extend `companion/server.mjs`'s routes so each Playwright action first calls `onitsir-server`'s `/api/mission/:id/gate` (Synergy #3) with a per-action cost estimate (navigate/click cheap, screenshot/VLM-read more expensive, per AgentOmega's cost model); on DENY, the companion refuses the action and returns AgentOmega-style structured reasons.
Files to create/modify: `agentosirus-web/companion/server.mjs` (routes call the gate before executing), `onitsir-core/onitsir/cost_model.py` (new, ported AgentOmega per-action cost differentiation).

### Dux + swarm/coordinator synergies (17–20, 24)

**17. Port ADROS's `SwarmCoordinator` to schedule multiple concurrent ONITSIR missions / agentosirus chains.**
Source repo: ADROS.
What it does: The unified system currently handles one mission at a time; ADROS's capability-aware task allocation + heartbeat liveness + automatic reassignment generalizes cleanly from robots to concurrent mission workers, enabling multi-tenant/multi-mission scheduling.
Implementation approach: Port `SwarmCoordinator` into `onitsir-core/onitsir/swarm/coordinator.py`; register each active `Mission`/chain-execution worker as an "agent" in the coordinator's registry with heartbeats; `onitsir-server` exposes `GET /api/swarm/status` for a fleet-wide view in a new agentosirus admin panel.
Files to create/modify: `onitsir-core/onitsir/swarm/coordinator.py` (ported), `onitsir-server/app/routes/swarm.py` (new), `agentosirus-web/src/components/SwarmStatus.tsx` (new).

**18. Use Dux's problem-list/literature-review format as the standard research-mission output contract.**
Source repo: Dux.
What it does: Gives ONITSIR's Iron Law a concrete, human-checkable acceptance criterion for open-ended research missions (which have no test-suite pass/fail signal) — "did the specialist produce a literature review matching the Dux template (title/link/summary/key insight)?"
Implementation approach: Add a `ResearchEvidenceProducer` (Synergy #4's `EvidenceProducer` pattern) that checks a research-mission's output against the Dux markdown schema (headers, arXiv-style links, summary/insight fields) before marking the phase verified; import Dux's existing content into `research/dux/` as the seed corpus/output store.
Files to create/modify: `onitsir-core/onitsir/evidence_producers/research.py` (new), `research/dux/` (imported from Dux repo), `agentosirus-web/specialized/specialized-theoretical-cs-researcher.md` (new persona).

**19. Add a "Theoretical CS Researcher" persona to agentosirus's roster, closing the Dux ↔ agentosirus ↔ ONITSIR loop.**
Source repo: Dux (+ ONITSIR, agentosirus).
What it does: Turns Dux from a static, manually-curated stub into a live-updating research output by giving ONITSIR's Router something to route research goals to, and agentosirus a specialist whose system prompt is explicitly grounded in Dux's existing voice/format ("DUCKi / AEON DUX").
Implementation approach: Write `specialized-theoretical-cs-researcher.md` (frontmatter + system prompt instructing the agent to extend Dux's problem list/literature reviews in the established format, using `firecrawl.search()` for sourcing); add it to the unified roster (Synergy #1) so `Router.route("investigate P vs NP")` matches it.
Files to create/modify: `agentosirus-web/specialized/specialized-theoretical-cs-researcher.md` (new).

**20. Port ADROS's Conformance/Certificate framework to formally verify ONITSIR's Iron Law and agentosirus's provider contracts.**
Source repo: ADROS.
What it does: Provides a certificate-issuing conformance suite proving (with versioned test vectors) that `VerificationGate` truly rejects stale/failing/missing evidence in all cases, and that every one of agentosirus's 14 LLM providers' `generate()` calls satisfy the same request/response contract — closing a real quality gap (neither ONITSIR's nor agentosirus's own test suites currently do this cross-cutting conformance check).
Implementation approach: Port `ConformanceRunner`/`certificate.py`/`spec.py` into `onitsir-core/onitsir/conformance/`; write JSON test vectors for Iron Law edge cases (missing evidence, stale evidence, failing evidence) and for the provider-contract shape (`GenerateResult` fields); wire `onitsir-core/onitsir/conformance/vectors/provider_contract.json` to be checked against a TypeScript-side conformance runner too (ported concept, not code, since it tests TS providers).
Files to create/modify: `onitsir-core/onitsir/conformance/{runner,certificate,spec}.py` (ported from ADROS), `onitsir-core/onitsir/conformance/vectors/iron_law.json` (new vectors), `agentosirus-web/scripts/conformance-check.mjs` (new, TS-side provider conformance runner).

**24. Stream ONITSIR's phase transitions, Governor verdicts, and ledger entries live into agentosirus's existing `MindMap`/`activityBus`.**
Source repos: ONITSIR, agentosirus.
What it does: agentosirus already has a working live-visualization pub/sub (`activityBus.ts` → `MindMap.tsx`) built for chain-step events; extending it to also render ONITSIR's phase machine (`intake→spec→plan→build→verify→ship`) and Governor rulings (ALLOW/DENY/HITL, color-coded) gives users one unified live view of governed missions instead of two disconnected visualizations.
Implementation approach: `onitsirClient.ts` subscribes to `WS /ws/mission/:id` and calls `addNode`/`updateNode`/`linkNodes` (existing `activityBus.ts` functions) for each phase transition and ledger entry, using `DenyReason`/`Verdict` (Synergy #6/#10) to set node color/state; no changes needed to `MindMap.tsx` itself since it already consumes the generic `MindGraph` shape.
Files to create/modify: `agentosirus-web/src/lib/onitsirClient.ts` (new — WS subscription maps mission events to `activityBus` calls), `agentosirus-web/src/components/MindMap.tsx` (minor: legend for Governor verdict colors).

---

## Summary Table

| # | Title | Source Repo(s) |
|---|---|---|
| 1 | Unify the specialist roster into one source of truth | ONITSIR, agentosirus |
| 2 | Deterministic `Router` pre-filter for the Swarm Architect | ONITSIR, agentosirus |
| 3 | Port Shackle Governor to TS (decisioning server-side) | ONITSIR, agentosirus |
| 4 | Iron Law verification for swarm chain steps | ONITSIR, agentosirus |
| 5 | ONITSIR as backend behind agentosirus's `/api/*` contract | ONITSIR, agentosirus |
| 6 | Single governance source of truth (no TS reimplementation) | ONITSIR, agentosirus |
| 7 | Evidence-wrap tool-integration side effects | ONITSIR, agentosirus |
| 8 | Router-driven team suggestions in `TeamBuilder` | ONITSIR, agentosirus |
| 9 | Fix specialist-count drift (144/163/164) | ONITSIR, agentosirus |
| 10 | Bounded-timeout HITL pattern | ONITSIR, agentosirus, AgentOmega |
| 11 | Declarative JSON-rule veto layer | ADROS |
| 12 | Additive ethics tag-weight scoring | ADROS |
| 13 | Self-diagnostic CI test mode for agentosirus | ADROS |
| 14 | HOT/WARM/COLD context tiering for chat history | SINGULARITY |
| 15 | WASM capability-gated sandbox for generated code | morphic-kernel |
| 16 | SHACKLE-gated governed browser automation specialist | AgentOmega |
| 17 | Swarm coordinator for multi-mission scheduling | ADROS |
| 18 | Dux-format research-mission evidence contract | Dux |
| 19 | Theoretical CS Researcher persona | Dux, ONITSIR, agentosirus |
| 20 | Conformance/certificate framework | ADROS |
| 21 | `Transport` abstraction for the Python↔TS bridge | SINGULARITY |
| 22 | Deterministic-collapse sanity filter for chain plans | morphic-kernel |
| 23 | Local hash-chained ledger for offline mode | morphic-kernel |
| 24 | Live-stream mission events into `MindMap`/`activityBus` | ONITSIR, agentosirus |
| 25 | Separate real telemetry from decorative UI flourishes | SINGULARITY |

---

*All findings in this document are grounded in direct inspection of the cloned repositories at [github.com/Fame510](https://github.com/Fame510). Per-repo detail, including full architecture diagrams, key abstractions, and current-state gaps, is available in `repo_briefs/ONITSIR.md`, `repo_briefs/agentosirus.md`, `repo_briefs/ADROS.md`, `repo_briefs/SINGULARITY.md`, `repo_briefs/morphic-kernel.md`, `repo_briefs/AgentOmega.md`, and `repo_briefs/Dux.md`.*
