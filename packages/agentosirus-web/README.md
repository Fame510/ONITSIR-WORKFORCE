# agentosirus-web

The execution surface and human interface of
[ONITSIR-WORKFORCE](https://github.com/Fame510/ONITSIR-WORKFORCE) — the
TypeScript half of the system.

It runs in two modes:

- **Offline / static** — `src/lib/apiShim.ts` patches `window.fetch` and answers
  `/api/*` locally from the built agent index. No backend required.
- **Governed** — set `VITE_BACKEND_URL` and the same calls go to
  `onitsir-server`, so every action passes through the SHACKLE Governor.

## Requirements

Node 20 or newer (CI uses Node 20).

## Install and run

```bash
npm ci                                              # use ci, not install: the lockfile is authoritative
npm run dev                                         # offline mode
VITE_BACKEND_URL=http://localhost:8000 npm run dev  # governed mode
npm run build                                       # production build
```

`npm run dev` and `npm run build` both run `build:index` first, which generates
the agent index and `roster.json` from the persona sources.

## Scripts

| Script | What it does |
|---|---|
| `build:index` | Regenerate the unified agent index and `roster.json` |
| `dev` | Build the index, then start Vite |
| `build` | Build the index, then produce a production bundle |
| `preview` | Serve the production bundle |
| `lint` | `tsc --noEmit` strict type-check |
| `test` | Vitest suite |
| `test:diagnostic` | Vitest with the verbose reporter |
| `conformance:check` | TypeScript-side provider contract conformance check |

## Environment

Copy `.env.example` to `.env.local` and fill in what you need. Every variable is
optional; without `VITE_BACKEND_URL` the app runs fully offline.

Provider API keys are read in the browser. Treat any key you paste into this
app as exposed to the browser session, and never commit `.env.local`.

## Governance mirroring rule

This package must never re-implement a governance decision. `src/types.ts`
mirrors the verdict and deny-reason unions from
`onitsir-server/app/schemas.py` for display purposes only, and the
`shackle type drift check` CI job fails the build if the two drift apart.

`src/lib/evidenceMirror.ts` is the one deliberate exception: it reproduces the
Python evidence pre-filter so offline mode can reject bad evidence without a
backend. It is a *mirror*, not an authority — it is unit-tested against the
Python producer's documented semantics precisely because a silent divergence
there would let offline mode accept evidence the real Iron Law would reject.

## Tests

```bash
npm run test
```

Test files live in `src/**/__tests__/` and must end in `.test.ts`; that glob is
what `vitest.config.ts` includes.

## Licensing

AGPL-3.0-or-later. See [`NOTICE.md`](../../NOTICE.md).
