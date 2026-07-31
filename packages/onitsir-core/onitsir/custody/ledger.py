"""Custody ledger - an append-only record of every capability event.

Separate from `onitsir.shackle.AuditLedger` on purpose. The governance ledger
records *decisions*; this one records *capability lifecycle*: minted, spent,
refused. A reader auditing "was this call allowed to happen" needs the first;
a reader auditing "did anything execute without a capability" needs this one.

Each entry commits to the previous entry's hash, so a deletion or an edit
anywhere in the chain is detectable by `verify()`.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from hashlib import sha256
from typing import Any, Dict, List, Optional

GENESIS = "0" * 64

#: Every event kind the custody layer can record.
EVENT_MINTED = "capability_minted"
EVENT_SPENT = "capability_spent"
EVENT_REFUSED = "capability_refused"


@dataclass(frozen=True)
class CustodyEntry:
    index: int
    at: float
    event: str
    mission_id: str
    tool_name: str
    token_id: str
    detail: str
    prev_hash: str
    entry_hash: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "index": self.index,
            "at": self.at,
            "event": self.event,
            "mission_id": self.mission_id,
            "tool_name": self.tool_name,
            "token_id": self.token_id,
            "detail": self.detail,
            "prev_hash": self.prev_hash,
            "entry_hash": self.entry_hash,
        }


def _hash(
    index: int,
    at: float,
    event: str,
    mission_id: str,
    tool_name: str,
    token_id: str,
    detail: str,
    prev_hash: str,
) -> str:
    payload = "|".join(
        [str(index), f"{at:.6f}", event, mission_id, tool_name, token_id, detail, prev_hash]
    )
    return sha256(payload.encode("utf-8")).hexdigest()


@dataclass
class CustodyLedger:
    """Append-only, hash-chained custody log."""

    _entries: List[CustodyEntry] = field(default_factory=list)

    def append(
        self,
        event: str,
        *,
        mission_id: str,
        tool_name: str,
        token_id: str = "",
        detail: str = "",
    ) -> CustodyEntry:
        index = len(self._entries)
        prev_hash = self._entries[-1].entry_hash if self._entries else GENESIS
        at = time.time()
        entry = CustodyEntry(
            index=index,
            at=at,
            event=event,
            mission_id=mission_id,
            tool_name=tool_name,
            token_id=token_id,
            detail=detail,
            prev_hash=prev_hash,
            entry_hash=_hash(index, at, event, mission_id, tool_name, token_id, detail, prev_hash),
        )
        self._entries.append(entry)
        return entry

    def entries(self, mission_id: Optional[str] = None) -> List[CustodyEntry]:
        if mission_id is None:
            return list(self._entries)
        return [e for e in self._entries if e.mission_id == mission_id]

    def verify(self) -> bool:
        """Recompute the chain. Any mutation, reorder or truncation fails."""
        prev = GENESIS
        for index, entry in enumerate(self._entries):
            if entry.index != index or entry.prev_hash != prev:
                return False
            expected = _hash(
                entry.index,
                entry.at,
                entry.event,
                entry.mission_id,
                entry.tool_name,
                entry.token_id,
                entry.detail,
                entry.prev_hash,
            )
            if entry.entry_hash != expected:
                return False
            prev = entry.entry_hash
        return True

    def __len__(self) -> int:
        return len(self._entries)
