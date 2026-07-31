# Test report

Generated for release **v1.0.0**, commit range ending at the tag.

Everything below is either produced by CI or reproducible with the commands
given. Where something is *not* measured, this document says so rather than
implying it.

## Summary

| Suite | Count | Command |
|---|---|---|
| `onitsir-core` (pytest) | 258 | `cd packages/onitsir-core && python -m pytest tests/ -v` |
| `onitsir-server` (pytest) | 45 | `cd packages/onitsir-server && python -m pytest tests/ -v` |
| `agentosirus-web` (vitest) | 69 | `cd packages/agentosirus-web && npm run test` |
| **Total automated tests** | **372** | |
| TypeScript strict compile | 0 errors | `npx tsc --noEmit` |
| SP/1.0 conformance vectors | 12 | `onitsir conformance` |
| Governance type-drift check | pass | `node infra/scripts/sync-shackle-types.mjs --check` |

Every one of these runs in CI on every push, across nine job instances, and the
merge gate requires all nine.

## CI job matrix

| Job | Instances |
|---|---|
| `onitsir-core (pytest)` | Python 3.10, 3.11, 3.12 |
| `onitsir-server (pytest)` | Python 3.10, 3.11, 3.12 |
| `agentosirus-web (vitest + tsc + build)` | Node 20 |
| `shackle type drift check` | Node 20 |
| `all green` gate | aggregates the above |

The `onitsir-core` job additionally smoke-tests the `onitsir` CLI against the
real roster, exercising eight subcommands. The `agentosirus-web` job runs, in
order: dependency install from the lockfile, agent index build, vitest, strict
type-check, provider-contract conformance check, and a production Vite build.

## onitsir-core â 258 tests

| File | Tests | Covers |
|---|---|---|
| `test_custody.py` | 36 | Capability minting, single use, argument binding, bypass refusal, custody ledger |
| `test_shackle.py` | 44 | Governor behaviour, verdicts, ledger integration, canonicalization rejection, bound HITL |
| `test_governor_paths.py` | 30 | Every precedence branch of `decide()`, including binding and single-use |
| `test_evidence_producers.py` | 18 | Evidence producer rejection paths |
| `test_certificate.py` | 15 | Conformance certificate digest tamper detection |
| `test_swarm_recovery.py` | 15 | Liveness boundaries, allocation determinism |
| `test_verification.py` | 14 | Iron Law gate, evidence freshness |
| `test_ledger_tamper.py` | 13 | Hash-chain tamper, reorder, truncation |
| `test_canonicalization.py` | 12 | Canonical hashing determinism and rejections |
| `test_roster.py` | 11 | Roster load, categories, lookups |
| `test_engine.py` | 9 | Mission runs through the phase machine |
| `test_swarm.py` | 9 | Coordinator status and allocation |
| `test_router.py` | 8 | Deterministic goal-to-crew matching |
| `test_conformance.py` | 7 | Conformance runner and verdicts |
| `test_shackle_rules.py` | 7 | Declarative veto rule predicates |
| `test_ethics.py` | 5 | Additive tag-weight scoring |
| `test_workflow.py` | 5 | Phase transitions |

## onitsir-server â 45 tests

| File | Tests | Covers |
|---|---|---|
| `test_custody_routes.py` | 15 | /authorize, /execute, the 403 bypass boundary, custody log |
| `test_swarm_routes.py` | 15 | Swarm register and heartbeat body validation, liveness counts, state isolation between clients |
| `test_api.py` | 10 | Full mission lifecycle, gate, verify-step, audit, HITL, evidence, swarm, events, 404 |
| `test_transport.py` | 5 | Loopback and HTTP bridge transports |

`test_api.py` asserts live counts rather than hardcoded ones: `/health` and the
sum of `agentCount` across divisions must both equal the real roster size.

## agentosirus-web â 69 tests

| File | Tests | Covers |
|---|---|---|
| `evidenceMirror.test.ts` | 25 | Offline mirror parity with the Python producer |
| `guardedToolCall.test.ts` | 25 | Client-side custody: refusal is thrown not returned, offline refuses protected tools, capability presented to /execute, argument and nonce binding |
| `qec.test.ts` | 8 | Deterministic-collapse sanity filter |
| `localLedger.test.ts` | 6 | Local hash-chained ledger |
| `contextTiering.test.ts` | 5 | HOT/WARM/COLD context tiering |

Test files must live under `src/**/__tests__/` and end in `.test.ts`; that glob
is what `vitest.config.ts` includes. A test placed elsewhere silently never
runs.

## SP/1.0 conformance â 12 vectors

`SPEC_VERSION = "1.0.0"`, `STANDARD_NAME = "ONITSIR"`, mandatory level
`IRON_LAW`.

| Level | Vectors | Clauses |
|---|---|---|
| `L1_IRON_LAW` | 5 | IL-1 â¦ IL-4 |
| `L2_GOVERNANCE` | 4 | GV-1 â¦ GV-4 |
| `L3_PROVIDER_CONTRACT` | 3 | PC-1 |

For the shipped implementation the runner reports verdict `CONFORMANT` at
`highest_level = "L3_PROVIDER_CONTRACT"`.

The vectors are separately licensed under Apache-2.0 (see
[`LICENSE-FIXTURES`](LICENSE-FIXTURES)) so a third party can test their own
implementation without a copyleft obligation on their code. Passing them means
an implementation reproduces those vectors; it is not a security certification
and not an endorsement. See [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md).

## Where the tests concentrate, and why

In a fail-closed system the valuable assertions are about what gets refused, so
the suites added for v1.0.0 target refusal paths:

- Each of the ten precedence steps in `decide()` has a test that makes *only*
  that step decisive, plus tests where two conditions are simultaneously true
  to pin which one wins.
- The repeat ceiling is asserted on the exact call that trips it. The counter is
  incremented before `decide()` runs, so the third call at a ceiling of three is
  the one denied for `max_repeat_exceeded`, and the fourth reports
  `circuit_open`. An earlier draft of this test asserted the fourth call and was
  wrong.
- A denied call still consumes budget. This is asserted with a vetoed call
  rather than an allowed one, because an allowed call does not demonstrate the
  claim.
- Ledger tests mutate a committed chain â a field, an ordering, a length â and
  assert `verify()` returns `False`.
- Certificate tests attempt to upgrade a `NON_CONFORMANT` report to
  `CONFORMANT`, to re-badge an implementation, and to inject a clause, and
  assert the digest catches each. They also pin the documented property that
  `issued_at` is deliberately outside the digest.
- Swarm tests inject a clock rather than sleeping, and assert both liveness
  boundaries as inclusive.

## Two real defects this suite found

Both were in shipped frontend code, and both were found only after the offline
mirror was extracted into a testable module.

1. **The offline refusal-marker list carried three of the Python producer's
   seven markers.** In offline mode a Python traceback, an
   `Internal Server Error` body, or an `[error]` provider string could pass as
   valid evidence â output the real Iron Law rejects.
2. **Offline task-relevance checking both over- and under-matched.** It used
   substring matching over only the first eight words of the task, so a task
   word occurring inside a longer unrelated word counted as a match while any
   word past the eighth was ignored. It now mirrors the producer's tokenizer and
   intersects token sets across the whole task.

The mirror is a deliberate, tested mirror rather than a second authority. If the
Python producer's markers, minimum length, or tokenizer change, the mirror and
its tests must change in the same commit â see
[`CONTRIBUTING.md`](CONTRIBUTING.md) rule 6.

## What is not measured

Stated plainly so no reader infers more than CI proves.

- **No coverage measurement.** There is no `pytest-cov` run and no
  minimum-coverage gate. 372 tests is a count, not a coverage figure. Tracked as
  [`docs/ROADMAP.md`](docs/ROADMAP.md) item 6.
- **No static security analysis in CI.** A manual audit confirms no `eval`,
  `exec`, `os.system`, `subprocess` or `pickle` anywhere in the Python source,
  and that the only environment variable read by the core is
  `ONITSIR_SHACKLE_RULES`. That audit is not automated. Tracked as item 7.
- **No property-based tests.** All suites are example-based, including for
  properties stated as invariants in [`docs/SHACKLE.md`](docs/SHACKLE.md).
  Tracked as item 8.
- **No load or soak testing.** No concurrency or throughput claim is made.
- **Enforced constraint is now tested, within a stated scope.**
  `test_custody.py` and `test_custody_routes.py` demonstrate that a caller
  which ignores a `DENY`, replays a capability, edits the arguments after
  approval, or points a capability at a different tool or mission is refused
  before the tool implementation is reached. The scope is the tools in
  `onitsir.custody.PROTECTED_TOOLS`, in-process, for one server process. No
  conformance vector covers custody yet, and no third party has verified it.
- **The browser guard is a call-path discipline, not an enforcement point.**
  `guardedToolCall()` is the only sanctioned way for the web surface to make a
  side-effecting call, and `guardedToolCall.test.ts` asserts that a refusal is
  thrown rather than returned, that offline mode refuses a protected tool
  instead of running it unmediated, and that the capability and arguments
  presented to `/execute` are the ones that were authorized. None of that is a
  security boundary: the browser runs code the operator controls, so the guard
  can be bypassed by editing the client. The boundary is the server's 403.
  There is also no lint rule enforcing that new call sites use the wrapper;
  `integrations.ts` routes its side-effecting methods through it structurally
  instead, and the rule to add is written down in `guardedToolCall.ts`.
- **`infra/Dockerfile.onitsir-server` is not built by CI.** Its context bug was
  found by inspection, not by a failing job.

## Reproducing all of it

```bash
# Python core
cd packages/onitsir-core
pip install -e ".[crypto,dev]"
python -m pytest tests/ -v

# Python server
cd ../onitsir-server
pip install -e ".[dev]"
python -m pytest tests/ -v

# TypeScript surface
cd ../agentosirus-web
npm ci
npm run build:index
npm run test
npx tsc --noEmit
npm run conformance:check
npm run build

# Governance type-drift check, from the repository root
node infra/scripts/sync-shackle-types.mjs --check
```
