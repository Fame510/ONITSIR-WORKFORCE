"""SYNERGY #21: `HttpBridge` — the real network-call transport.

Ported in spirit from SINGULARITY's `RdmaTransport` (the "real fabric"
implementation opposite `InMemoryTransport`): calls agentosirus-web's
`/internal/execute-phase` endpoint (exposed by the Node/companion process)
over HTTP, per architecture doc section 2.3 item 4(a).
"""
from __future__ import annotations

import time
from typing import Any, Dict, Optional

import httpx

from .transport import Transport, TransportResult


class HttpBridge(Transport):
    name = "http"

    def __init__(self, base_url: str, timeout_s: float = 30.0, client: Optional[httpx.AsyncClient] = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s
        self._client = client

    async def send(self, phase: str, payload: Dict[str, Any]) -> TransportResult:
        t0 = time.perf_counter()
        client = self._client or httpx.AsyncClient(timeout=self.timeout_s)
        owns_client = self._client is None
        try:
            resp = await client.post(
                f"{self.base_url}/internal/execute-phase",
                json={"phase": phase, **payload},
            )
            resp.raise_for_status()
            result_payload = resp.json()
        finally:
            if owns_client:
                await client.aclose()
        dt = time.perf_counter() - t0
        return TransportResult(phase=phase, payload=result_payload, seconds=dt)
