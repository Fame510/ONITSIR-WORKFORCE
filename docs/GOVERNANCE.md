# Governance

How decisions get made about this repository, and how the governed runtime
inside it makes decisions. Two different things share the word "governance";
this document separates them.

- **Project governance** - who decides what ships. Sections 1-4.
- **Runtime governance** - how the Shackle Governor decides whether a tool call
  may run. See [`SHACKLE.md`](SHACKLE.md) for the normative decision surface.

---

## 1. Decision authority

This is a single-maintainer project. Dante Bullock holds final authority over
the specification, the conformance vectors, the license split, and the release
tag. There is no committee and no vote.

That is a deliberate choice, not a placeholder. A conformance standard whose
normative text can be edited by consensus is not a stable target for
implementers. The specification is versioned instead: SP/1.0 is frozen, and
disagreements are resolved by proposing SP/1.1, not by amending SP/1.0.

## 2. What is frozen and what is not

| Surface | Stability | How it changes |
|---|---|---|
| `decide()` precedence order | **Frozen in SP/1.0** | new minor spec version only |
| `Verdict` value set (`ALLOW`/`DENY`/`HITL`) | **Frozen in SP/1.0** | new major spec version only |
| `DenyReason` value set | Additive only | new values may be added in a minor version; existing values never change meaning |
| Conformance vector IDs (`IL-*`, `GV-*`, `PC-1`) | **Frozen** | vectors may be added; an existing ID never changes its expectation |
| Python/TypeScript module layout | Unstable | any release |
| HTTP route paths under `/api/*` | Stable within a major | additive within a major version |
| UI components | Unstable | any release |

If you are building against this repository, depend on the frozen rows and
pin a version for everything else.

## 3. Changes that require a specification version bump

A change is **normative** and needs a spec version bump if it could cause a
previously-conformant implementation to start failing, or a previously
non-conformant one to start passing:

- reordering `decide()` precedence
- changing the verdict returned for an existing input class
- changing the meaning of an existing `DenyReason`
- changing an existing conformance vector's `expect` block
- adding a mandatory clause

A change is **non-normative** and does not need a bump if it only affects
implementation detail: performance, logging, type hints, docstrings, UI, new
optional configuration that defaults to current behavior, or additional
vectors that test already-specified behavior.

## 4. Contribution acceptance criteria

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for the mechanics. The governance
constraints on what can be accepted:

1. **No second implementation of `decide()`.** The Python function in
   `packages/onitsir-core/onitsir/shackle.py` is the single canonical
   implementation. TypeScript mirrors the *value sets* for display only, and CI
   enforces that with a type-drift check. A pull request that adds decision
   logic to TypeScript will be rejected regardless of quality.
2. **Normative changes need a vector.** If you change governed behavior, the
   pull request must include or update a conformance vector that fails before
   your change and passes after.
3. **No verification claims without evidence.** Claims in a pull request
   description about test results must be reproducible from CI, not from a
   local run. This is the same Iron Law the runtime enforces on itself.
4. **License split is respected.** Code contributions are AGPL-3.0.
   Specification contributions are CC BY 4.0. Fixture contributions are
   Apache-2.0. Contributions that mix the three in one file will be asked to
   split.

## 5. Security issues

Do not open a public issue. See [`../SECURITY.md`](../SECURITY.md).

## 6. Conformance claims by third parties

Anyone may run the conformance suite and publish the result. The fixtures are
Apache-2.0 precisely so this needs no permission.

What is **not** permitted is describing a third-party review as a
certification, an accreditation, or an endorsement by this project. The suite
reports pass/fail against published vectors; it does not certify security,
production-readiness, or custody properties. See the Independent Verification
section of the [README](../README.md) for how this project states its own
verification status, and hold third-party claims to the same standard.
