"""SP/1.0-Custody: server-side capability mediation for SHACKLE.

`onitsir.shackle` decides. This package *enforces*: a protected tool is
unreachable without a single-use, argument-bound capability, and the only
thing that can mint one is a decision layer that returned `ALLOW`.

    from onitsir.custody import CapabilityHolder, CustodyDaemon, ProtectedExecutor

    holder = CapabilityHolder()
    daemon = CustodyDaemon(holder)
    executor = ProtectedExecutor(holder)

    auth = daemon.authorize(governor, mission_id=mid, tool_name="email.send",
                            nonce="n-1", params={"to": "ops@example.com"})
    if auth.granted:
        executor.execute("email.send", mission_id=mid,
                         capability_token=auth.capability.token_id,
                         nonce="n-1", params={"to": "ops@example.com"})

Skipping `authorize()` does not skip the gate; it skips the *token*, and
`execute()` then raises `CapabilityRequired`.
"""
from .capability_holder import (
    Capability,
    CapabilityHolder,
    CapabilityInvalid,
    CapabilityRequired,
    CustodyError,
    DEFAULT_TTL_S,
)
from .daemon import Authorization, CustodyDaemon
from .executor import PROTECTED_TOOLS, ProtectedExecutor, UnknownTool, is_protected
from .ledger import (
    EVENT_MINTED,
    EVENT_REFUSED,
    EVENT_SPENT,
    CustodyEntry,
    CustodyLedger,
)

__all__ = [
    "Capability",
    "CapabilityHolder",
    "CapabilityInvalid",
    "CapabilityRequired",
    "CustodyError",
    "DEFAULT_TTL_S",
    "Authorization",
    "CustodyDaemon",
    "PROTECTED_TOOLS",
    "ProtectedExecutor",
    "UnknownTool",
    "is_protected",
    "EVENT_MINTED",
    "EVENT_REFUSED",
    "EVENT_SPENT",
    "CustodyEntry",
    "CustodyLedger",
]
