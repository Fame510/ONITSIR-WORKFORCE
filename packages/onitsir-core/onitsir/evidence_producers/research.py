"""SYNERGY #18: ResearchEvidenceProducer — Dux-format research-mission
evidence contract.

Source repo: Dux (imported into research/dux/ as the seed corpus — see
research/dux/problems.md and research/dux/p_vs_np/literature_review.md).

Open-ended research missions have no test-suite pass/fail signal. This
producer gives ONITSIR's Iron Law a concrete, human-checkable acceptance
criterion instead: "did the specialist produce a literature review matching
the Dux template (title/link/summary/key insight)?"

The Dux schema (inferred from research/dux/p_vs_np/literature_review.md):
  - a top-level `# Literature Review: <topic>` or `## Key Papers` header
  - one or more numbered entries, each with:
      - a bolded/linked title, ideally an arXiv-style link
      - a "Summary:" field
      - a "Key Insight:" field
"""
from __future__ import annotations

import re
import time

from ..verification import Evidence

_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^\)]+)\)")
_SUMMARY_RE = re.compile(r"\*\*Summary:?\*\*|Summary:", re.IGNORECASE)
_INSIGHT_RE = re.compile(r"\*\*Key Insight:?\*\*|Key Insight:", re.IGNORECASE)
_HEADER_RE = re.compile(r"^#{1,3}\s+.*(Literature Review|Key Papers|Problems)", re.IGNORECASE | re.MULTILINE)


class ResearchEvidenceProducer:
    """Concrete EvidenceProducer for research-mission markdown output,
    checked against the Dux literature-review/problem-list template."""

    def produce(self, *, command: str, raw_output: str, context: dict) -> Evidence:
        checks: list[str] = []
        passed = True

        has_header = bool(_HEADER_RE.search(raw_output))
        checks.append(("PASS" if has_header else "FAIL") + " header matches Dux template")
        passed &= has_header

        links = _LINK_RE.findall(raw_output)
        has_links = len(links) >= 1
        checks.append(("PASS" if has_links else "FAIL") + f" {len(links)} source link(s) found")
        passed &= has_links

        has_summary = bool(_SUMMARY_RE.search(raw_output))
        checks.append(("PASS" if has_summary else "FAIL") + " Summary field present")
        passed &= has_summary

        has_insight = bool(_INSIGHT_RE.search(raw_output))
        checks.append(("PASS" if has_insight else "FAIL") + " Key Insight field present")
        passed &= has_insight

        summary = "[Dux-format research evidence check]\n" + "\n".join(checks)
        return Evidence(
            command=command or "verify-research-output",
            output=summary,
            passed=bool(passed),
            at=time.time(),
        )
