"""SYNERGY #5: server-side implementation of GET /api/divisions, faithfully
mirroring agentosirus's original server.ts / apiShim.ts route shape so
`installApiShim()` can be disabled with zero frontend changes.

SYNERGY #9: division/category counts are computed live from the roster
(`roster.category_counts()`), never hardcoded — this is what fixes the
"144 vs 163 vs 164" specialist-count drift once and for all: any client
reading this endpoint (or the `/api/agents` length) gets the true, current
count.
"""
from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter()

_DIVISION_META = {
    "engineering": {"name": "Engineering Division", "emoji": "\U0001F4BB", "color": "sky",
                    "description": "Building the future, one commit at a time."},
    "design": {"name": "Design Division", "emoji": "\U0001F3A8", "color": "pink",
               "description": "Making it beautiful, usable, and delightful."},
    "paid-media": {"name": "Paid Media Division", "emoji": "\U0001F4B0", "color": "emerald",
                   "description": "Turning ad spend into measurable business outcomes."},
    "sales": {"name": "Sales Division", "emoji": "\U0001F4BC", "color": "indigo",
              "description": "Turning pipeline into revenue through craft."},
    "marketing": {"name": "Marketing Division", "emoji": "\U0001F4E2", "color": "orange",
                  "description": "Growing your audience, one authentic interaction at a time."},
    "product": {"name": "Product Division", "emoji": "\U0001F680", "color": "purple",
                "description": "Building the right thing at the right time."},
    "project-management": {"name": "Project Management", "emoji": "\U0001F3AC", "color": "cyan",
                            "description": "Keeping the trains running on time (and under budget)."},
    "testing": {"name": "Testing Division", "emoji": "\U0001F9EA", "color": "red",
                "description": "Breaking things so users don't have to."},
    "support": {"name": "Support Division", "emoji": "\U0001F6E0", "color": "teal",
                "description": "The backbone of the operation."},
    "spatial-computing": {"name": "Spatial Computing", "emoji": "\U0001F97D", "color": "violet",
                          "description": "Building the immersive future."},
    "specialized": {"name": "Specialized Division", "emoji": "\U0001F3AF", "color": "yellow",
                    "description": "The unique specialists who don't fit in a box."},
    "game-development": {"name": "Game Development", "emoji": "\U0001F3AE", "color": "rose",
                        "description": "Building worlds, systems, and experiences."},
    # SYNERGY #1 bug fix: strategy and integrations were previously excluded
    # from agentosirus's `divisions` array despite having persona files.
    "strategy": {"name": "Strategy Division", "emoji": "\U0001F9ED", "color": "amber",
                "description": "Charting the course before anyone starts building."},
    "integrations": {"name": "Integrations Division", "emoji": "\U0001F50C", "color": "lime",
                     "description": "Wiring the agency into every tool it needs."},
}


@router.get("/api/divisions")
def get_divisions(request: Request):
    roster = request.app.state.roster
    counts = roster.category_counts()
    out = []
    for cat_id in sorted(counts):
        meta = _DIVISION_META.get(cat_id, {
            "name": cat_id.replace("-", " ").title(),
            "emoji": "\U0001F916", "color": "indigo", "description": "",
        })
        out.append({
            "id": cat_id,
            "name": meta["name"],
            "emoji": meta["emoji"],
            "color": meta["color"],
            "description": meta["description"],
            "agentCount": counts[cat_id],  # SYNERGY #9: live count, never hardcoded
        })
    return out
