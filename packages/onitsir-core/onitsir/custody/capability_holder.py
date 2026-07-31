"""The capability holder - the enforcement point SHACKLE previously lacked.

## Why this module exists

Before this, `decide()` returned a verdict and the caller was trusted to
honour it. The project could therefore claim *decision evidence* - that a
decision is deterministic, reproducible and recorded - but not *enforced
constraint*, because a caller that ignored a `DENY` was not stopped. That is
`docs/ROADMAP.md` item 1, and it is the item every other honesty caveat in
the repository points at.

The fix is structural rather than procedural: the protected operation is not
reachable without a capability, and the only thing that can mint a capability
is the decision layer. Ignoring a `DENY` no longer gets you a slap on the
wrist; it gets you no token, and no token means `CapabilityRequired`.

## The binding

A capability is minted for exactly one call and carries five bound fields:

| Field | Why it is bound |
|---|---|
| `mission_id` | a token from one mission cannot act in another |
| `tool_name` | a token for `docs.read` cannot invoke `payments.transfer` |
| `nonce` | ties the token to one attempt, not to a tool in general |
| `args_digest` | `canonical_hash` of the parameters actually approved |
| `expires_at` | a token cannot be banked and replayed later |

The HMAC covers all five, so editing any of them invalidates the signature.
Because `args_digest` is bound, this also closes `docs/ROADMAP.md` item 2:
an `ALLOW` obtained for one set of arguments is cryptographically useless for
another.

## Single use

A token is removed from the live set the moment it is redeemed, before the
protected operation runs. A second presentation of the same token is refused
as `replayed`, whether it arrives from a retry, a race or an attacker. This
is stricter than the governance-layer nonce check, which detects a duplicate;
here the token simply no longer exists.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional

from ..canonical import NonCanonicalInput, canonical_hash
from . import signing
from .ledger import EVENT_MINTED, EVENT_REFUSED, EVENT_SPENT, CustodyLedger

#: Default capability lifetime. Short by design: a capability is meant to be
#: redeemed by the call that requested it, not stored.
DEFAULT_TTL_S = 60.0


class CustodyError(Exception):
    """Base class for every custody refusal."""


class CapabilityRequired(CustodyError):
    """A protected operation was attempted with no capability at all."""


class CapabilityInvalid(CustodyError):
    """A capability was presented but is unusable.

    `reason` is one of: `unknown`, `replayed`, `expired`, `bad_signature`,
    `mission_mismatch`, `tool_mismatch`, `nonce_mismatch`, `args_mismatch`.
    """

    def __init__(self, reason: str, detail: str = "") -> None:
        super().__init__(detail or reason)
        self.reason = reason
        self.detail = detail or reason


@dataclass(frozen=True)
class Capability:
    """A single-use, argument-bound authorization to run one protected call."""

    token_id: str
    mission_id: str
    tool_name: str
    nonce: Optional[str]
    args_digest: str
    expires_at: float
    signature: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "token_id": self.token_id,
            "mission_id": self.mission_id,
            "tool_name": self.tool_name,
            "nonce": self.nonce,
            "args_digest": self.args_digest,
            "expires_at": self.expires_at,
            "signature": self.signature,
        }


def _fields(
    token_id: str,
    mission_id: str,
    tool_name: str,
    nonce: Optional[str],
    args_digest: str,
    expires_at: float,
) -> Dict[str, object]:
    return {
        "token_id": token_id,
        "mission_id": mission_id,
        "tool_name": tool_name,
        "nonce": "" if nonce is None else nonce,
        "args_digest": args_digest,
        # Fixed precision so the value signed and the value re-derived at
        # redemption are byte-identical.
        "expires_at": f"{expires_at:.6f}",
    }


class CapabilityHolder:
    """Mints, redeems and records capabilities. Holds the signing key."""

    def __init__(
        self,
        *,
        key: Optional[bytes] = None,
        ttl_s: float = DEFAULT_TTL_S,
        ledger: Optional[CustodyLedger] = None,
    ) -> None:
        self._key = key if key is not None else signing.new_key()
        self._ttl_s = ttl_s
        self._live: Dict[str, Capability] = {}
        self.ledger = ledger if ledger is not None else CustodyLedger()

    # -- minting ----------------------------------------------------------
    def mint(
        self,
        *,
        mission_id: str,
        tool_name: str,
        nonce: Optional[str] = None,
        params: Optional[Mapping[str, Any]] = None,
        ttl_s: Optional[float] = None,
        now: Optional[float] = None,
    ) -> Capability:
        """Mint one capability. Only the decision layer should call this.

        Raises `NonCanonicalInput` when the parameters cannot be hashed: a
        capability that cannot be argument-bound would be a capability bound
        to nothing, which is exactly what this module exists to prevent.
        """
        args_digest = canonical_hash(dict(params or {}))
        at = time.time() if now is None else now
        expires_at = at + (self._ttl_s if ttl_s is None else ttl_s)
        token_id = signing.new_token_id()
        capability = Capability(
            token_id=token_id,
            mission_id=mission_id,
            tool_name=tool_name,
            nonce=nonce,
            args_digest=args_digest,
            expires_at=expires_at,
            signature=signing.sign(
                self._key,
                _fields(token_id, mission_id, tool_name, nonce, args_digest, expires_at),
            ),
        )
        self._live[token_id] = capability
        self.ledger.append(
            EVENT_MINTED,
            mission_id=mission_id,
            tool_name=tool_name,
            token_id=token_id,
            detail=args_digest,
        )
        return capability

    # -- redemption -------------------------------------------------------
    def redeem(
        self,
        token_id: Optional[str],
        *,
        mission_id: str,
        tool_name: str,
        nonce: Optional[str] = None,
        params: Optional[Mapping[str, Any]] = None,
        now: Optional[float] = None,
    ) -> Capability:
        """Consume a capability for exactly this call, or refuse.

        The token is removed from the live set *before* any binding check, so
        a token presented against the wrong call is burned rather than left
        available for a second, better-aimed attempt.
        """
        if not token_id:
            self._refuse(mission_id, tool_name, "", "missing")
            raise CapabilityRequired(
                f"{tool_name} is a protected tool and no capability was presented"
            )

        capability = self._live.pop(token_id, None)
        if capability is None:
            self._refuse(mission_id, tool_name, token_id, "replayed")
            raise CapabilityInvalid(
                "replayed",
                "capability is unknown or has already been spent",
            )

        at = time.time() if now is None else now
        checks = (
            ("expired", capability.expires_at < at),
            ("mission_mismatch", capability.mission_id != mission_id),
            ("tool_mismatch", capability.tool_name != tool_name),
            ("nonce_mismatch", capability.nonce != nonce),
        )
        for reason, failed in checks:
            if failed:
                self._refuse(mission_id, tool_name, token_id, reason)
                raise CapabilityInvalid(reason, f"capability {reason}")

        try:
            presented_digest = canonical_hash(dict(params or {}))
        except NonCanonicalInput:
            self._refuse(mission_id, tool_name, token_id, "args_mismatch")
            raise CapabilityInvalid(
                "args_mismatch", "presented arguments are not canonicalizable"
            )
        if presented_digest != capability.args_digest:
            self._refuse(mission_id, tool_name, token_id, "args_mismatch")
            raise CapabilityInvalid(
                "args_mismatch",
                "presented arguments do not match the arguments authorized",
            )

        if not signing.verify(
            self._key,
            _fields(
                capability.token_id,
                capability.mission_id,
                capability.tool_name,
                capability.nonce,
                capability.args_digest,
                capability.expires_at,
            ),
            capability.signature,
        ):
            self._refuse(mission_id, tool_name, token_id, "bad_signature")
            raise CapabilityInvalid("bad_signature", "capability signature is invalid")

        self.ledger.append(
            EVENT_SPENT,
            mission_id=mission_id,
            tool_name=tool_name,
            token_id=token_id,
            detail=capability.args_digest,
        )
        return capability

    # -- housekeeping -----------------------------------------------------
    def _refuse(self, mission_id: str, tool_name: str, token_id: str, reason: str) -> None:
        self.ledger.append(
            EVENT_REFUSED,
            mission_id=mission_id,
            tool_name=tool_name,
            token_id=token_id,
            detail=reason,
        )

    def revoke(self, token_id: str) -> bool:
        """Drop a live capability without spending it."""
        return self._live.pop(token_id, None) is not None

    def revoke_mission(self, mission_id: str) -> int:
        """Drop every live capability for a mission. Used when the circuit trips."""
        doomed = [t for t, c in self._live.items() if c.mission_id == mission_id]
        for token_id in doomed:
            del self._live[token_id]
        return len(doomed)

    def live_count(self) -> int:
        return len(self._live)
