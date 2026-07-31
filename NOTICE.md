# NOTICE

ONITSIR-WORKFORCE © 2026 Dante Bullock. Code licensed under AGPL-3.0. Specification documents under CC-BY 4.0. Conformance fixtures under Apache-2.0.

## Attribution string

When citing, vendoring, or re-publishing any part of this repository, use the
line above verbatim.

## License split

This repository is deliberately licensed in three parts. The split exists so
that the governance *standard* can be adopted freely while the *implementation*
stays reciprocal.

| Part | Files | License | File |
|---|---|---|---|
| Code | everything under `packages/`, `infra/`, `.github/` except the fixtures listed below | AGPL-3.0-or-later | [`LICENSE`](LICENSE) |
| Specification | `docs/*.md` | CC BY 4.0 | [`LICENSE-SPEC`](LICENSE-SPEC) |
| Conformance fixtures | `packages/onitsir-core/onitsir/conformance/vectors/*.json` | Apache-2.0 | [`LICENSE-FIXTURES`](LICENSE-FIXTURES) |

A commercial license for the code is available separately; contact the copyright
holder. The specification and fixture licenses are not negotiable and are not
withdrawn by any commercial arrangement.

### Why the code is AGPL-3.0 and not MIT

Earlier internal drafts of `onitsir-core` carried an MIT license header. That
was corrected to AGPL-3.0 in v1.0.0. A governance engine distributed under a
permissive license can be silently stripped of its enforcement path by a
downstream network service, which defeats the purpose of the artifact. AGPL-3.0
keeps modifications to the governed execution path visible to the people whose
actions it governs.

### Why the specification is CC BY 4.0

A conformance standard has no value if implementers cannot quote it, embed it,
or ship a competing implementation against it. The specification corpus is
therefore separated from the code and licensed for reuse with attribution only.

### Why the fixtures are Apache-2.0

Conformance vectors must be vendorable into third-party test suites, including
proprietary ones. Apache-2.0 permits that and adds an explicit patent grant,
which CC BY does not.

## Third-party components

This repository ports and adapts modules from the following upstream
repositories by the same author. Every ported module carries an inline comment
naming its source file and synergy number.

- [ONITSIR](https://github.com/Fame510/ONITSIR) - governed execution core
- [agentosirus](https://github.com/Fame510/agentosirus) - execution surface and UI
- [ADROS](https://github.com/Fame510/ADROS) - declarative rule veto, ethics scoring, swarm coordinator, conformance framing
- [SINGULARITY](https://github.com/Fame510/SINGULARITY) - context tiering, transport abstraction, telemetry separation
- [morphic-kernel](https://github.com/Fame510/morphic-kernel) - capability-gated sandbox, deterministic-collapse filter, local hash-chained ledger
- [AgentOmega](https://github.com/Fame510/AgentOmega) - bounded-timeout HITL, governed browser automation
- [Dux](https://github.com/Fame510/Dux) - research evidence contract

Runtime dependencies retain their own licenses; see
`packages/*/pyproject.toml` and `packages/agentosirus-web/package.json`.
