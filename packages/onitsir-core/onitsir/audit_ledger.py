"""SYNERGY #9: audit ledger, extracted as its own module from shackle.py.

The `AuditLedger`/`LedgerEntry` implementation itself lives in `shackle.py`
(it is tightly coupled to `Governor` and imported from there throughout the
codebase for backward compatibility with ONITSIR's original single-file
layout). This module re-exports them under the dedicated name the
architecture doc calls for, so callers who want "just the ledger" without
pulling in the full Governor/decide() surface can do:

    from onitsir.audit_ledger import AuditLedger, LedgerEntry

Ed25519 signing (ported from AgentOmega's `AuditLedger`) is implemented in
`shackle.AuditLedger` — see that module's docstring for details.
"""
from __future__ import annotations

from .shackle import AuditLedger, LedgerEntry, GENESIS, canonical_hash

__all__ = ["AuditLedger", "LedgerEntry", "GENESIS", "canonical_hash"]
