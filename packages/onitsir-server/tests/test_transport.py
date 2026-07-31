"""Transport abstraction (SYNERGY #21) -- LoopbackTransport tests."""
import asyncio

import pytest

from app.bridge.loopback import LoopbackTransport
from app.bridge.transport import Transport, TransportResult


def test_loopback_transport_default_handler_returns_passing_result():
    transport = LoopbackTransport()
    result = asyncio.run(transport.send("intake", {}))
    assert isinstance(result, TransportResult)
    assert result.payload["passed"] is True
    assert result.phase == "intake"


def test_loopback_transport_custom_handler():
    async def handler(phase, payload):
        return {"command": f"custom:{phase}", "output": "custom output", "passed": phase != "verify"}

    transport = LoopbackTransport(handler=handler)
    result = asyncio.run(transport.send("build", {}))
    assert result.payload["passed"] is True

    result2 = asyncio.run(transport.send("verify", {}))
    assert result2.payload["passed"] is False


def test_loopback_transport_reports_elapsed_seconds():
    transport = LoopbackTransport()
    result = asyncio.run(transport.send("spec", {}))
    assert result.seconds >= 0


def test_transport_is_abstract():
    with pytest.raises(TypeError):
        Transport()  # cannot instantiate the ABC directly


def test_loopback_transport_is_a_transport_instance():
    transport = LoopbackTransport()
    assert isinstance(transport, Transport)
