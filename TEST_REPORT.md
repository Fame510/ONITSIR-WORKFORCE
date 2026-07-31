# Test report

Generated for release **v1.0.0**, commit range ending at the tag.

Everything below is either produced by CI or reproducible with the commands
given. Where something is *not* measured, this document says so rather than
implying it.

## Summary

| Suite | Count | Command |
|---|---|---|
| `onitsir-core` (pytest) | 198 | `cd packages/onitsir-core && python -m pytest tests/ -v` |
| `onitsir-server` (pytest) | 15 | `cd packages/onitsir-server && python -m pytest tests/ -v` |
| `agentosirus-web` (vitest) | 44 | `cd packages/agentosirus-web && npm run test` |
| **Total automated tests** | **257** | |
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

## onitsir-core — 198 tests

| File | Tests | Covers |
|---|---|---|
| `test_shackle.py` | 28 | Governor behaviour, verdicts, ledger integration |
| `test_governor_paths.py` | 22 | Every precedence branch of `decide()` |
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

## onitsir-server — 15 tests

| File | Tests | Covers |
|---|---|---|
| `test_api.py` | 10 | Full mission lifecycle, gate, verify-step, audit, HITL, evidence, swarm, events, 404 |
| `test_transport.py` | 5 | Loopback and HTTP bridge transports |

`test_api.py` asserts live counts rather than hardcoded ones: `/health` and the
sum of `agentCount` across divisions must both equal the real roster size.

## agentosirus-web — 44 tests

| File | Tests | Covers |
|---|---|---|
| `evidenceMirror.test.ts` | 25 | Offline mirror parity with the Python producer |
| `qec.test.ts` | 8 | Deterministic-collapse sanity filter |
| `localLedger.test.ts` | 6 | Local hash-chained ledger |
| `contextTiering.test.ts` | 5 | HOT/WARM/COLD context tiering |

Test files must live under `src/**/__tests__/` and end in `.test.ts`; that glob
is what `vitest.config.ts` includes. A test placed elsewhere silently never
runs.

## SP/1.0 conformance — 12 vectors

`SPEC_VERSION = "1.0.0"`, `STANDARD_NAME = "ONITSIR"`, mandatory level
`IRON_LAW`.

| Level | Vectors | Clauses |
|---|---|---|
| `L1_IRON_LAW` | 5 | IL-1 … IL-4 |
| `L2_GOVERNANCE` | 4 | GV-1 … GV-4 |
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
- Ledger tests mutate a committed chain — a field, an ordering, a length — and
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
   valid evidence — output the real Iron Law rejects.
2. **Offline task-relevance checking both over- and under-matched.** It used
   substring matching over only the first eight words of the task, so a task
   word occurring inside a longer unrelated word counted as a match while any
   word past the eighth was ignored. It now mirrors the producer's tokenizer and
   intersects token sets across the whole task.

The mirror is a deliberate, tested mirror rather than a second authority. If the
Python producer's markers, minimum length, or tokenizer change, the mirror and
its tests must change in the same commit — see
[`CONTRIBUTING.md`](CONTRIBUTING.md) rule 6.

## What is not measured

Stated plainly so no reader infers more than CI proves.

- **No coverage measurement.** There is no `pytest-cov` run and no
  minimum-coverage gate. 257 tests is a count, not a coverage figure. Tracked as
  [`docs/ROADMAP.md`](docs/ROADMAP.md) item 6.
- **No static security analysis in CI.** A manual audit confirms no `eval`,
  `exec`, `os.system`, `subprocess` or `pickle` anywhere in the Python source,
  and that the only environment variable read by the core is
  `ONITSIR_SHACKLE_RULES`. That audit is not automated. Tracked as item 7.
- **No property-based tests.** All suites are example-based, including for
  properties stated as invariants in [`docs/SHACKLE.md`](docs/SHACKLE.md).
  Tracked as item 8.
- **No load or soak testing.** No concurrency or throughput claim is made.
- **No test of enforced constraint, because there is none to test.** The suites
  demonstrate that decisions are deterministic, reproducible and recorded. They
  do not demonstrate that a caller which ignores a `DENY` is prevented from
  acting, because SHACKLE does not hold the protected capability. Tracked as
  item 1.
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
