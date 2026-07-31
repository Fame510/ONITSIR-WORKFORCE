# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versioning note: SHACKLE specification conformance is versioned separately from
the software. This release implements `SPEC_VERSION = "1.0.0"` of the ONITSIR
standard (SP/1.0). A change to the specification is a specification-version
change, not merely a package-version change.

## [Unreleased]

Planned work is tracked in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## [1.0.0] — 2026-07-31

First public release. This repository supersedes the separate `ONITSIR` and
`agentosirus` repositories, which are laterally fused here rather than one
being subordinate to the other.

### Added — the unified system

- **`onitsir-core`** (Python): the governed engine. Roster, Router, SHACKLE
  Governor, Iron Law verification gate, workflow phase machine, swarm
  coordinator, and the SP/1.0 conformance suite. This is the single canonical
  implementation of the governance decision surface.
- **`onitsir-server`** (Python/FastAPI): a bridge exposing the core over the
  `/api/*` contract the TypeScript surface already spoke, plus WebSocket
  mission event streaming. Contains no governance logic of its own.
- **`agentosirus-web`** (TypeScript/React): the execution surface and human
  interface — specialist prompt library, multi-provider LLM dispatch, tool
  integrations, and all UI. Runs fully offline via a `fetch` shim, or in
  governed mode against `onitsir-server`.

### Added — all 25 cross-repo synergies

Ported from direct inspection of seven upstream repositories. Full
descriptions in [`docs/SYNERGIES.md`](docs/SYNERGIES.md).

| # | Synergy | Source |
|---|---|---|
| 1 | Unified specialist roster | ONITSIR, agentosirus |
| 2 | Deterministic Router pre-filter | ONITSIR, agentosirus |
| 3 | SHACKLE Governor as the policy gate | ONITSIR, agentosirus |
| 4 | Iron Law verification for chain steps | ONITSIR, agentosirus |
| 5 | ONITSIR as the backend behind `/api/*` | ONITSIR, agentosirus |
| 6 | Single governance source of truth, CI-enforced | ONITSIR, agentosirus |
| 7 | Evidence-wrapped tool integrations | ONITSIR, agentosirus |
| 8 | Router-driven team suggestions | ONITSIR, agentosirus |
| 9 | Specialist-count drift fix (live, not hardcoded) | ONITSIR, agentosirus |
| 10 | Bounded-timeout human-in-the-loop | ONITSIR, agentosirus, AgentOmega |
| 11 | Declarative JSON-rule veto layer | ADROS |
| 12 | Additive ethics tag-weight scoring | ADROS |
| 13 | Self-diagnostic CI test mode | ADROS |
| 14 | HOT/WARM/COLD context tiering | SINGULARITY |
| 15 | WASM capability-gated sandbox | morphic-kernel |
| 16 | Governed browser automation | AgentOmega |
| 17 | Swarm coordinator | ADROS |
| 18 | Dux-format research evidence contract | Dux |
| 19 | Theoretical CS Researcher persona | Dux, ONITSIR, agentosirus |
| 20 | Conformance and certificate framework | ADROS |
| 21 | Transport abstraction (loopback vs HTTP) | SINGULARITY |
| 22 | Deterministic-collapse sanity filter | morphic-kernel |
| 23 | Local hash-chained ledger | morphic-kernel |
| 24 | Live mission event streaming | ONITSIR, agentosirus |
| 25 | Real vs decorative telemetry separation | SINGULARITY |

### Added — governance specification

- [`docs/SHACKLE.md`](docs/SHACKLE.md): the normative decision surface. Full
  ten-step precedence table, the rationale for why circuit-open precedes
  budget checks and why opaque context yields HITL rather than DENY, the HITL
  transition table, canonicalization rules and their two known limitations,
  and an explicit "what SHACKLE does not do" section.
- [`docs/API.md`](docs/API.md): every route with request and response
  examples, event types, error shapes, and seven documented limitations.
- [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md): decision authority, the frozen
  versus unstable surface table, criteria for a normative change, and the
  limits of a third-party conformance claim.
- [`SECURITY.md`](SECURITY.md): reporting process plus an explicit statement
  of the current security posture, including that SHACKLE is a decision
  surface and not an enforcement boundary.
- [`CONTRIBUTING.md`](CONTRIBUTING.md).

### Added — licensing

The repository is now licensed in three parts so that third parties can build
and test conforming implementations without taking on a copyleft obligation
for their own code:

- [`LICENSE`](LICENSE) — AGPL-3.0-or-later, for all code.
- [`LICENSE-SPEC`](LICENSE-SPEC) — CC BY 4.0, scoped to the specification
  documents under `docs/`.
- [`LICENSE-FIXTURES`](LICENSE-FIXTURES) — Apache-2.0, scoped to the
  conformance vectors under
  `packages/onitsir-core/onitsir/conformance/vectors/`.
- [`NOTICE.md`](NOTICE.md) — the canonical attribution string and the
  rationale for each part.

### Added — tests

272 automated tests: 198 in `onitsir-core`, 30 in `onitsir-server`, and 44
Vitest tests in `agentosirus-web`, plus a strict-mode TypeScript compile and
the SP/1.0 conformance suite. All nine CI job instances gate merges.

The suites added in this release concentrate on refusal paths, because in a
fail-closed system the valuable assertions are about what is denied:

- `test_governor_paths.py` — every one of the ten precedence branches,
  including the exact call on which the repeat ceiling trips and the fact that
  a denied call still consumes budget.
- `test_ledger_tamper.py` — hash-chain tamper, reordering and truncation
  detection.
- `test_canonicalization.py` — determinism across key and list ordering,
  non-ASCII handling, and `NaN`/`Infinity` rejection.
- `test_swarm_recovery.py` — liveness classification at both boundaries,
  using an injected clock rather than sleeping.
- `test_certificate.py` — certificate digest tamper detection, including a
  `NON_CONFORMANT` to `CONFORMANT` upgrade attempt and re-badging.
- `test_evidence_producers.py` — the rejection paths of both evidence
  producers.
- `evidenceMirror.test.ts` — parity between the offline mirror and the Python
  producer's documented semantics.
- `test_swarm_routes.py` — swarm register and heartbeat body validation,
  including that the old query-parameter call now fails rather than silently
  registering an agent.

### Fixed

- **Offline evidence checking accepted output the real Iron Law rejects.**
  `apiShim.ts` carried three of the Python producer's seven refusal markers, so
  in offline mode a Python traceback, an `Internal Server Error` body, or an
  `[error]` provider string could pass as evidence.
- **Offline task-relevance checking both over- and under-matched.** It used
  substring matching over only the first eight words of the task, so a task
  word appearing inside a longer unrelated word counted as a match, while any
  word past the eighth was ignored entirely. It now mirrors the producer's
  tokenizer and intersects token sets across the whole task.
- Both divergences were found only after the mirror was extracted into
  `src/lib/evidenceMirror.ts` so that it could be tested. It remains a
  deliberate, tested mirror rather than a second authority.
- `onitsir-core` metadata declared MIT while the project is AGPL-3.0. Corrected,
  and recorded in [`NOTICE.md`](NOTICE.md).
- `onitsir-server` metadata had no license or author fields.
- Both Python packages declared `readme = "README.md"` with no such file
  present, which made an editable install fail. Package READMEs added.
- `agentosirus-web` was versioned `3.0.0`, inherited from the pre-merge
  `agentosirus` line, while the repository released `1.0.0`. Realigned in
  `package.json` and in both version fields of `package-lock.json`.
- Replaced the deprecated `@app.on_event("startup")` hook with a `lifespan`
  context manager.
- `app/__init__.py` was the only package `__init__` without `__all__`.
- `/api/swarm/register` and `/api/swarm/heartbeat` took raw query parameters
  with no validation, and `capabilities` was a comma-separated string that
  silently split any tag containing a comma. Both now take validated Pydantic
  bodies.

### Known limitations

Stated plainly rather than left for a reader to discover:

- SHACKLE is a **decision** surface. It does not hold the protected capability
  and does not mediate the call, so a caller that ignores a `DENY` is not
  stopped by SHACKLE itself.
- Verdicts are not bound to specific arguments; there is no nonce-scoped,
  single-use, argument-digest-bound authorization.
- The audit ledger is tamper-**evident**, not tamper-proof, and when signing is
  enabled the key lives in the same process as the ledger.
- `onitsir-server` has no authentication, no authorization and no rate limiting
  on any route, including the WebSocket endpoint, and CORS is open. Mission
  state is a single-process in-memory dict.
- There is no coverage measurement, no static security analysis in CI, and no
  property-based testing. The test count is a count, not a coverage figure.
- The roster ships 164 metadata records across 14 categories, but only one
  full persona markdown body is included in this release; the CI roster smoke
  test reports the indexed persona count directly.
- `infra/Dockerfile.onitsir-server` copies `../onitsir-core`, which lies outside
  its build context, so that image does not build as configured.

[Unreleased]: https://github.com/Fame510/ONITSIR-WORKFORCE/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Fame510/ONITSIR-WORKFORCE/releases/tag/v1.0.0
