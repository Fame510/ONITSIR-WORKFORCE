# Security Policy

## Reporting a vulnerability

Report security issues privately. Do **not** open a public issue, discussion,
or pull request for a vulnerability.

Use GitHub's private vulnerability reporting on this repository:
<https://github.com/Fame510/ONITSIR-WORKFORCE/security/advisories/new>

Please include:

- the affected package (`onitsir-core`, `onitsir-server`, `agentosirus-web`) and
  commit SHA,
- what an attacker gains,
- a minimal reproduction,
- whether the issue is reachable through a default configuration.

You will get an acknowledgement, and either a fix, a documented mitigation, or
a reasoned decline. This is a single-maintainer project; there is no paid
support contract and no bug bounty.

## Supported versions

| Version | Supported |
|---|---|
| `main` | Yes |
| v1.0.0 | Yes |
| anything earlier | No |

Fixes land on `main`. There are no backport branches.

## Current security posture — read this before deploying

This release is honest about not being production-hardened. The following are
**known, unfixed, by-design-for-now** properties, not vulnerabilities to
report:

### onitsir-server

1. **No authentication or authorization on any route**, including
   `WS /ws/mission/{id}`. Anyone who can reach the port can create missions,
   read any mission's audit ledger, submit HITL decisions, and register swarm
   agents.
2. **No rate limiting.** Any route can be called in an unbounded loop.
3. **CORS is `allow_origins=["*"]`** with all methods and headers allowed.
4. **Mission state is a single-process in-memory dict.** It is lost on restart,
   is not shared across workers, and grows without eviction.
5. `/api/swarm/register` and `/api/swarm/heartbeat` take raw query parameters
   rather than validated request bodies.

Do not expose `onitsir-server` to an untrusted network. Run it behind an
authenticating reverse proxy on a private network. These items are tracked in
[`docs/ROADMAP.md`](docs/ROADMAP.md).

### agentosirus-web

6. Any `VITE_`-prefixed variable is **inlined into the client bundle** and is
   visible to anyone who loads the page. Provider API keys set that way are
   exposed. To keep a key secret, proxy the provider call through
   `onitsir-server` instead.

### SHACKLE governance — scope of the guarantee

SHACKLE is a **decision** surface, not an enforcement boundary. Read
[`docs/SHACKLE.md`](docs/SHACKLE.md) in full before relying on it. Specifically:

7. `decide()` returns a verdict. It **does not hold the protected capability**
   and does not mediate the call. A caller that ignores a `DENY` is not
   stopped by SHACKLE; the enforcement has to live in the layer that owns the
   capability.
8. Verdicts are **not bound to specific arguments**. There is no nonce-scoped,
   single-use, argument-digest-bound authorization, so an `ALLOW` obtained for
   one set of arguments is not cryptographically tied to them.
9. The audit ledger is **tamper-evident, not tamper-proof.** It detects
   modification, reordering and truncation of the chain once you call
   `verify()`. It does not prevent a process that owns the ledger object from
   rewriting it, and when a signing key is present, that key lives in the same
   process.

Reports that SHACKLE "can be bypassed by not calling it" describe items 7-8,
which are documented above and in `docs/SHACKLE.md`. Reports of a way to make
`verify()` return `True` on a chain that was actually altered are genuine
vulnerabilities — please report those.

## What is already covered

- No `eval`, `exec`, `os.system`, `subprocess` or `pickle` anywhere in the
  Python source.
- The only environment variable read by the core is
  `ONITSIR_SHACKLE_RULES` (a rules file path).
- `.env`, `.env.*`, `*.pem` and `*.key` are gitignored.
- No credentials are committed to this repository.

## Third-party conformance claims

Passing the published conformance vectors means an implementation reproduces
those vectors. It is not a security certification, and it is not an
endorsement. See [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md).
