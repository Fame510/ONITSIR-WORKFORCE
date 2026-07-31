"""SYNERGY #21: the Python<->TypeScript bridge, built on a `Transport`
abstraction ported from SINGULARITY's `singularity.transport` pattern
(InMemoryTransport vs. RdmaTransport -> here, LoopbackTransport vs.
HttpBridge)."""
from .transport import Transport, TransportResult
from .loopback import LoopbackTransport
from .http_bridge import HttpBridge

__all__ = ["Transport", "TransportResult", "LoopbackTransport", "HttpBridge"]
