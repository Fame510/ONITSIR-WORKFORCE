"""Verification gate / Iron Law, plus EvidenceProducers (SYNERGY #4, #18)."""
import time

import pytest

from onitsir.evidence_producers import ChainStepEvidenceProducer, ResearchEvidenceProducer
from onitsir.verification import Evidence, VerificationError, VerificationGate


def test_gate_rejects_missing_evidence():
    gate = VerificationGate()
    with pytest.raises(VerificationError):
        gate.check(None)


def test_gate_rejects_failing_evidence():
    gate = VerificationGate()
    evidence = Evidence(command="pytest", output="1 failed", passed=False)
    with pytest.raises(VerificationError):
        gate.check(evidence)


def test_gate_rejects_empty_command():
    gate = VerificationGate()
    evidence = Evidence(command="", output="ok", passed=True)
    with pytest.raises(VerificationError):
        gate.check(evidence)


def test_gate_rejects_empty_output():
    gate = VerificationGate()
    evidence = Evidence(command="pytest", output="", passed=True)
    with pytest.raises(VerificationError):
        gate.check(evidence)


def test_gate_rejects_stale_evidence():
    gate = VerificationGate(max_age_s=1.0)
    evidence = Evidence(command="pytest", output="ok", passed=True, at=time.time() - 10)
    with pytest.raises(VerificationError):
        gate.check(evidence)


def test_gate_accepts_fresh_passing_evidence():
    gate = VerificationGate()
    evidence = Evidence(command="pytest", output="3 passed", passed=True)
    gate.check(evidence)  # does not raise
    assert gate.is_satisfied(evidence) is True


def test_is_satisfied_false_on_bad_evidence():
    gate = VerificationGate()
    assert gate.is_satisfied(None) is False


# --- ChainStepEvidenceProducer (SYNERGY #4) --------------------------------
def test_chain_step_producer_passes_on_relevant_output():
    producer = ChainStepEvidenceProducer()
    evidence = producer.produce(
        command="verify-step:design-brand-guardian",
        raw_output="Here is the finished brand guardian identity kit with logo and colors.",
        context={"task": "design a brand identity kit", "agent_id": "design-brand-guardian"},
    )
    assert evidence.passed is True


def test_chain_step_producer_fails_on_short_output():
    producer = ChainStepEvidenceProducer()
    evidence = producer.produce(command="x", raw_output="ok", context={"task": "design a logo", "agent_id": "a"})
    assert evidence.passed is False


def test_chain_step_producer_fails_on_refusal_marker():
    producer = ChainStepEvidenceProducer()
    evidence = producer.produce(
        command="x",
        raw_output="I cannot help with that request, sorry about that friend.",
        context={"task": "design a logo", "agent_id": "a"},
    )
    assert evidence.passed is False


def test_chain_step_producer_fails_on_off_topic_output():
    producer = ChainStepEvidenceProducer()
    evidence = producer.produce(
        command="x",
        raw_output="Quantum entanglement enables nonlocal correlations between particles across vast cosmic distances.",
        context={"task": "design a logo for the brand identity guardian project", "agent_id": "a"},
    )
    assert evidence.passed is False


# --- ResearchEvidenceProducer (SYNERGY #18) --------------------------------
DUX_STYLE_OUTPUT = """# Literature Review: Graph Isomorphism

## Key Papers

1. **[On Graph Isomorphism](https://arxiv.org/abs/1234.5678)**
   - **Summary:** Surveys known complexity bounds.
   - **Key Insight:** No known polynomial algorithm exists.
"""


def test_research_producer_passes_dux_shaped_output():
    producer = ResearchEvidenceProducer()
    evidence = producer.produce(command="x", raw_output=DUX_STYLE_OUTPUT, context={})
    assert evidence.passed is True


def test_research_producer_fails_without_links():
    producer = ResearchEvidenceProducer()
    bad = "# Literature Review: X\n\nNo links or summary here."
    evidence = producer.produce(command="x", raw_output=bad, context={})
    assert evidence.passed is False


def test_research_producer_fails_without_header():
    producer = ResearchEvidenceProducer()
    bad = "Just some prose with a [link](https://arxiv.org/abs/1) but no proper header."
    evidence = producer.produce(command="x", raw_output=bad, context={})
    assert evidence.passed is False
