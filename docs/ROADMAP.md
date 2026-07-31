# Roadmap

This document exists because [`docs/SHACKLE.md`](SHACKLE.md),
[`docs/API.md`](API.md) and [`SECURITY.md`](../SECURITY.md) each state a known
limitation and point here. Every item below is a limitation that is currently
real, described in the terms a reader would use to check whether it has been
fixed.

Nothing here is a promise of a date. Items are ordered by how much they
constrain what the project can honestly claim.

---

## 1. Enforced constraint, not only decided constraint

**Status: open. This is the most important item in this document.**

Today `decide()` returns a verdict and the caller is trusted to honour it. The
daemon holds the signing key but not the protected capability, so a caller that
ignores a `DENY` is not stopped by SHACKLE. That means the current, defensible
claim is about **decision evidence** — that given an input, the decision is
deterministic, reproducible, and recorded in a tamper-evident chain — and not
about **enforced constraint**.

This distinction was raised by an independent reviewer and it is correct. Until
this item closes, the project must not describe the executor as demonstrably
constrained.

Closing it requires the enforcement point to own the capability, so that
obtaining the capability is impossible without passing through the decision.
Concretely:

- a capability handle that is only mintable by the decision layer,
- the protected operation reachable only via that handle,
- and a conformance vector that demonstrates a caller *attempting* to bypass
  the decision and failing, rather than a caller choosing to comply.

## 2. Scoped, single-use, argument-bound authorization

**Status: open. Depends on item 1.**

A verdict is not currently bound to the arguments it was granted for. There is
no nonce-scoped, single-use, argument-digest-bound authorization, so an
`ALLOW` obtained for one set of arguments is not cryptographically tied to
them. Nonce replay is detected (precedence step 3), but that is duplicate
detection, not argument binding.

Closing it requires the verdict to carry a digest of the canonicalized
arguments and the enforcement point to reject a mismatch.

## 3. Canonicalization limitations

**Status: open, documented in [`docs/SHACKLE.md`](SHACKLE.md).**

Two known properties of `canonical_hash()`:

- **No Unicode normalization.** Two strings that a human reads as identical but
  which differ in Unicode composition hash differently.
- **Integer and float spellings differ.** `1` and `1.0` are distinct inputs and
  produce distinct hashes.

Both are currently *documented* rather than *fixed*, because changing either is
a specification change that would invalidate existing hashes. Any fix ships as
a specification version bump with vectors covering both spellings.

## 4. Server security posture

**Status: open, documented in [`SECURITY.md`](../SECURITY.md).**

`onitsir-server` has no authentication, no authorization and no rate limiting on
any route, including `WS /ws/mission/{id}`, and CORS is `*`. In order:

- authentication on every route including the WebSocket handshake,
- authorization so a caller can only read its own missions and ledgers,
- rate limiting,
- a CORS allowlist driven by configuration rather than `*`,
- validated request bodies for `/api/swarm/register` and
  `/api/swarm/heartbeat`, which currently take raw query parameters.

## 5. Durable mission state

**Status: open.**

Mission state is a single-process in-memory dict. It is lost on restart, is not
shared across workers, and grows without eviction. This makes the server
single-instance by construction. Closing it requires a real store plus a
migration path for the audit ledger so that chain verification still holds
across a restart.

## 6. Coverage measurement and a coverage gate

**Status: open.**

CI runs 257 tests across nine job instances but measures no coverage. There is
no `pytest-cov` run and no minimum-coverage gate, so "well tested" is currently
an assertion about test count rather than a measured property.

Planned: `pytest-cov` in CI, a published coverage number, and a floor that
fails the build when it drops.

## 7. Static security analysis in CI

**Status: open.**

A manual audit confirms no `eval`, `exec`, `os.system`, `subprocess` or
`pickle` anywhere in the Python source, and that the only environment variable
read by the core is `ONITSIR_SHACKLE_RULES`. That audit is not automated, so
nothing prevents a future commit from introducing one.

Planned: `bandit` as a CI job, and dependency vulnerability scanning.

## 8. Property-based testing

**Status: open.**

The current suites are example-based. Several properties are stated in
[`docs/SHACKLE.md`](SHACKLE.md) as invariants and would be better expressed as
generated properties, in particular:

- canonicalization is invariant under key and list-of-pairs reordering,
- the precedence order holds for every combination of simultaneously true
  conditions, not only the combinations currently enumerated,
- a hash chain of any length verifies, and any single mutation anywhere in it
  fails verification.

## 9. Persona bodies for the roster

**Status: open, and a live honesty constraint.**

`data/roster.json` carries 164 metadata records across 14 categories, but this
release includes **one** full persona markdown body. The CI roster smoke test
prints the indexed persona count directly, so the gap is visible rather than
hidden.

Until this closes, the project describes the roster as 164 *records*, never as
164 shipped personas.

## 10. Container and deployment gaps

**Status: partially closed.**

Closed in v1.0.0: the `onitsir-server` image previously copied `../onitsir-core`
from outside its build context, so it could not build; healthchecks now exist on
every service; named volumes now persist Prometheus data; `.dockerignore` files
exist; log rotation is configured.

Still open: no Grafana dashboards are provisioned automatically, alerting rules
are minimal, and no image is published to a registry.

## 11. Frontend robustness

**Status: open.**

No error boundary, so a render error blanks the page rather than degrading. No
consistent loading states. No keyboard shortcuts. No dark mode. Accessibility
has not been audited.

## 12. Specification governance process

**Status: partially closed.**

Closed in v1.0.0: the licensing split so third parties can implement and test
against the specification and fixtures without a copyleft obligation on their
own code; a governance document stating decision authority and the frozen
surface; the rule that a normative change requires a conformance vector.

Still open: no process for a third party to *register* a conformance claim, and
no versioning policy for the vector set independent of the software release.
