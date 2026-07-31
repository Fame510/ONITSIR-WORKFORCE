# Deployment

Three ways to run this system, in increasing order of how much you should trust
it with real traffic.

**Read this first.** `onitsir-server` has no authentication, no authorization
and no rate limiting on any route, including the WebSocket endpoint, and CORS is
open to `*`. Anyone who can reach the port can create missions, read any
mission's audit ledger, submit human-in-the-loop decisions, and register swarm
agents. Every configuration below binds to loopback for that reason. Do not
expose it to an untrusted network without putting an authenticating proxy in
front. See [`SECURITY.md`](../SECURITY.md) and
[`ROADMAP.md`](ROADMAP.md) item 4.

---

## 1. Offline, no backend

The TypeScript surface answers `/api/*` in the browser via a `fetch` shim.
Nothing is governed by the real Governor in this mode — the offline evidence
check is a documented *mirror* of the Python producer, not an authority.

```bash
cd packages/agentosirus-web
npm ci
npm run dev
```

Use this for UI work and demos. Do not use it to make a claim about governance.

## 2. Local governed mode

Two processes: the Python server, and the frontend pointed at it. Every gated
action now goes through `onitsir-core`'s `decide()`.

```bash
# terminal 1
cd packages/onitsir-core
pip install -e ".[crypto]"        # crypto extra enables Ed25519 ledger signing
cd ../onitsir-server
pip install -e .
uvicorn app.main:app --host 127.0.0.1 --port 8000

# terminal 2
cd packages/agentosirus-web
npm ci
VITE_BACKEND_URL=http://localhost:8000 npm run dev
```

Confirm the server came up and the roster loaded:

```bash
curl -fsS http://localhost:8000/health
# {"status":"ok","roster_size":164}
```

A `roster_size` of `0` means the startup lifespan did not run. In tests this is
almost always a `TestClient(app)` used without the `with` block.

Install the `crypto` extra if you want signed ledger entries. Without `pynacl`
the ledger still hash-chains and still detects tampering; it just is not signed.

## 3. Full stack with Docker Compose

```bash
cd infra
docker compose up --build
```

This brings up five services. All ports bind to `127.0.0.1`.

| Service | Port | Purpose |
|---|---|---|
| `nginx` | 80 | Reverse proxy, so the browser talks to one origin |
| `onitsir-server` | 8000 | Governed engine, REST plus WebSocket |
| `agentosirus-web` | 4173 | Built frontend |
| `companion` | 8787 | Playwright and media actions, itself SHACKLE-gated |
| `prometheus` | 9090 | Metrics |

Use <http://localhost> rather than the individual ports; nginx proxies `/api/`
and `/ws/` to the server and everything else to the frontend, which avoids
cross-origin issues entirely.

### Build context, which matters here

`onitsir-server` installs `onitsir-core` from a sibling directory, so its build
context is the **repository root**:

```bash
docker build -f infra/Dockerfile.onitsir-server .
```

An earlier version of this Dockerfile used `COPY ../onitsir-core` with a
narrower context. Docker rejects any `COPY` that reaches outside the build
context, so that image never built. If you narrow the context, this breaks
again.

The other two images have package-local contexts:

```bash
docker build -f infra/Dockerfile.agentosirus-web packages/agentosirus-web
docker build -f infra/Dockerfile.companion packages/agentosirus-web/companion
```

### Volumes

- `../packages/onitsir-core/data` is mounted read-only into the server; it holds
  the roster and the SHACKLE rules file.
- `onitsir-state` is a named volume for server-side writable state.
- `prometheus-data` is a named volume. Without it, every restart discards all
  collected series.

Mission state itself is an in-memory dict inside the server process, so it does
not survive a restart regardless of volumes. See
[`ROADMAP.md`](ROADMAP.md) item 5.

### Health and logs

Every service declares a healthcheck, and `agentosirus-web`, `companion` and
`nginx` wait for their dependencies to report healthy rather than merely
started. All services use `json-file` logging capped at 10 MB with 5 rotations,
so a long-running stack cannot fill the disk with logs.

```bash
docker compose ps                       # health of each service
docker compose logs -f onitsir-server
```

---

## Configuration

### onitsir-server

| Variable | Default | Purpose |
|---|---|---|
| `ONITSIR_SHACKLE_RULES` | baseline rules bundled in the package | Path to the declarative JSON veto rules file |

That is the only environment variable the core reads. There is deliberately no
secret configuration.

### agentosirus-web

See [`packages/agentosirus-web/.env.example`](../packages/agentosirus-web/.env.example).

Every `VITE_`-prefixed variable is **inlined into the client bundle** and is
visible to anyone who loads the page. Provider API keys set that way are
exposed. To keep a provider key secret, proxy the call through the server
instead of setting it in the frontend.

---

## Production checklist

Work through this before putting the stack anywhere reachable.

- [ ] An authenticating reverse proxy sits in front of `onitsir-server`. There
      is no auth in the application itself, on REST or WebSocket routes.
- [ ] Rate limiting is enforced at the proxy. There is none in the application.
- [ ] CORS is restricted at the proxy. The application allows `*`.
- [ ] The WebSocket route is authenticated at the proxy, not only the REST
      routes. It is the easiest one to forget.
- [ ] Exactly one `onitsir-server` instance runs. Mission state is
      process-local, so a second replica silently serves a different view.
- [ ] No provider API key is set as a `VITE_` variable in a deployment where
      users should not see it.
- [ ] `pip install -e ".[crypto]"` was used if signed ledger entries are
      required. Note that the signing key lives in the same process as the
      ledger, so signing proves the chain was not altered by a *different*
      process, not that the owning process is honest.
- [ ] Prometheus has its named volume attached, or metrics history is
      understood to be disposable.
- [ ] `docker compose ps` reports every service healthy, not merely running.
- [ ] The roster count returned by `/health` matches expectations. A `0` means
      startup did not complete.
- [ ] Governance claims made about the deployment are limited to what
      [`docs/SHACKLE.md`](SHACKLE.md) actually supports. SHACKLE decides; it
      does not hold the protected capability and does not mediate the call.

## Troubleshooting

**`/health` reports `roster_size: 0`.** The startup lifespan did not run. With
`TestClient`, use `with TestClient(app) as client:`. In a deployment, check the
server logs for a roster load failure.

**`COPY failed: forbidden path outside the build context`.** You built
`Dockerfile.onitsir-server` with a context narrower than the repository root.
Build from the root.

**`npm ci` fails on a version mismatch.** `package.json` and
`package-lock.json` must agree. Both were realigned from `3.0.0` to `1.0.0` in
v1.0.0; if you bump one, bump both in the same commit.

**A DENY appears not to stop anything.** That is the documented behaviour.
SHACKLE returns a verdict; it does not own the capability. See
[`ROADMAP.md`](ROADMAP.md) item 1.
