# SHACKLE - the governed decision surface

Normative reference for the policy decision function implemented in
`packages/onitsir-core/onitsir/shackle.py`. This is the single canonical
implementation in the system. The TypeScript surface mirrors the value sets for
display and never re-implements the logic; CI enforces that with a type-drift
check (`infra/scripts/sync-shackle-types.mjs --check`).

Specification version: **SP/1.0**.

---

## 1. Signature

```python
decide(config: dict, state: dict, call: dict) -> tuple[Verdict, str]
```

- `config` - static policy. Budget, repeat ceiling, HITL mode, thresholds.
- `state` - mutable runtime facts. Remaining budget, tripped circuit, seen
  nonces, repeat counts, pending HITL transition.
- `call` - the tool call under consideration. `tool_name`, `params`.
- returns `(verdict, reason)` where `verdict` is `"ALLOW"`, `"DENY"`, or
  `"HITL"`, and `reason` is a stable machine-readable string.

`decide()` is a pure function. It does not mutate `state`, perform I/O, or
consult a clock. Cost deduction, repeat counting, and circuit tripping happen in
`Governor.evaluate()`, which wraps it.

## 2. Precedence order (normative)

Checks run in this exact order. The **first** match returns; later checks are
never reached. This ordering is frozen in SP/1.0 — reordering it is a
breaking specification change.

| # | Condition | Verdict | Reason |
|---|---|---|---|
| 1 | `call.params` fails canonicalization | `DENY` | `policy_violation:malformed_input` |
| 2 | `state.circuit_tripped` is true | `DENY` | `circuit_open` |
| 3 | nonce already in `state.seen_nonces` | `DENY` | `policy_violation:duplicate_nonce` |
| 3b | duplicate nonce on a resume of an already-terminal transition | `DENY` | `policy_violation:duplicate_resume_no_effect` |
| 4 | `state.pending_transition.decision` is set | see §3 | `hitl_transition:*` |
| 5 | remaining budget insufficient for this call | `DENY` | `budget_exhausted` |
| 6 | repeat count for this tool exceeds `max_repeat_calls` | `DENY` | `max_repeat_exceeded` |
| 7 | `config.hitl_mode == "always"` | `HITL` | `hitl_all_calls` |
| 8 | `config.hitl_mode == "on_threshold"` and spend crosses the threshold | `HITL` | `budget_threshold` |
| 9 | context is opaque / untestable | `HITL` | `fail_closed:opaque_context` |
| 10 | none of the above | `ALLOW` | `within_thresholds` |

### Why step 2 precedes step 5

Once a circuit is tripped, the reason it tripped is already recorded in the
ledger. Re-evaluating budget afterwards would overwrite a specific historical
cause with a generic one. Circuit state is therefore checked before any
resource check.

### Why step 9 is HITL and not DENY

An opaque context means the gate cannot *evaluate* the call, not that the call
is known to be unsafe. Failing closed to `DENY` would make untestable contexts
permanently unreachable and push operators toward disabling the gate. Failing
closed to `HITL` keeps a human in the path while preserving a way forward. The
call still cannot proceed unattended, which is the property that matters.

Note the interaction: **step 7 (`hitl_mode == "always"`) is reached before step
9.** So with `hitl_mode="always"` and an opaque context, the surfaced reason is
`hitl_all_calls`, not `fail_closed:opaque_context`. Both are `HITL`, so the
outcome is identical; only the recorded reason differs. Implementations must not
reorder these to "improve" the reason string.

## 3. HITL transition contract (step 4)

When a human has ruled on a pending transition, that ruling is authoritative
and short-circuits every resource check below it.

| `pending_transition.decision` | Verdict | Reason |
|---|---|---|
| `approve` | `ALLOW` | `hitl_transition:approve` |
| `reject` | `DENY` | `hitl_transition:reject` |
| `modify` | `ALLOW` | `hitl_transition:modify_successor` |
| `defer` | `HITL` | `hitl_transition:defer` |
| `escalate` | `HITL` | `hitl_transition:escalate` |

A bounded timeout applies outside `decide()`: `Governor.hitl_timeout()`
resolves an unanswered prompt to `("DENY", "hitl_timeout")`. Absence of a human
answer is never treated as approval.

### Known limitation

`decide()` does not currently validate that a pending transition's nonce,
argument digest, and scope match the call being evaluated. An approval is
therefore bound to the pending transition record, not cryptographically bound
to a specific set of arguments. Until that binding exists, do not describe the
HITL path as replay-proof at the argument level. This is tracked in
[`ROADMAP.md`](ROADMAP.md).

## 4. Layers above `decide()`

`Governor.evaluate(tool_name, *, cost_usd, nonce, params, tags)` adds two layers,
and only when `decide()` returned `ALLOW`. A `DENY` or `HITL` from `decide()`
is never upgraded.

1. **Declarative rule veto** - `ShackleValidator` evaluates JSON rules from
   `data/shackle_rules/onitsir-baseline.shackle.json` (6 baseline rules,
   `SHACKLE-1` .. `SHACKLE-6`, standard version `onitsir-baseline-1.0`).
   Predicates: `any_tags`, `all_tags`, `forbid_environment`,
   `require_reversible_if_tags`. A matched rule produces
   `DENY shackle_rule_veto`.
2. **Additive ethics scoring** - `EthicsEngine` sums tag weights and compares
   against a threshold, producing `DENY ethics_below_threshold` when below.

**A hard veto always wins over a positive ethics score.** A high ethics total
can never outvote a matched veto rule. This mirrors ADROS's `SafetyKernel`.

Side effects in `evaluate()`, in order: cost is deducted and the repeat counter
incremented **before** `decide()` is called; a `DENY` sets
`state.circuit_tripped = True`; every ruling is appended to the audit ledger.

Because cost is deducted before the decision, a denied call still consumes
budget. That is intentional: it makes a hostile caller's retries expensive
instead of free.

## 5. Audit ledger

Every ruling appends a `LedgerEntry` to a hash-chained `AuditLedger`:

```
LedgerEntry(index, at, tool_name, verdict, reason, prev_hash, entry_hash,
            signature="", verify_key="")
```

- `prev_hash` of entry 0 is the genesis constant `"0" * 64`.
- `entry_hash` covers the entry contents and `prev_hash`, so any mutation or
  reordering breaks the chain and `verify()` returns false.
- With `signing_key_hex` supplied, each entry is additionally Ed25519-signed.
- Verifiable over HTTP at `GET /api/audit/{mission_id}/verify`.

The ledger is **tamper-evident, not tamper-proof.** It detects modification
after the fact. It does not prevent it, and it does not protect against an
attacker who can rewrite the whole chain including `entry_hash` values with
access to the signing key.

## 6. Canonicalization

`canonical_hash(params)` serializes with `sort_keys=True`,
`separators=(",", ":")`, `ensure_ascii=False`, `allow_nan=False`. Two
semantically identical parameter dicts therefore produce one digest regardless
of key order.

### Known limitations

- Non-canonical input is detected by a sentinel key rather than by attempting
  canonicalization and catching failure. A caller who does not set the sentinel
  can pass structurally odd input without triggering step 1.
- `ensure_ascii=False` means non-ASCII parameter values hash as UTF-8. This is
  correct and deliberate, but it is not covered by a published conformance
  vector, so cross-implementation agreement on non-ASCII input is untested.

Both are tracked in [`ROADMAP.md`](ROADMAP.md).

## 7. Conformance

`ConformanceRunner` executes published vectors from
`packages/onitsir-core/onitsir/conformance/vectors/`:

| Level | Clauses | Vectors | File |
|---|---|---|---|
| L1_IRON_LAW | `IL-1` .. `IL-4` | 5 | `iron_law.json` |
| L2_GOVERNANCE | `GV-1` .. `GV-4` | 4 | `governance.json` |
| L3_PROVIDER_CONTRACT | `PC-1` | 3 | `provider_contract.json` |

Total: **12 vectors across 9 clauses.** Run them with `onitsir conformance`.

`issue_certificate(report)` produces a self-descriptive dict with a `digest`;
`verify_certificate(cert)` recomputes it. A certificate attests that a named
implementation at a named version passed the published vectors on the machine
that ran them. **It is not an audit, an accreditation, or a security review,
and this project does not describe it as certification of anything beyond
vector conformance.**

## 8. What SHACKLE does not do

Stated explicitly, because the gap between "governed decision" and "enforced
constraint" is where governance claims usually overreach:

- It does not hold the protected capability. The caller still executes the tool
  after receiving `ALLOW`. The gate decides; it does not mediate.
- It does not issue scoped, single-use authorizations that the capability holder
  could verify independently.
- It does not prevent a caller from ignoring a `DENY` and calling the tool
  directly.
- It does not provide production security hardening, sandbox escape resistance,
  or custody guarantees.

What it does provide is a deterministic, reproducible, hash-chained record of
what was decided and why, verifiable by a third party from published vectors.
That is decision evidence. It is not enforced custody. Both properties are
worth having; conflating them is not.
