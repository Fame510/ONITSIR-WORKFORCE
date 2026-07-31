"""onitsir-server — FastAPI bridge exposing onitsir-core over agentosirus's
existing /api/* contract, plus new governed mission routes (SYNERGY #5).

This package contains no governance logic of its own. Every ALLOW/DENY/HITL
ruling is produced by onitsir-core's `decide()`; the routes here only marshal
requests into it and serialise the result.

Nothing is imported eagerly at package import time: `app.main` pulls in FastAPI
and loads the roster from disk, so importing it as a side effect of
`import app` would make lightweight imports (for example `app.schemas` in a
type-only context) unnecessarily expensive. Import the submodule you need:

    from app.main import app          # the ASGI application
    from app.schemas import GateRequest

`__all__` therefore names submodules rather than re-exported objects.
"""

__all__ = [
    "bridge",
    "main",
    "routes",
    "schemas",
]
