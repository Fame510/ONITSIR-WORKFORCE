"""HMAC-SHA256 signing for custody capability tokens.

Kept in its own module so the signing primitive can be swapped (for an HSM,
for an asymmetric scheme) without touching the capability lifecycle in
`capability_holder.py`. Everything here is stdlib: custody must not become
unavailable because an optional cryptography dependency is missing, the way
the governance ledger's Ed25519 signing degrades when `pynacl` is absent.

The signature covers the *whole* binding - mission, tool, nonce, argument
digest and expiry - so a token cannot be edited into authorising a different
call, a different mission, or a longer life.
"""
from __future__ import annotations

import hmac
import secrets
from hashlib import sha256
from typing import Mapping

#: Length in bytes of a freshly generated custody key.
KEY_BYTES = 32

#: Length in bytes of the random component of a capability token.
TOKEN_BYTES = 32


def new_key() -> bytes:
    """Return a fresh custody signing key from the OS CSPRNG."""
    return secrets.token_bytes(KEY_BYTES)


def new_token_id() -> str:
    """Return an unguessable capability token identifier."""
    return secrets.token_urlsafe(TOKEN_BYTES)


def binding_payload(fields: Mapping[str, object]) -> bytes:
    """Serialize a binding deterministically for signing.

    Sorted `key=value` pairs joined by `\\x1f` (unit separator). The separator
    is a control character that cannot appear in any of the bound values -
    mission ids, tool names, nonces and hex digests are all printable - so the
    encoding is unambiguous and two different bindings cannot serialize to the
    same bytes.
    """
    parts = [f"{key}={fields[key]}" for key in sorted(fields)]
    return "\x1f".join(parts).encode("utf-8")


def sign(key: bytes, fields: Mapping[str, object]) -> str:
    """Return the hex HMAC-SHA256 of a binding under `key`."""
    return hmac.new(key, binding_payload(fields), sha256).hexdigest()


def verify(key: bytes, fields: Mapping[str, object], signature: str) -> bool:
    """Constant-time signature check.

    `hmac.compare_digest` rather than `==`: an early-exit comparison leaks
    how many leading characters were correct, which is enough to forge a
    signature one character at a time.
    """
    expected = sign(key, fields)
    return hmac.compare_digest(expected, signature)
