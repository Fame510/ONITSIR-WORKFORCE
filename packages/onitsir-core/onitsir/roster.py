"""The Roster — ONITSIR's specialist workforce (unified).

SYNERGY #1 (Unify the specialist roster into one source of truth):
Ported from ONITSIR/onitsir/roster.py and extended so the same `Specialist`
record can resolve BOTH:
  - ONITSIR's routable metadata (id/category/keywords/description), and
  - agentosirus's full markdown persona body (the system-prompt content),
via a new `persona_path` field + `load_content()` method.

roster.json is no longer hand-authored: it is generated from agentosirus's
markdown persona library's YAML frontmatter by
`agentosirus-web/scripts/build-agent-index.mjs` (see Synergy #1 notes there),
using the same stopword-based keyword-extraction approach as ONITSIR's
`scripts/gen_roster.py`. This module simply loads whatever roster.json is
produced — dev/test environments ship a committed snapshot (this file's
`data/roster.json`, copied verbatim from the ONITSIR repo, 164 entries) so the
system runs standalone without requiring a Node build step first.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

_DEFAULT_ROSTER = Path(__file__).resolve().parent.parent / "data" / "roster.json"

# SYNERGY #1: default location of agentosirus's markdown persona bodies once
# the two repos are laid out side by side inside onitsir-unified/packages/.
_DEFAULT_PERSONA_ROOT = (
    Path(__file__).resolve().parent.parent.parent / "agentosirus-web" / "personas"
)


@dataclass(frozen=True)
class Specialist:
    """A single specialist playbook from the roster.

    `persona_path` (SYNERGY #1, new field) is the relative path, if known, to
    the agentosirus markdown file containing this specialist's full system
    prompt body — e.g. "design/design-brand-guardian.md". When present,
    `load_content()` can resolve the actual persona text; ONITSIR's own
    short `description` remains available even when no markdown body exists.
    """
    id: str
    name: str
    category: str
    description: str
    keywords: tuple[str, ...] = field(default_factory=tuple)
    persona_path: str | None = None

    def score(self, terms: list[str]) -> int:
        """How well this specialist matches a set of lowercased query terms.

        Keyword hit = 2 points; category hit = 3 points (a category match is a
        strong domain signal); name substring hit = 2 points.
        """
        score = 0
        kw = set(self.keywords)
        cat = self.category.lower()
        name = self.name.lower()
        for t in terms:
            if t in kw:
                score += 2
            if t == cat or t in cat:
                score += 3
            if t in name:
                score += 2
        return score

    def load_content(self, persona_root: str | Path | None = None) -> str:
        """SYNERGY #1: resolve the full markdown persona body for this specialist.

        Looks up `persona_path` under `persona_root` (defaults to
        agentosirus-web/personas/ next to this package). Falls back to the
        short `description` if no markdown body is found, so callers always
        get *something* usable as a system prompt.
        """
        root = Path(persona_root) if persona_root else _DEFAULT_PERSONA_ROOT
        candidates: list[Path] = []
        if self.persona_path:
            candidates.append(root / self.persona_path)
        # Fall back to <category>/<id>.md, the agentosirus convention.
        candidates.append(root / self.category / f"{self.id}.md")
        for c in candidates:
            if c.exists():
                raw = c.read_text(encoding="utf-8")
                return _strip_frontmatter(raw)
        return self.description


def _strip_frontmatter(raw: str) -> str:
    """Remove a leading `---\\n...\\n---` YAML frontmatter block, if present."""
    if raw.startswith("---"):
        parts = raw.split("---", 2)
        if len(parts) >= 3:
            return parts[2].strip()
    return raw.strip()


class Roster:
    """The full set of specialists, loaded from roster.json."""

    def __init__(self, specialists: list[Specialist]):
        if not specialists:
            raise ValueError("Roster cannot be empty — no specialists loaded.")
        self._specialists = specialists
        self._by_id = {s.id: s for s in specialists}

    @classmethod
    def load(cls, path: str | Path | None = None) -> "Roster":
        p = Path(path) if path else _DEFAULT_ROSTER
        if not p.exists():
            raise FileNotFoundError(f"Roster data not found at {p}")
        raw = json.loads(p.read_text())
        specialists = [
            Specialist(
                id=str(r["id"]),
                name=str(r["name"]),
                category=str(r["category"]),
                description=str(r.get("description", "")),
                keywords=tuple(r.get("keywords", [])),
                persona_path=r.get("persona_path"),
            )
            for r in raw
        ]
        return cls(specialists)

    @classmethod
    def from_records(cls, records: list[dict]) -> "Roster":
        """Build a Roster directly from in-memory dicts (used by tests and by
        the FastAPI bridge when serving a roster fetched over HTTP)."""
        specialists = [
            Specialist(
                id=str(r["id"]),
                name=str(r["name"]),
                category=str(r["category"]),
                description=str(r.get("description", "")),
                keywords=tuple(r.get("keywords", [])),
                persona_path=r.get("persona_path"),
            )
            for r in records
        ]
        return cls(specialists)

    def __len__(self) -> int:
        return len(self._specialists)

    def all(self) -> list[Specialist]:
        return list(self._specialists)

    def categories(self) -> list[str]:
        return sorted({s.category for s in self._specialists})

    def category_counts(self) -> dict[str, int]:
        """SYNERGY #9: a live, computed per-category count — never hardcoded.
        agentosirus's UI (App.tsx / MasterAgentHub.tsx) fetches this via
        GET /api/divisions instead of hardcoding "144 specialists"."""
        counts: dict[str, int] = {}
        for s in self._specialists:
            counts[s.category] = counts.get(s.category, 0) + 1
        return counts

    def get(self, specialist_id: str) -> Specialist:
        if specialist_id not in self._by_id:
            raise KeyError(f"No specialist with id {specialist_id!r}")
        return self._by_id[specialist_id]

    def search(self, query: str, limit: int = 5) -> list[tuple[Specialist, int]]:
        """Return up to `limit` (specialist, score) pairs, best match first.

        Only positive-scoring specialists are returned.
        """
        terms = [t for t in _tokenize(query)]
        scored = [(s, s.score(terms)) for s in self._specialists]
        scored = [(s, sc) for s, sc in scored if sc > 0]
        scored.sort(key=lambda pair: (-pair[1], pair[0].name))
        return scored[:limit]


def _tokenize(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-zA-Z][a-zA-Z0-9+#-]{1,}", text.lower())]
