# Contributing

Thanks for looking. This is a single-maintainer project with a deliberately
narrow contribution surface, because the value of the SHACKLE governance
surface comes from there being exactly one implementation of it.

Read [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md) first — it states who decides
what, and which parts of the surface are frozen.

## Development setup

You need Python 3.10+ and Node 20+.

```bash
git clone https://github.com/Fame510/ONITSIR-WORKFORCE.git
cd ONITSIR-WORKFORCE

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
npm ci                 # ci, not install — the lockfile is authoritative
npm run test
npx tsc --noEmit
npm run conformance:check
```

## Before you open a pull request

Run everything CI runs. There are nine CI job instances and the merge gate
requires all of them:

```bash
# in packages/onitsir-core
python -m pytest tests/ -v

# in packages/onitsir-server
python -m pytest tests/ -v

# in packages/agentosirus-web
npm run build:index && npm run test && npx tsc --noEmit && npm run conformance:check && npm run build

# from the repository root
node infra/scripts/sync-shackle-types.mjs --check
```

CI also runs the Python suites against 3.10, 3.11 and 3.12. If your change is
version-sensitive, say so in the pull request.

## Hard rules

These are not stylistic preferences. A pull request that breaks one of them
will be declined regardless of quality.

1. **Never add a second implementation of `decide()`.** `onitsir-core`'s
   `shackle.py` is the single canonical governance implementation.
   `agentosirus-web` mirrors verdict *types* for display only, and the
   `shackle type drift check` CI job fails the build if
   `app/schemas.py` and `src/types.ts` drift apart. If you change one, change
   the other in the same commit.
2. **A change to normative behaviour requires a conformance vector.** If you
   change what `decide()` returns for some input, add or amend a vector under
   `packages/onitsir-core/onitsir/conformance/vectors/` in the same pull
   request. A behaviour change with no vector is not reviewable.
3. **Precedence order is normative.** The ten-step order in
   [`docs/SHACKLE.md`](docs/SHACKLE.md) is part of the specification. Reordering
   steps is a specification change, not a refactor, and needs its own
   discussion before code.
4. **A hard veto can never be outvoted by a positive ethics score.** If your
   change lets a positive score override a veto, it is wrong.
5. **Do not weaken the Iron Law.** Evidence must stay fresh and passing.
   Widening what counts as passing evidence needs a test proving what is still
   rejected.
6. **The offline mirror must stay a mirror.** `src/lib/evidenceMirror.ts`
   reproduces the Python evidence pre-filter. If you touch the Python producer's
   refusal markers, minimum length, or tokenizer, update the mirror and its
   tests in the same commit. A silent divergence there lets offline mode accept
   evidence the real gate would reject — this has already happened once and is
   why the mirror was extracted into its own tested module.
7. **No new runtime dependency without a reason in the pull request.** The
   Python core depends on `pydantic` alone, with `pynacl` optional.
8. **Do not add `@types/node`** to `agentosirus-web` casually. It is
   deliberately absent; `vite.config.ts` uses a file-scoped `declare const
   process`. Adding it means regenerating the lockfile.
9. **Do not commit secrets.** `.env`, `.env.*`, `*.pem` and `*.key` are
   gitignored. Keep it that way.

## Tests

New behaviour needs a test that fails before your change and passes after.

- Python tests live in `packages/*/tests/` as `test_*.py` with `def test_*`
  functions.
- Frontend tests must live under `packages/agentosirus-web/src/**/__tests__/`
  and end in `.test.ts`. That glob is what `vitest.config.ts` includes; a test
  placed anywhere else will silently never run.
- Prefer injecting a clock over sleeping. The swarm tests take an explicit
  `now` for exactly this reason, and the suite should stay fast.
- Test the rejection path, not only the happy path. Most of the value in a
  fail-closed system is in what it refuses.

## Documentation

If you change behaviour that `docs/SHACKLE.md` or `docs/API.md` documents,
update the document in the same commit. Both documents carry explicit
"known limitations" sections; if your change removes a limitation, remove it
from the list, and if it adds one, add it. Silently outdated normative
documentation is worse than none.

## Commit and pull request style

- Present tense, imperative subject line, wrapped at 72 characters.
- Explain *why* in the body, not just what.
- One logical change per pull request.
- If you found a bug in existing behaviour, say what the wrong behaviour was
  and how you confirmed the new behaviour is right.

## Licensing of contributions

By opening a pull request you agree your contribution is licensed under the
same terms as the part of the repository it touches: AGPL-3.0-or-later for
code, CC BY 4.0 for specification documents under `docs/`, and Apache-2.0 for
the conformance vectors. See [`NOTICE.md`](NOTICE.md).

## Security

Do not report vulnerabilities through issues or pull requests. See
[`SECURITY.md`](SECURITY.md).
