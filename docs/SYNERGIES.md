# ONITSIR Unified System — The 25 Synergies (Reference)

This is a standalone reference for all 25 synergies implemented in
`onitsir-unified/`. It is extracted from `docs/ARCHITECTURE.md` (the full
architecture design) for quick lookup. Each synergy below is **implemented**
in this codebase — see the "Implementation status" table at the end for the
exact files delivered per synergy.

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

---

## Implementation status

All 25 synergies are implemented with real, working code (not stubs). Below
is the file-level mapping of where each synergy actually lives in this
repository.

| # | Title | Key files delivered |
|---|---|---|
| 1 | Unified roster | `packages/onitsir-core/onitsir/roster.py`, `packages/agentosirus-web/scripts/build-agent-index.mjs`, `packages/onitsir-core/data/roster.json` |
| 2 | Router pre-filter | `packages/onitsir-core/onitsir/router.py::Router.pre_filter()`, `packages/onitsir-server/app/routes/mission.py::router_prefilter`, `packages/agentosirus-web/src/lib/apiShim.ts::localPreFilter` |
| 3 | Shackle Governor as agentosirus's policy gate | `packages/onitsir-core/onitsir/shackle.py`, `packages/onitsir-server/app/routes/mission.py::gate_mission_step`, `packages/agentosirus-web/src/lib/onitsirClient.ts::checkGate` |
| 4 | Iron Law verification for chain steps | `packages/onitsir-core/onitsir/evidence_producers/chain_step.py`, `packages/onitsir-server/app/routes/mission.py::verify_step`, `packages/agentosirus-web/src/lib/apiShim.ts::localVerifyStep` |
| 5 | ONITSIR as backend behind `/api/*` | `packages/onitsir-server/app/main.py`, `app/routes/{divisions,agents}.py`, `packages/agentosirus-web/src/main.tsx` (conditional `installApiShim()`), `src/components/SettingsPanel.tsx` (backend toggle) |
| 6 | Single governance source of truth | `packages/onitsir-server/app/schemas.py` (Literal types), `packages/agentosirus-web/src/lib/shackle.ts` (display-only mirror), `infra/scripts/sync-shackle-types.mjs` (drift CI check) |
| 7 | Evidence-wrap tool integrations | `packages/agentosirus-web/src/lib/integrations.ts::asEvidence`, `packages/onitsir-server/app/routes/mission.py::post_evidence` |
| 8 | Router-driven team suggestions | `packages/onitsir-server/app/routes/mission.py::router_route`, `packages/agentosirus-web/src/components/TeamBuilder.tsx` ("Suggest a team" box) |
| 9 | Specialist-count drift fix | `packages/onitsir-core/onitsir/roster.py::category_counts()`, `packages/onitsir-server/app/routes/divisions.py`, `packages/agentosirus-web/src/App.tsx`, `src/components/MasterAgentHub.tsx`, `metadata.json` |
| 10 | Bounded-timeout HITL | `packages/onitsir-core/onitsir/shackle.py` (`HitlMode`, `Governor.hitl_timeout()`), `onitsir/engine.py` (HITL loop in `run()`/`run_async()`), `packages/onitsir-server/app/routes/hitl.py`, `packages/agentosirus-web/src/components/HitlPrompt.tsx` |
| 11 | Declarative JSON-rule veto layer | `packages/onitsir-core/onitsir/shackle_rules.py`, `data/shackle_rules/onitsir-baseline.shackle.json` |
| 12 | Additive ethics tag-weight scoring | `packages/onitsir-core/onitsir/ethics.py`, wired into `onitsir/shackle.py::Governor.evaluate(tags=...)` |
| 13 | Self-diagnostic CI test mode | `packages/agentosirus-web/package.json` (`test`/`test:diagnostic` scripts), `src/lib/__tests__/{qec,contextTiering,localLedger}.test.ts`, `vitest.config.ts` |
| 14 | HOT/WARM/COLD context tiering | `packages/agentosirus-web/src/lib/contextTiering.ts`, wired into `src/lib/apiShim.ts::handleChat` |
| 15 | WASM capability-gated sandbox | `packages/agentosirus-web/sandbox/{wasmIsolateEngine,symbolicVerifier,watCompiler}.ts`, `src/components/LiveSandbox.tsx` (verification badge) |
| 16 | Governed browser automation | `packages/agentosirus-web/companion/server.mjs` (`gateAction()`), `packages/onitsir-core/onitsir/cost_model.py` |
| 17 | Swarm coordinator | `packages/onitsir-core/onitsir/swarm/coordinator.py`, `packages/onitsir-server/app/routes/swarm.py`, `packages/agentosirus-web/src/components/SwarmStatus.tsx` |
| 18 | Dux-format research evidence contract | `packages/onitsir-core/onitsir/evidence_producers/research.py`, `research/dux/` (imported corpus) |
| 19 | Theoretical CS Researcher persona | `packages/agentosirus-web/personas/specialized/specialized-theoretical-cs-researcher.md` |
| 20 | Conformance/certificate framework | `packages/onitsir-core/onitsir/conformance/{spec,runner,certificate}.py`, `onitsir/conformance/vectors/*.json`, `packages/agentosirus-web/scripts/conformance-check.mjs` |
| 21 | Transport abstraction | `packages/onitsir-server/app/bridge/{transport,loopback,http_bridge}.py` |
| 22 | Deterministic-collapse sanity filter | `packages/agentosirus-web/src/lib/qec.ts`, wired into `src/lib/apiShim.ts::handleChain` |
| 23 | Local hash-chained ledger | `packages/agentosirus-web/src/lib/localLedger.ts`, wired into `src/lib/apiShim.ts::handleChain` (offline fallback) |
| 24 | Live mission event streaming | `packages/onitsir-server/app/main.py` (`WS /ws/mission/:id`), `packages/agentosirus-web/src/lib/onitsirClient.ts::subscribeMission`, `src/components/MissionConsole.tsx` |
| 25 | Real vs decorative telemetry separation | `packages/agentosirus-web/src/components/CockpitFlourish.tsx` (decorative), `src/components/MissionTelemetry.tsx` (real), `src/components/MasterAgentHub.tsx` (uses both, clearly separated) |

See `/home/user/workspace/onitsir_unified_test_report.md` for the full test
results validating this implementation.
