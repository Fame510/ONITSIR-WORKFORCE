"""Evidence producers must REJECT weak output, not rubber-stamp it.

The whole point of the Iron Law is that a plausible-looking answer is not
evidence. These tests concentrate on the rejection paths, because a producer
that only ever returns passed=True would satisfy a happy-path test suite while
destroying the guarantee.
"""
from onitsir.evidence_producers import (
    ChainStepEvidenceProducer,
    ResearchEvidenceProducer,
)
from onitsir.verification import VerificationGate


GATE = VerificationGate()
GOOD_OUTPUT = (
    "Added rate limiting middleware to the gate route and covered it with "
    "two new tests; both pass."
)
TASK = "add rate limiting to the gate route"


def _chain(output, task=TASK, command="pytest -q"):
    return ChainStepEvidenceProducer().produce(
        command=command,
        raw_output=output,
        context={"task": task, "agent_id": "engineering-backend-architect"},
    )


def test_substantive_on_topic_output_passes_and_satisfies_the_gate():
    evidence = _chain(GOOD_OUTPUT)
    assert evidence.passed is True
    assert GATE.is_satisfied(evidence) is True


def test_empty_output_is_rejected():
    evidence = _chain("")
    assert evidence.passed is False
    assert GATE.is_satisfied(evidence) is False


def test_output_below_the_minimum_length_is_rejected():
    """A truncated reply is the most common false success."""
    evidence = _chain("done")
    assert evidence.passed is False
    assert "FAIL length" in evidence.output


def test_whitespace_only_output_is_rejected():
    evidence = _chain("        \n\n   ")
    assert evidence.passed is False


def test_refusal_text_is_rejected_even_when_long_and_on_topic():
    """A refusal that mentions the task keywords would otherwise pass both the
    length and overlap checks. The refusal marker is what catches it."""
    evidence = _chain(
        "I cannot help with that request to add rate limiting to the gate "
        "route, but here is some general information instead."
    )
    assert evidence.passed is False
    assert "FAIL refusal" in evidence.output


def test_python_traceback_masquerading_as_output_is_rejected():
    evidence = _chain(
        "Traceback (most recent call last):\n  File \"app.py\", line 3\n"
        "ValueError: rate limiting gate route failed"
    )
    assert evidence.passed is False


def test_provider_error_string_is_rejected():
    evidence = _chain(
        "[error] upstream provider returned 503 while working on the rate "
        "limiting gate route change"
    )
    assert evidence.passed is False


def test_internal_server_error_is_rejected():
    evidence = _chain(
        "Internal Server Error occurred while adding rate limiting to the "
        "gate route; nothing was written."
    )
    assert evidence.passed is False


def test_off_topic_output_is_rejected_for_lack_of_keyword_overlap():
    """Long, confident, and about something else entirely."""
    evidence = _chain(
        "Bordeaux vintages from nineteen eighty two remain excellent value "
        "for patient collectors seeking cellar depth."
    )
    assert evidence.passed is False
    assert "FAIL no task-keyword overlap" in evidence.output


def test_overlap_check_is_skipped_when_no_task_is_supplied():
    """Documented behaviour: with no task there is nothing to be off-topic
    about, so only length and refusal checks apply."""
    evidence = _chain(
        "This is a sufficiently long output with no particular subject.",
        task="",
    )
    assert evidence.passed is True


def test_producer_falls_back_to_a_synthetic_command_when_none_is_given():
    """The gate rejects evidence with no command, so the producer must always
    supply one."""
    evidence = _chain(GOOD_OUTPUT, command="")
    assert evidence.command == "verify-step:engineering-backend-architect"
    assert GATE.is_satisfied(evidence) is True


def test_check_log_is_always_captured_even_on_failure():
    """Failed evidence must still carry a readable reason; a silent failure is
    as bad as a false pass."""
    evidence = _chain("no")
    assert "chain-step self-check" in evidence.output
    assert evidence.output.strip() != ""


DUX_DOC = """# Literature Review: P vs NP

1. [Natural Proofs](https://arxiv.org/abs/cs/0000001)
   **Summary:** Razborov and Rudich formalise why a broad class of circuit
   lower-bound arguments cannot separate P from NP.
   **Key Insight:** Any proof technique that is both constructive and large
   runs into the natural-proofs barrier.
"""


def _research(doc):
    return ResearchEvidenceProducer().produce(
        command="verify-research-output", raw_output=doc, context={}
    )


def test_dux_format_document_passes():
    evidence = _research(DUX_DOC)
    assert evidence.passed is True
    assert GATE.is_satisfied(evidence) is True


def test_research_output_without_a_header_is_rejected():
    evidence = _research(DUX_DOC.replace("# Literature Review: P vs NP", "# Notes"))
    assert evidence.passed is False
    assert "FAIL header" in evidence.output


def test_research_output_without_a_source_link_is_rejected():
    """Research with no citations is an assertion, not evidence."""
    stripped = DUX_DOC.replace(
        "[Natural Proofs](https://arxiv.org/abs/cs/0000001)", "Natural Proofs"
    )
    evidence = _research(stripped)
    assert evidence.passed is False
    assert "0 source link" in evidence.output


def test_research_output_without_a_summary_is_rejected():
    evidence = _research(DUX_DOC.replace("**Summary:**", "**Blurb:**"))
    assert evidence.passed is False


def test_research_output_without_a_key_insight_is_rejected():
    evidence = _research(DUX_DOC.replace("**Key Insight:**", "**Thought:**"))
    assert evidence.passed is False


def test_empty_research_output_is_rejected():
    evidence = _research("")
    assert evidence.passed is False
