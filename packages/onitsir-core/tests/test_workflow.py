"""Workflow phase machine."""
import pytest

from onitsir.verification import Evidence, VerificationError
from onitsir.workflow import Phase, PhaseStatus, Workflow


def _passing_evidence(phase: Phase) -> Evidence:
    return Evidence(command=f"check {phase.value}", output="1 passed", passed=True)


def test_workflow_starts_at_intake():
    wf = Workflow()
    assert wf.current == Phase.INTAKE
    assert wf.record(Phase.INTAKE).status == PhaseStatus.ACTIVE


def test_workflow_advances_through_all_phases():
    wf = Workflow()
    for phase in Phase.ordered():
        assert wf.current == phase
        wf.complete_current(_passing_evidence(phase))
    assert wf.shipped is True


def test_workflow_refuses_to_advance_on_failing_evidence():
    wf = Workflow()
    bad = Evidence(command="check", output="1 failed", passed=False)
    with pytest.raises(VerificationError):
        wf.complete_current(bad)
    assert wf.current == Phase.INTAKE  # did not advance


def test_workflow_progress_snapshot():
    wf = Workflow()
    wf.complete_current(_passing_evidence(Phase.INTAKE))
    progress = wf.progress()
    assert progress["intake"] == "verified"
    assert progress["spec"] == "active"


def test_verified_count_increments():
    wf = Workflow()
    assert wf.verified_count() == 0
    wf.complete_current(_passing_evidence(Phase.INTAKE))
    assert wf.verified_count() == 1
