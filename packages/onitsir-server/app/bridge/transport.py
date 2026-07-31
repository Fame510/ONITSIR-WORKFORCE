"""SYNERGY #21: abstract `Transport` — the Python<->TypeScript bridge design.

Ported from SINGULARITY/singularity-python/singularity/transport/base.py's
shape (`Transport` ABC with `put`/`get`/`has`), re-targeted from "move KV
cache bytes between fabrics" to "move a mission phase's execution request
between the Python Engine and the TypeScript agentosirus-web execution
surface":

  - `LoopbackTransport` — in-process bridge for dev/tests (this repo's
    default; matches SINGULARITY's `InMemoryTransport`, always available).
  - `HttpBridge` — a real network call to agentosirus-web's
    `/internal/execute-phase` endpoint (matches SINGULARITY's
    `RdmaTransport`: the "real fabric" implementation).

Callers (the Engine's async verifier) depend only on this ABC, so the
interop mechanism can evolve (e.g. to a message-queue transport) without
touching caller code in either language — the same swap-without-caller-
changes guarantee SINGULARITY's Transport pattern provides.
"""
from __future__ import annotations

import abc
import time
from dataclasses import dataclass
from typing import Any, Dict


@dataclass
class TransportResult:
    """The result of bridging one phase's execution request across languages."""
    phase: str
    payload: Dict[str, Any]
    seconds: float


class Transport(abc.ABC):
    """Abstract transport backend for the Python<->TypeScript bridge."""

    name: str = "abstract"

    @abc.abstractmethod
    async def send(self, phase: str, payload: Dict[str, Any]) -> TransportResult:
        """Send a phase-execution request; return the execution result."""

    def close(self) -> None:  # pragma: no cover - optional hook
        pass


def timed(fn):
    """Small helper so both transports report `seconds` uniformly."""
    async def wrapper(self, phase: str, payload: Dict[str, Any]) -> TransportResult:
        t0 = time.perf_counter()
        result_payload = await fn(self, phase, payload)
        dt = time.perf_counter() - t0
        return TransportResult(phase=phase, payload=result_payload, seconds=dt)
    return wrapper
