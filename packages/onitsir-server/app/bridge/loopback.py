"""SYNERGY #21: `LoopbackTransport` — in-process bridge for dev/tests.

Ported in spirit from SINGULARITY's `InMemoryTransport`: no network hop, the
"execution" is a direct in-process callable. Used by onitsir-server's own
test suite and by any single-process deployment where agentosirus-web's
execution logic has been ported to run inside the same Python process
(e.g. a pure-Python demo verifier), so the Engine's `run_async()` never has
to special-case "am I bridging or not".
"""
from __future__ import annotations

import time
from typing import Any, Awaitable, Callable, Dict

from .transport import Transport, TransportResult

Handler = Callable[[str, Dict[str, Any]], Awaitable[Dict[str, Any]]]


async def _default_handler(phase: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """A safe, deterministic default: 'executes' a phase by producing a
    trivially-passing result. Real deployments pass a real `handler` that
    actually invokes agentosirus's llm.ts logic or a shared execution layer."""
    return {
        "command": f"loopback:{phase}",
        "output": f"[{phase}] loopback demo check: 1 passed, 0 failed",
        "passed": True,
    }


class LoopbackTransport(Transport):
    name = "loopback"

    def __init__(self, handler: Handler | None = None) -> None:
        self._handler = handler or _default_handler

    async def send(self, phase: str, payload: Dict[str, Any]) -> TransportResult:
        t0 = time.perf_counter()
        result_payload = await self._handler(phase, payload)
        dt = time.perf_counter() - t0
        return TransportResult(phase=phase, payload=result_payload, seconds=dt)
