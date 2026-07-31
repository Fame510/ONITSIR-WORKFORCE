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
| 3c | duplicate nonce matching the pending transition binding exactly | falls through to 4 | - |
| 4 | `state.pending_transition.decision` is set | see §3 | `hitl_transition:*` |
| 4b | pending transition set but not bound to this call | `DENY` | `policy_violation:hitl_binding_mismatch` |
| 5 | remaining budget insufficient for this call | `DENY` | `budget_exhausted` |
| 6 | repeat count for this tool exceeds `max_repeat_calls` | `DENY` | `max_repeat_exceeded` |
| 7 | `config.hitl_mode == "always"` | `HITL` | `hitl_all_calls` |
| 8 | `config.hitl_mode == "on_threshold"` and spend crosses the threshold | `HITL` | `budget_threshold` |
| 9 | context is opaque / untestable | `DENY` | `fail_closed:opaque_context` |
| 10 | none of the above | `ALLOW` | `within_thresholds` |

### Why step 2 precedes step 5

Once a circuit is tripped, the reason it tripped is already recorded in the
ledger. Re-evaluating budget afterwards would overwrite a specific historical
cause with a generic one. Circuit state is therefore checked before any
resource check.

### Why step 9 is DENY and not HITL

An opaque context means the gate cannot *evaluate* the call. Earlier revisions
of this specification failed closed to `HITL` on the reasoning that an
unevaluable call is not a known-unsafe call, and that a human should decide.

That reasoning does not survive contact with what the human is actually shown.
A HITL prompt presents the operator with the call's arguments and asks them to
approve it. When the context is opaque, those are precisely the arguments the
gate could not read. The operator is therefore asked to underwrite a decision
on evidence the system has already declared unreadable, and their approval
carries an authority the underlying evidence does not support. Step 9 now
returns `DENY`.

The recovery path is to make the context evaluable and resubmit, not to ask a
human to vouch for an unreadable one.

Detection is structural. `has_opaque_context()` scans the whole parameter tree
for an opacity marker (`ctx`, `context` or `__context__` set to `opaque`,
`untestable`, `unknown` or `unverifiable`, compared case-insensitively) rather
than testing `params["ctx"] == "opaque"` at the top level only. A nested or
differently-spelled marker previously passed the gate entirely.

Note the interaction: **step 7 (`hitl_mode == "always"`) is still reached
before step 9.** With `hitl_mode="always"` and an opaque context, the surfaced
verdict is `HITL` with reason `hitl_all_calls`. Since step 9 now denies, these
two steps no longer produce the same verdict, so the ordering is
outcome-bearing rather than cosmetic. Implementations must not reorder them.

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

### Binding (normative)

A pending transition is honoured **only** when it is bound to the call being
evaluated. The record must carry all three binding fields and each must match:

| Field | Must equal |
|---|---|
| `tool_name` | `call.tool_name` |
| `nonce` | `call.nonce` |
| `args_digest` | `canonical_hash(call.params)` |

A record missing any binding field, or whose fields do not match, produces
`DENY policy_violation:hitl_binding_mismatch`. A record carrying a decision
string outside the table above produces `DENY
policy_violation:hitl_unknown_decision`. Neither is treated as an approval.

Consequences worth stating explicitly, because each was previously possible:

- Approving a call to `payments.transfer` with `{"amount": 1}` does not
  authorise the same tool with `{"amount": 1000000}`.
- Approving a call to one tool does not authorise a different tool.
- An approval authorises **one** call. `Governor.evaluate()` retires the
  pending record as soon as `decide()` consumes a terminal decision, so the
  next call is evaluated on its own merits. Previously a single approval stayed
  live for the remainder of the mission and short-circuited every resource
  check below step 4.

`Governor.request_hitl(tool_name, reason, *, nonce=None, params=None)` captures
the binding when the prompt is raised. `nonce` and `params` are
keyword-optional, so a two-argument call binds to `nonce=None` and the digest
of an empty parameter set.

### Interaction with the replay check (step 3)

The approved call carries the nonce it was approved under, and that nonce is
already in `seen_nonces` from the evaluation that raised the prompt. A naive
duplicate-nonce check would therefore deny the very call the operator just
approved. Step 3 makes one narrow exception: a repeated nonce falls through to
step 4 **only** when the call matches the pending binding exactly. Every other
repeated nonce is still `DENY policy_violation:duplicate_nonce`.

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

`canonical_hash()` is implemented in `onitsir/canonical.py` and re-exported
from `onitsir/shackle.py`, so existing imports from either module resolve to
the same function.

### Validation (normative)

`assert_canonicalizable(params)` walks the whole structure and raises
`NonCanonicalInput` (a `ValueError` subclass) when the input has no single
unambiguous JSON encoding. It refuses:

| Input | Why |
|---|---|
| `NaN`, `+Infinity`, `-Infinity` | no JSON literal; `allow_nan=True` would emit non-standard tokens |
| non-string mapping keys | `{1: "a"}` and `{"1": "a"}` would share one digest |
| tuples | `(1, 2)` and `[1, 2]` would share one digest |
| circular references | no terminating encoding |
| nesting beyond 64 levels | bounded so canonicalization cannot be turned into stack exhaustion |
| any other type | no defined encoding |

Step 1 of `decide()` calls this. Detection therefore no longer depends on a
caller volunteering `params["__noncanonical__"] = True`; that sentinel is still
honoured as an explicit caller-side marker, so callers and published vectors
written against the previous surface behave identically.

### Remaining limitation

`ensure_ascii=False` means non-ASCII parameter values hash as UTF-8. This is
correct and deliberate, and it is pinned by
`tests/test_canonicalization.py`, but it is not covered by a published
conformance vector, so cross-implementation agreement on non-ASCII input
remains untested by the vector suite. Canonicalization is byte-level, not
Unicode-NFC: composed and decomposed spellings of the same grapheme produce
different digests. An implementation that normalizes would disagree with this
one.

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

## 8. Custody (SP/1.0-Custody)

`decide()` is the decision surface. It does not, by itself, stop a caller that
ignores it. `onitsir.custody` is the enforcement point that does, and this
section is normative for it.

### The rule

A tool in `onitsir.custody.PROTECTED_TOOLS` MUST NOT execute unless a
capability minted for that exact call is redeemed first. The only thing that
may mint a capability is a decision layer that returned `ALLOW`.

### Capability binding (normative)

| Field | Must equal |
|---|---|
| `mission_id` | the mission the call is being made in |
| `tool_name` | the tool being executed |
| `nonce` | the nonce the decision was made for |
| `args_digest` | `canonical_hash(params)` of the arguments approved |
| `expires_at` | a wall-clock instant in the future |

All five fields, plus `token_id`, are covered by an HMAC-SHA256 signature over
a deterministic sorted `key=value` encoding joined by `\x1f`. Editing any
field invalidates the signature.

### Refusal reasons (normative)

| Reason | Condition |
|---|---|
| `missing` | a protected tool was called with no capability |
| `replayed` | the token is unknown or has already been spent |
| `expired` | `expires_at` is in the past |
| `mission_mismatch` | the capability was minted for another mission |
| `tool_mismatch` | the capability was minted for another tool |
| `nonce_mismatch` | the capability was minted for another nonce |
| `args_mismatch` | the presented arguments do not hash to `args_digest` |
| `bad_signature` | the signature does not verify under the custody key |

Over HTTP, every one of these is `403` from
`POST /api/mission/{id}/execute`.

### Single use

The token is removed from the live set **before** any binding check. A token
presented against the wrong call is therefore burned rather than left
available for a second, better-aimed attempt. This is strictly stronger than
the precedence-step-3 nonce check, which detects a duplicate; here the token
no longer exists.

### Custody ledger

Every mint, spend and refusal is appended to a hash-chained custody ledger,
separate from the governance `AuditLedger`. The governance ledger answers
"what was decided". The custody ledger answers "did anything execute without
passing through the gate". Readable at `GET /api/mission/{id}/custody`.

### Revocation

A verdict that trips the circuit revokes every outstanding capability for that
mission. A capability minted under an assumption that no longer holds must not
remain redeemable.

## 9. What SHACKLE does not do

Stated explicitly, because the gap between "governed decision" and "enforced
constraint" is where governance claims usually overreach:

- Custody covers the tools in `PROTECTED_TOOLS`. A tool outside that set
  executes without a capability by design, so the contents of that set are
  part of the security posture.
- The capability holder, the mission registry and both ledgers are
  per-process and in-memory. The guarantee does not survive a restart and is
  not shared across workers. See [`ROADMAP.md`](ROADMAP.md) item 5.
- There is **no conformance vector for custody**. The 12 published vectors
  cover the decision surface. The bypass-resistance claim rests on this
  repository's own tests, and no third party has verified it.
- It does not authenticate the caller. `onitsir-server` still has no
  authentication, authorization or rate limiting, so custody constrains what
  a caller may execute, not who may call. See [`ROADMAP.md`](ROADMAP.md)
  item 4.
- Both ledgers are tamper-**evident**, not tamper-proof. When signing is
  enabled the key lives in the same process as the ledger it signs.
- It does not provide sandbox escape resistance or production security
  hardening.

What it does provide is a deterministic, reproducible, hash-chained record of
what was decided and why, verifiable by a third party from published vectors,
**and** an in-process enforcement boundary that a protected call cannot reach
around. The first is decision evidence and is independently checkable. The
second is enforced custody and, so far, is not.
