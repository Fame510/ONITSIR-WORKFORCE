"""The protected executor.

Every protected tool call runs through `ProtectedExecutor.execute()`, and
`execute()` redeems a capability before it does anything else. There is no
code path from a caller to a protected tool that does not pass through here,
which is the property that turns a decided constraint into an enforced one.

A tool implementation registered here never sees the capability. It receives
only the parameters that were bound into the capability it was launched with,
so a tool cannot be tricked into acting on arguments nobody authorized.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Mapping, Optional

from .capability_holder import CapabilityHolder, CapabilityRequired

#: Tools that may never run without a capability. Membership is a security
#: decision, so the set is explicit rather than pattern-matched: a typo in a
#: pattern would silently unprotect a tool.
PROTECTED_TOOLS = frozenset(
    {
        "payments.transfer",
        "email.send",
        "files.delete",
        "repo.push",
        "shell.exec",
        "secrets.read",
        "db.write",
        "http.post",
    }
)


def is_protected(tool_name: str) -> bool:
    return tool_name in PROTECTED_TOOLS


class UnknownTool(Exception):
    """A tool was invoked that has no registered implementation."""


class ProtectedExecutor:
    """Runs registered tools, and only against a redeemed capability."""

    def __init__(self, holder: CapabilityHolder) -> None:
        self._holder = holder
        self._tools: Dict[str, Callable[[Dict[str, Any]], Any]] = {}

    def register(self, tool_name: str, fn: Callable[[Dict[str, Any]], Any]) -> None:
        self._tools[tool_name] = fn

    def registered(self) -> frozenset:
        return frozenset(self._tools)

    def execute(
        self,
        tool_name: str,
        *,
        mission_id: str,
        capability_token: Optional[str] = None,
        nonce: Optional[str] = None,
        params: Optional[Mapping[str, Any]] = None,
        now: Optional[float] = None,
    ) -> Any:
        """Run one tool call.

        Unprotected tools run directly. Protected tools redeem first; every
        refusal path raises out of `redeem()` before the implementation is
        looked up, so a refused call cannot have a side effect.
        """
        args: Dict[str, Any] = dict(params or {})

        if is_protected(tool_name):
            if capability_token is None:
                # Recorded by redeem() as a refusal, so an attempted bypass is
                # in the custody ledger rather than merely absent from it.
                self._holder.redeem(
                    None,
                    mission_id=mission_id,
                    tool_name=tool_name,
                    nonce=nonce,
                    params=args,
                    now=now,
                )
                raise CapabilityRequired(tool_name)  # pragma: no cover - redeem raises
            self._holder.redeem(
                capability_token,
                mission_id=mission_id,
                tool_name=tool_name,
                nonce=nonce,
                params=args,
                now=now,
            )

        fn = self._tools.get(tool_name)
        if fn is None:
            raise UnknownTool(tool_name)
        return fn(args)
