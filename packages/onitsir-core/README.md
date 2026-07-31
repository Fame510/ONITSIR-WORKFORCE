# onitsir-core

The governed engine of [ONITSIR-WORKFORCE](https://github.com/Fame510/ONITSIR-WORKFORCE) —
the Python half of the system. This package is the **single canonical
implementation** of the SHACKLE governance decision surface. Nothing else in
the repository re-implements `decide()`; the TypeScript side mirrors verdict
types for display only, and a CI job fails the build if those types drift.

## Install

```bash
pip install -e .              # runtime only
pip install -e ".[crypto]"    # + pynacl, enables Ed25519 ledger signing
pip install -e ".[dev]"       # + pytest, pytest-asyncio
```

Requires Python 3.10 or newer. CI exercises 3.10, 3.11 and 3.12.

## What is in here

| Module | Responsibility |
|---|---|
| `shackle.py` | `decide(config, state, call)` — the normative decision function, and `Governor` which wraps it with veto, ethics and ledger layers |
| `shackle_rules.py` | Declarative JSON veto rules (`ShackleValidator`). A hard veto can never be outvoted by a positive ethics score. |
| `ethics.py` | Additive tag-weight scoring (`EthicsEngine`) |
| `audit_ledger.py` | Hash-chained, optionally Ed25519-signed `AuditLedger` with `verify()` |
| `verification.py` | The Iron Law `VerificationGate` — no completion claim without fresh, passing evidence |
| `evidence_producers/` | Pluggable evidence producers for chain steps and Dux-format research output |
| `roster.py` | Loads `data/roster.json` and resolves persona markdown when present |
| `router.py` | Deterministic goal-to-crew matching, also used as an LLM pre-filter |
| `engine.py` | Mission runner over the workflow phase machine |
| `workflow.py` | `intake -> spec -> plan -> build -> verify -> ship` phase machine |
| `swarm/coordinator.py` | Liveness classification and greedy nearest-eligible task allocation |
| `conformance/` | SP/1.0 conformance runner, vectors and certificate issuer |
| `cli.py` | The `onitsir` command |

## Quick start

```python
from onitsir.shackle import Governor, GovernorConfig

gov = Governor(GovernorConfig(budget_usd=1.00, max_repeat_calls=3))
verdict, reason = gov.evaluate("web.search", cost_usd=0.25)
print(verdict, reason)          # ALLOW within_thresholds
print(gov.ledger.verify())      # True
```

The full decision surface — all ten precedence steps, HITL semantics, and the
documented limitations — is specified in
[`docs/SHACKLE.md`](../../docs/SHACKLE.md).

## CLI

```bash
onitsir roster            # live specialist count and categories
onitsir crew "launch a mobile game"
onitsir run "launch a mobile game"
onitsir shackle           # Governor demo
onitsir shackle-rules     # declarative veto demo
onitsir ethics            # additive ethics scoring demo
onitsir conformance       # run the SP/1.0 conformance suite
onitsir swarm-demo        # swarm coordinator demo
```

## Tests

```bash
python -m pytest tests/ -v
```

## Licensing

Code in this package is AGPL-3.0-or-later. The conformance vectors under
`onitsir/conformance/vectors/` are additionally available under Apache-2.0 so
third parties can test their own implementations — see
[`LICENSE-FIXTURES`](../../LICENSE-FIXTURES) and
[`NOTICE.md`](../../NOTICE.md).
