"""The Router — matches a mission goal to the right specialists (unified).

Ported unchanged in its core scoring from ONITSIR/onitsir/router.py.

SYNERGY #2 (Replace agentosirus's LLM-based "Swarm Architect" planner with a
deterministic Router pre-filter): adds `pre_filter()`, a wider, cheaper scan
than `route()` intended to be called from the FastAPI bridge
(`GET /api/router/prefilter?goal=...`) so agentosirus's `handleChain()` can
hand its LLM planner a small, pre-scored shortlist instead of dumping the
entire ~163-agent roster into the prompt.

SYNERGY #8 (Router-driven team suggestions in TeamBuilder): `route()` is also
what powers `POST /api/router/route` for TeamBuilder's free-text "Suggest a
team" box.
"""
from __future__ import annotations

from dataclasses import dataclass

from .roster import Roster, Specialist


@dataclass(frozen=True)
class Assignment:
    """A specialist assigned to a mission, with the confidence of the match."""
    specialist: Specialist
    score: int

    @property
    def confidence(self) -> str:
        if self.score >= 8:
            return "high"
        if self.score >= 4:
            return "medium"
        return "low"

    def to_dict(self) -> dict:
        """JSON-friendly shape matching agentosirus's expectations for the
        TeamBuilder "suggest a team" response (Synergy #8)."""
        return {
            "id": self.specialist.id,
            "name": self.specialist.name,
            "category": self.specialist.category,
            "description": self.specialist.description,
            "score": self.score,
            "confidence": self.confidence,
        }


class Router:
    def __init__(self, roster: Roster):
        self._roster = roster

    def route(self, goal: str, crew_size: int = 3) -> list[Assignment]:
        """Pick the top `crew_size` specialists for a goal.

        Raises ValueError on an empty goal. Never fabricates a match: if nothing
        scores, returns an empty crew and lets the caller decide (the Engine
        surfaces this as a real "no confident match" state, not a silent guess).
        """
        if not goal or not goal.strip():
            raise ValueError("Cannot route an empty goal.")
        if crew_size < 1:
            raise ValueError("crew_size must be >= 1")
        matches = self._roster.search(goal, limit=crew_size)
        return [Assignment(specialist=s, score=sc) for s, sc in matches]

    def pre_filter(self, goal: str, limit: int = 8) -> list[Assignment]:
        """SYNERGY #2: a cheap, wider first pass used to shortlist candidates
        for agentosirus's LLM "Lead Swarm Architect" planner prompt.

        Semantically this is the same deterministic scoring as `route()`, but
        exposed under a distinct name/limit default so callers (and the
        `/api/router/prefilter` endpoint) express *intent* — "give me a
        shortlist to hand an LLM", not "give me the final crew". Because the
        underlying score is identical, a caller who wants the final crew can
        always just take `pre_filter(goal, limit=crew_size)`.
        """
        return self.route(goal, crew_size=limit)
