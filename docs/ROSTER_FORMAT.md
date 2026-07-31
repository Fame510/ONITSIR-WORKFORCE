# ROSTER_FORMAT.md — Unified `roster.json` + `persona.md` Dual-Format Spec

SYNERGY #1 makes agentosirus's markdown persona library canonical and
generates `roster.json` from it. This document specifies both formats and
how they relate.

## 1. `roster.json` (generated, machine-readable metadata)

Produced by `packages/agentosirus-web/scripts/build-agent-index.mjs` (also
committed as a dev-mode snapshot at `packages/onitsir-core/data/roster.json`
so the system runs standalone without a Node build step). Array of records:

```json
{
  "id": "design-brand-guardian",
  "name": "Brand Guardian",
  "category": "design",
  "description": "Expert brand strategist specializing in identity systems.",
  "keywords": ["design", "brand", "guardian", "strategist", "identity"],
  "persona_path": "design/design-brand-guardian.md"
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Slug, matches the markdown filename (no `.md`) |
| `name` | string | Display name, from frontmatter `name:` or derived from the slug |
| `category` | string | One of the 14 division ids (see below) |
| `description` | string | Short summary, from frontmatter `description:` |
| `keywords` | string[] | Stopword-filtered tokens extracted from name+description+category, mirroring ONITSIR's original `scripts/gen_roster.py` approach |
| `persona_path` | string \| null | Relative path (from `agentosirus-web/personas/`) to the full markdown persona body; `null` for entries with no markdown body yet |

Loaded by `onitsir-core/onitsir/roster.py::Roster.load()`. All 14 categories
are represented: `design`, `engineering`, `marketing`, `strategy`,
`game-development`, `specialized`, `paid-media`, `sales`,
`project-management`, `spatial-computing`, `support`, `testing`, `product`,
`integrations` — the last two (`strategy`, `integrations`) were previously
excluded from agentosirus's `divisions` array; SYNERGY #1 fixes this bug.

## 2. `persona.md` (canonical, human-authored specialist body)

One markdown file per specialist under
`packages/agentosirus-web/personas/<category>/<id>.md`:

```markdown
---
name: Brand Guardian
description: Expert brand strategist specializing in identity systems.
color: pink
emoji: 🎨
vibe: Meticulous, protective of the brand, allergic to inconsistency.
---

# Brand Guardian

<full system-prompt body used by agentosirus's LLM dispatch...>
```

| Frontmatter field | Required | Notes |
|---|---|---|
| `name` | no (derived from filename if absent) | |
| `description` | no (falls back to generic text) | Feeds `roster.json`'s `description` |
| `color` | no | UI accent color |
| `emoji` | no | UI icon |
| `vibe` | no | Injected into the persona's implicit system prompt when no full body is loaded |

The body (everything after the closing `---`) is the specialist's full
system prompt, served via `GET /api/agents/:category/:id` (its `content`
field) and resolved by `onitsir-core`'s
`Specialist.load_content()` when a Python caller needs the same text
(e.g. for a `ResearchEvidenceProducer` context, or an evidence-check
against the specialist's own instructions).

## 3. Resolution order

`Specialist.load_content(persona_root)` in `onitsir/roster.py` resolves, in
order:

1. `persona_root / persona_path` (from `roster.json`'s `persona_path` field), if set.
2. `persona_root / category / f"{id}.md"` (the agentosirus filesystem convention), as a fallback.
3. The short `description` string, if no markdown file is found at all.

This guarantees a caller always gets *something* usable as a system prompt,
even for roster entries that predate a full markdown body.

## 4. Build step

```bash
cd packages/agentosirus-web
npm run build:index   # runs scripts/build-agent-index.mjs
```

Emits:

- `public/agents-index.json` — full metadata + `contentFile` pointers (agentosirus's own format, unchanged)
- `public/agents-content/*.md` — persona bodies, one file per specialist
- `public/roster.json` — **new**, onitsir-core-shaped roster (SYNERGY #1)
