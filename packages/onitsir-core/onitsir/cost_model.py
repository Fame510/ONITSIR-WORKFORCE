"""SYNERGY #16: per-action cost differentiation for governed browser
automation — ported from AgentOmega/app/engine.py's `_ACTION_COST_USD`.

AgentOmega's `HardenedAgentEngine` gates every Playwright action through
SHACKLE with a per-action cost estimate (navigate/click cheap, screenshot/VLM
more expensive because they call external models/services). This module
brings that same cost model into onitsir-core so `onitsir-server`'s
`/api/mission/:id/gate` endpoint can price a governed browser action exactly
the same way before agentosirus-web's `companion/server.mjs` executes it.
"""
from __future__ import annotations

# Ported verbatim from AgentOmega's _ACTION_COST_USD.
ACTION_COST_USD: dict[str, float] = {
    "navigate": 0.0005,
    "click": 0.0005,
    "type": 0.0005,
    "press": 0.0002,
    "select": 0.0005,
    "screenshot": 0.005,
    "firecrawl": 0.01,
    "vlm": 0.02,
    "kling": 0.05,
}

_DEFAULT_COST_USD = 0.001


def estimate_cost(action_type: str) -> float:
    """Return the modeled USD cost of one browser-automation action.
    Unknown action types fall back to a conservative default, matching
    AgentOmega's `.get(action.type, 0.001)` pattern."""
    return ACTION_COST_USD.get(action_type, _DEFAULT_COST_USD)
