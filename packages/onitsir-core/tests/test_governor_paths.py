"""Governor DENY/HITL paths, circuit-breaker semantics, and veto precedence.

These tests target `Governor.evaluate()` rather than the pure `decide()`
surface, because the interesting behaviour lives in the interaction between
decide()'s precedence order and the side effects evaluate() applies around it
(cost deducted BEFORE the decision, circuit tripped on DENY, veto layered only
over ALLOW).
"""
import pytest

from onitsir.shackle import (
    DenyReason,
    Governor,
    GovernorConfig,
    classify_reason,
)


def test_deny_trips_circuit_and_every_later_call_is_circuit_open():
    """A single DENY must poison the rest of the mission with circuit_open,
    not with a freshly-recomputed reason. The original cause stays in the
    ledger; subsequent calls report the circuit."""
    gov = Governor(GovernorConfig(budget_usd=0.10))

    verdict, reason = gov.evaluate("tool.a", cost_usd=0.10)
    assert verdict == "DENY"
    assert reason == "budget_exhausted"
    assert gov.circuit_tripped is True

    verdict2, reason2 = gov.evaluate("tool.b", cost_usd=0.0)
    assert verdict2 == "DENY"
    assert reason2 == "circuit_open"


def test_cost_is_deducted_even_when_the_call_is_denied():
    """Cost is deducted before decide() runs, so a DENIED call still consumes
    budget. A hostile caller's retries are therefore expensive rather than
    free. This is deliberate; if it ever changes, this test should fail."""
    gov = Governor(GovernorConfig(budget_usd=1.0))
    verdict, _ = gov.evaluate("robot.move", cost_usd=0.25, tags=["human_harm"])
    assert verdict == "DENY"
    assert gov.spent_usd == pytest.approx(0.25)
    assert gov.remaining_usd == pytest.approx(0.75)


def test_remaining_usd_never_goes_negative():
    gov = Governor(GovernorConfig(budget_usd=0.05))
    gov.evaluate("tool.a", cost_usd=5.0)
    assert gov.remaining_usd == 0.0


def test_hitl_always_mode_returns_hitl_not_allow():
    gov = Governor(GovernorConfig(budget_usd=10.0, hitl_mode="always"))
    verdict, reason = gov.evaluate("email.send", cost_usd=0.0)
    assert verdict == "HITL"
    assert reason == "hitl_all_calls"
    # HITL must NOT trip the circuit — the mission is pausable, not dead.
    assert gov.circuit_tripped is False


def test_hitl_always_precedes_opaque_context_reason():
    """Both are HITL, so the outcome is identical, but step 7 is reached before
    step 9. The recorded reason must be hitl_all_calls. Locking this in stops a
    future 'reason improvement' from silently reordering precedence."""
    gov = Governor(GovernorConfig(budget_usd=10.0, hitl_mode="always"))
    verdict, reason = gov.evaluate("tool.x", params={"ctx": "opaque"})
    assert verdict == "HITL"
    assert reason == "hitl_all_calls"


def test_opaque_context_alone_fails_closed_to_hitl():
    gov = Governor(GovernorConfig(budget_usd=10.0))
    verdict, reason = gov.evaluate("tool.x", params={"ctx": "opaque"})
    assert verdict == "HITL"
    assert reason == "fail_closed:opaque_context"


def test_duplicate_nonce_is_denied_as_replay():
    gov = Governor(GovernorConfig(budget_usd=10.0))
    v1, _ = gov.evaluate("tool.x", nonce="n-1")
    assert v1 == "ALLOW"
    v2, reason2 = gov.evaluate("tool.x", nonce="n-1")
    assert v2 == "DENY"
    assert reason2 == "policy_violation:duplicate_nonce"
    assert classify_reason(reason2) is DenyReason.POLICY_VIOLATION


def test_malformed_input_outranks_an_already_open_circuit():
    """Step 1 sits above step 2, so a malformed call reports malformed_input
    even on a governor whose circuit is already tripped."""
    gov = Governor(GovernorConfig(budget_usd=10.0))
    gov.circuit_tripped = True
    verdict, reason = gov.evaluate("tool.x", params={"__noncanonical__": True})
    assert verdict == "DENY"
    assert reason == "policy_violation:malformed_input"


def test_malformed_input_outranks_budget_exhaustion():
    gov = Governor(GovernorConfig(budget_usd=0.01))
    verdict, reason = gov.evaluate(
        "tool.x", cost_usd=99.0, params={"__noncanonical__": True}
    )
    assert verdict == "DENY"
    assert reason == "policy_violation:malformed_input"


def test_max_repeat_exceeded_on_the_ceiling_call():
    """evaluate() increments the repeat counter BEFORE calling decide(), and
    decide() denies at `count >= max_repeat_calls`. With max_repeat_calls=3
    that means the THIRD call is the one denied, not the fourth. The fourth
    then reports circuit_open because the third DENY tripped the breaker."""
    gov = Governor(GovernorConfig(budget_usd=100.0, max_repeat_calls=3))
    reasons = [gov.evaluate("tool.loop")[1] for _ in range(4)]
    assert reasons == [
        "within_thresholds",
        "within_thresholds",
        "max_repeat_exceeded",
        "circuit_open",
    ]


def test_shackle_rule_veto_overrides_allow():
    """A matched declarative rule must convert an ALLOW into a DENY."""
    gov = Governor(GovernorConfig(budget_usd=10.0))
    verdict, reason = gov.evaluate("robot.move", tags=["human_harm"])
    assert verdict == "DENY"
    assert reason.startswith("shackle_rule_veto:")
    assert "SHACKLE-1" in reason


def test_veto_beats_a_high_positive_ethics_score():
    """ADROS's SafetyKernel rule: a positive score can never outvote a hard
    veto. human_safety(+12) + no_harm(+10) is strongly positive, but the
    hostile_action veto still wins."""
    gov = Governor(GovernorConfig(budget_usd=10.0, ethics_threshold=0))
    verdict, reason = gov.evaluate(
        "drone.strike", tags=["human_safety", "no_harm", "hostile_action"]
    )
    assert verdict == "DENY"
    assert reason.startswith("shackle_rule_veto:")


def test_ethics_below_threshold_denies_when_no_rule_matched():
    """privacy_violation(-8) is negative but matches no baseline veto rule, so
    the ethics layer is what denies it."""
    gov = Governor(GovernorConfig(budget_usd=10.0, ethics_threshold=0))
    verdict, reason = gov.evaluate("scrape.contacts", tags=["privacy_violation"])
    assert verdict == "DENY"
    assert reason.startswith("ethics_below_threshold:")
    assert classify_reason("ethics_below_threshold") is DenyReason.ETHICS_BELOW_THRESHOLD


def test_positive_tags_still_allow():
    gov = Governor(GovernorConfig(budget_usd=10.0, ethics_threshold=0))
    verdict, reason = gov.evaluate("docs.read", tags=["transparency", "no_harm"])
    assert verdict == "ALLOW"
    assert reason == "within_thresholds"


def test_resource_deny_is_not_masked_by_positive_content_tags():
    """A budget DENY must survive strongly pro-social tags. Content checks are
    layered on top of ALLOW only; they never upgrade a resource DENY."""
    gov = Governor(GovernorConfig(budget_usd=0.05, ethics_threshold=0))
    verdict, reason = gov.evaluate(
        "tool.x", cost_usd=0.05, tags=["human_safety", "no_harm", "transparency"]
    )
    assert verdict == "DENY"
    assert reason == "budget_exhausted"


def test_hitl_timeout_resolves_to_deny_and_trips_circuit():
    """Silence is never approval."""
    gov = Governor(GovernorConfig(budget_usd=10.0, hitl_mode="always"))
    gov.evaluate("tool.x")
    gov.request_hitl("tool.x", "hitl_all_calls")
    verdict, reason = gov.hitl_timeout()
    assert verdict == "DENY"
    assert reason == "hitl_timeout"
    assert gov.circuit_tripped is True
    assert gov._pending_hitl is None


def test_hitl_timeout_is_recorded_in_the_ledger():
    gov = Governor(GovernorConfig(budget_usd=10.0))
    before = len(gov.ledger)
    gov.hitl_timeout()
    assert len(gov.ledger) == before + 1
    assert gov.ledger.entries[-1].verdict == "DENY"
    assert gov.ledger.entries[-1].reason == "hitl_timeout"


def test_approved_hitl_transition_allows_and_short_circuits_budget():
    """An operator approval is authoritative and is checked at step 4, above
    the budget check at step 5 — so an approved transition proceeds even with
    the budget already gone."""
    gov = Governor(GovernorConfig(budget_usd=0.01))
    gov.request_hitl("tool.x", "hitl_all_calls")
    gov.resolve_hitl("approve")
    verdict, reason = gov.evaluate("tool.x", cost_usd=5.0)
    assert verdict == "ALLOW"
    assert reason == "hitl_transition:approve"


def test_rejected_hitl_transition_denies():
    gov = Governor(GovernorConfig(budget_usd=10.0))
    gov.request_hitl("tool.x", "hitl_all_calls")
    gov.resolve_hitl("reject")
    verdict, reason = gov.evaluate("tool.x")
    assert verdict == "DENY"
    assert reason == "hitl_transition:reject"


def test_modify_hitl_transition_allows_successor():
    gov = Governor(GovernorConfig(budget_usd=10.0))
    gov.request_hitl("tool.x", "hitl_all_calls")
    gov.resolve_hitl("modify")
    verdict, reason = gov.evaluate("tool.x")
    assert verdict == "ALLOW"
    assert reason == "hitl_transition:modify_successor"


def test_clear_hitl_removes_the_pending_transition():
    gov = Governor(GovernorConfig(budget_usd=10.0))
    gov.request_hitl("tool.x", "hitl_all_calls")
    gov.resolve_hitl("approve")
    gov.clear_hitl()
    assert gov._pending_hitl is None
    verdict, reason = gov.evaluate("tool.x")
    assert (verdict, reason) == ("ALLOW", "within_thresholds")


def test_every_verdict_is_appended_to_the_ledger():
    gov = Governor(GovernorConfig(budget_usd=10.0))
    gov.evaluate("tool.a")
    gov.evaluate("tool.b")
    gov.evaluate("tool.c", tags=["human_harm"])  # DENY
    assert len(gov.ledger) == 3
    assert [e.verdict for e in gov.ledger.entries] == ["ALLOW", "ALLOW", "DENY"]
    assert gov.ledger.verify() is True
