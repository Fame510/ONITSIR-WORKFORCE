"""SYNERGY #12: Additive ethics tag-weight scoring — ported from
ADROS/backend/cognitive/ethics.py::EthicsEngine.

Adds a content-safety dimension to ONITSIR's Governor, which was previously
resource-only (budget/loop/repeat). A proposed action can now be tagged with
semantic tags (e.g. "privacy_violation", "consent_given", "human_safety")
and additively scored; a below-threshold score produces a DENY verdict
routed through the existing audit ledger (see `Governor.evaluate(tags=...)`
in shackle.py).

Deterministic and auditable: same tags always produce the same score.
"""
from __future__ import annotations

from typing import Iterable, Tuple

# Positive weights reward pro-social / safety-preserving intent tags.
# Negative weights penalize harmful / hostile intent tags.
# Ported verbatim from ADROS's TAG_WEIGHTS.
TAG_WEIGHTS: dict[str, int] = {
    # --- Permissive / safety-affirming ---
    "no_harm": 10,
    "privacy_respect": 7,
    "human_safety": 12,
    "transparency": 5,
    "consent_given": 6,
    # --- Prohibitive / hostile ---
    "property_damage": -12,
    "hostile_action": -13,
    "deception": -9,
    "privacy_violation": -8,
    "coercion": -10,
}


class EthicsEngine:
    """Deterministic, auditable additive scoring over policy tags.
    Score >= threshold -> ALLOW, otherwise DENY."""

    def __init__(self, threshold: int = 0) -> None:
        self.threshold = threshold

    def score(self, tags: Iterable[str]) -> int:
        return int(sum(TAG_WEIGHTS.get(tag, 0) for tag in tags))

    def evaluate(self, tags: Iterable[str]) -> Tuple[str, int]:
        total = self.score(tags)
        outcome = "ALLOW" if total >= self.threshold else "DENY"
        return outcome, total
