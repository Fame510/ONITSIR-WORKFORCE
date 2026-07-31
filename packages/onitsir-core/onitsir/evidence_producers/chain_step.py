"""SYNERGY #4: ChainStepEvidenceProducer.

Ends the practice (present in agentosirus's original `handleChain()`) of
treating ANY non-empty LLM response as "done". Each chain step's output is
run through a lightweight self-check before the next specialist in the chain
builds on it, and the result is wrapped as `Evidence` the VerificationGate
can validate.

Three checks compose the self-check (all must pass for `passed=True`):
  1. non-trivial length  — guards against truncated/empty "success".
  2. task-keyword overlap — the output should reference at least one
     significant word from the assigned task (crude but real: refuses to
     accept a reply that is obviously off-topic).
  3. no LLM refusal/error markers — catches "I cannot help with that",
     stack traces, or provider error strings masquerading as output.

Wired into `onitsir-server`'s `POST /api/mission/:id/verify-step`, which
`agentosirus-web`'s `handleChain()` calls for every `ChainStep` before
advancing to the next specialist (see agentosirus-web/src/lib/apiShim.ts).
"""
from __future__ import annotations

import re
import time

from ..verification import Evidence

_REFUSAL_MARKERS = (
    "i cannot help with that",
    "i can't assist with that",
    "as an ai language model",
    "i'm unable to",
    "traceback (most recent call last)",
    "internal server error",
    "[error]",
)

_MIN_OUTPUT_CHARS = 20


def _tokenize(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-zA-Z][a-zA-Z0-9+#-]{2,}", text.lower())}


class ChainStepEvidenceProducer:
    """Concrete EvidenceProducer for one agentosirus chain step."""

    def produce(self, *, command: str, raw_output: str, context: dict) -> Evidence:
        task = context.get("task", "")
        agent_id = context.get("agent_id", "unknown-agent")
        checks: list[str] = []
        passed = True

        if len(raw_output.strip()) < _MIN_OUTPUT_CHARS:
            passed = False
            checks.append(f"FAIL length: output is only {len(raw_output.strip())} chars")
        else:
            checks.append(f"PASS length: {len(raw_output.strip())} chars")

        lowered = raw_output.lower()
        if any(marker in lowered for marker in _REFUSAL_MARKERS):
            passed = False
            checks.append("FAIL refusal/error marker detected in output")
        else:
            checks.append("PASS no refusal/error markers")

        if task:
            task_terms = _tokenize(task)
            output_terms = _tokenize(raw_output)
            overlap = task_terms & output_terms
            if task_terms and not overlap:
                passed = False
                checks.append("FAIL no task-keyword overlap with output")
            else:
                checks.append(f"PASS task-keyword overlap: {sorted(overlap)[:5]}")

        output_summary = (
            f"[chain-step self-check for agent={agent_id}]\n" + "\n".join(checks)
        )
        return Evidence(
            command=command or f"verify-step:{agent_id}",
            output=output_summary,
            passed=passed,
            at=time.time(),
        )
