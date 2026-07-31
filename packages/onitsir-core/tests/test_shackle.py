"""Governor decide() with all deny reasons, HITL flow with timeout,
declarative veto rules, ethics scoring (SYNERGY #3, #6, #9, #10, #11, #12)."""
import time

import pytest

from onitsir.shackle import (
    AuditLedger, DenyReason, Governor, GovernorConfig, HitlMode, VerdictEnum,
    canonical_hash, classify_reason, decide,
)


# --- pure decide() precedence tests -----------------------------------------
def test_decide_malformed_input_denies():
    verdict, reason = decide({}, {}, {"params": {"__noncanonical__": True}})
    assert verdict == "DENY"
    assert reason == "policy_violation:malformed_input"


def test_decide_circuit_open_denies():
    verdict, reason = decide({}, {"circuit_tripped": True}, {"tool_name": "x", "params": {}})
    assert verdict == "DENY"
    assert reason == "circuit_open"


def test_decide_duplicate_nonce_denies():
    state = {"seen_nonces": ["abc"]}
    verdict, reason = decide({}, state, {"tool_name": "x", "nonce": "abc", "params": {}})
    assert verdict == "DENY"
    assert reason == "policy_violation:duplicate_nonce"


def test_decide_hitl_transition_approve():
    state = {"pending_transition": {"decision": "approve"}}
    verdict, _ = decide({}, state, {"tool_name": "x", "params": {}})
    assert verdict == "ALLOW"


def test_decide_hitl_transition_reject():
    state = {"pending_transition": {"decision": "reject"}}
    verdict, _ = decide({}, state, {"tool_name": "x", "params": {}})
    assert verdict == "DENY"


def test_decide_budget_exhausted_denies():
    config = {"budget_usd": 5.0}
    state = {"budget_remaining_usd": 0.0}
    verdict, reason = decide(config, state, {"tool_name": "x", "params": {}})
    assert verdict == "DENY"
    assert reason == "budget_exhausted"


def test_decide_max_repeat_exceeded_denies():
    config = {"max_repeat_calls": 2}
    state = {"repeat_counts": {"x": 2}, "last_tool_name": "x"}
    verdict, reason = decide(config, state, {"tool_name": "x", "params": {}})
    assert verdict == "DENY"
    assert reason == "max_repeat_exceeded"


def test_decide_hitl_always():
    config = {"hitl_mode": "always"}
    verdict, reason = decide(config, {}, {"tool_name": "x", "params": {}})
    assert verdict == "HITL"
    assert reason == "hitl_all_calls"


def test_decide_hitl_budget_threshold():
    config = {"hitl_mode": "on_threshold", "hitl_budget_threshold": 0.5}
    state = {"budget_initial_usd": 10.0, "budget_remaining_usd": 4.0}
    verdict, reason = decide(config, state, {"tool_name": "x", "params": {}})
    assert verdict == "HITL"
    assert reason == "budget_threshold"


def test_decide_opaque_context_hitl():
    verdict, reason = decide({}, {}, {"tool_name": "x", "params": {"ctx": "opaque"}})
    assert verdict == "HITL"
    assert reason == "fail_closed:opaque_context"


def test_decide_default_allow():
    verdict, reason = decide({}, {}, {"tool_name": "x", "params": {}})
    assert verdict == "ALLOW"
    assert reason == "within_thresholds"


def test_classify_reason_maps_known_buckets():
    assert classify_reason("circuit_open") == DenyReason.CIRCUIT_OPEN
    assert classify_reason("policy_violation:malformed_input") == DenyReason.POLICY_VIOLATION
    assert classify_reason("something_unmapped") == DenyReason.UNSPECIFIED


# --- canonical_hash --------------------------------------------------------
def test_canonical_hash_is_deterministic():
    a = canonical_hash({"b": 1, "a": 2})
    b = canonical_hash({"a": 2, "b": 1})
    assert a == b


# --- AuditLedger ------------------------------------------------------------
def test_audit_ledger_chain_intact():
    ledger = AuditLedger()
    ledger.append("tool.a", "ALLOW", "ok")
    ledger.append("tool.b", "DENY", "budget")
    assert ledger.verify() is True
    assert len(ledger) == 2


def test_audit_ledger_detects_tampering():
    ledger = AuditLedger()
    ledger.append("tool.a", "ALLOW", "ok")
    entry = ledger.entries[0]
    # Mutate a frozen dataclass's underlying entry list directly to simulate tampering.
    tampered = entry.__class__(
        index=entry.index, at=entry.at, tool_name="tool.a-tampered",
        verdict=entry.verdict, reason=entry.reason, prev_hash=entry.prev_hash,
        entry_hash=entry.entry_hash, signature=entry.signature, verify_key=entry.verify_key,
    )
    ledger._entries[0] = tampered
    assert ledger.verify() is False


def test_audit_ledger_signing_round_trip_if_nacl_available():
    ledger = AuditLedger()
    entry = ledger.append("tool.a", "ALLOW", "ok")
    if entry.signature:
        assert ledger.verify() is True


# --- Governor: resource breakers --------------------------------------------
def test_governor_budget_exhaustion_denies_and_trips_circuit():
    # Matches ONITSIR's original semantics: cost is deducted from the
    # budget BEFORE decide() runs, so the call that spends the last cent
    # still succeeds; the NEXT call (now with 0 remaining) is denied.
    gov = Governor(GovernorConfig(budget_usd=0.10))
    v1, _ = gov.evaluate("llm.generate", cost_usd=0.05)
    assert v1 == "ALLOW"
    assert gov.remaining_usd == pytest.approx(0.05)
    v2, r2 = gov.evaluate("llm.generate", cost_usd=0.05)
    assert v2 == "DENY"
    assert r2 == "budget_exhausted"
    assert gov.circuit_tripped is True
    # Once tripped, subsequent calls are denied via circuit_open.
    v3, r3 = gov.evaluate("anything", cost_usd=0.0)
    assert v3 == "DENY"
    assert r3 == "circuit_open"


def test_governor_repeat_breaker():
    # Matches ONITSIR's original semantics: repeat_counts[tool] is
    # incremented BEFORE decide() runs, so with max_repeat_calls=N the Nth
    # call to the same tool is the one that hits (and is denied at) the
    # ceiling -- mirroring ONITSIR's own
    # test_governor_repeat_breaker(max_repeat_calls=3) where the 3rd call denies.
    gov = Governor(GovernorConfig(max_repeat_calls=3, budget_usd=100.0))
    v1, _ = gov.evaluate("same")
    assert v1 == "ALLOW"
    v2, _ = gov.evaluate("same")
    assert v2 == "ALLOW"
    verdict, reason = gov.evaluate("same")  # 3rd call -> at ceiling
    assert verdict == "DENY"
    assert reason == "max_repeat_exceeded"


def test_governor_ledger_records_every_ruling():
    gov = Governor(GovernorConfig(budget_usd=10.0))
    gov.evaluate("a", cost_usd=0.0)
    gov.evaluate("b", cost_usd=0.0)
    assert len(gov.ledger) == 2
    assert gov.ledger.verify() is True


# --- Governor: HITL bounded-timeout (SYNERGY #10) ---------------------------
def test_governor_hitl_timeout_resolves_to_safe_deny():
    gov = Governor(GovernorConfig(budget_usd=10.0, hitl_mode="always", hitl_timeout_s=0.01))
    verdict, reason = gov.evaluate("email.send", cost_usd=0.0)
    assert verdict == "HITL"
    gov.request_hitl("email.send", reason)
    # Simulate the bounded wait elapsing with no operator response.
    time.sleep(0.02)
    final_verdict, final_reason = gov.hitl_timeout()
    assert final_verdict == "DENY"
    assert final_reason == "hitl_timeout"
    assert gov.circuit_tripped is True


def test_governor_hitl_resolved_by_operator_approve():
    gov = Governor(GovernorConfig(budget_usd=10.0, hitl_mode="always"))
    verdict, reason = gov.evaluate("email.send", cost_usd=0.0)
    assert verdict == "HITL"
    gov.request_hitl("email.send", reason)
    gov.resolve_hitl("approve")
    assert gov._pending_hitl["decision"] == "approve"


def test_hitl_mode_enum_values_match_strings():
    assert HitlMode.ALWAYS.value == "always"
    assert HitlMode.ON_THRESHOLD.value == "on_threshold"


def test_verdict_enum_values_match_strings():
    assert VerdictEnum.ALLOW.value == "ALLOW"
    assert VerdictEnum.DENY.value == "DENY"
    assert VerdictEnum.HITL.value == "HITL"


# --- Governor: declarative veto rules (SYNERGY #11) -------------------------
def test_governor_shackle_rule_veto_denies_regardless_of_budget():
    gov = Governor(GovernorConfig(budget_usd=100.0))
    verdict, reason = gov.evaluate("post_content", cost_usd=0.0, tags=["human_harm"])
    assert verdict == "DENY"
    assert "shackle_rule_veto" in reason


def test_governor_allows_benign_tags():
    gov = Governor(GovernorConfig(budget_usd=100.0))
    verdict, _ = gov.evaluate("post_content", cost_usd=0.0, tags=["consent_given"])
    assert verdict == "ALLOW"


# --- Governor: ethics scoring (SYNERGY #12) --------------------------------
def test_governor_ethics_below_threshold_denies():
    # "deception" is both an ethics-negative tag AND a SHACKLE-3 hard veto
    # tag; vetoes are checked first (matching ADROS's SafetyKernel: a veto
    # always wins), so use a tag combination that is ethics-negative WITHOUT
    # tripping a declarative veto rule to isolate ethics-threshold behavior.
    gov = Governor(GovernorConfig(budget_usd=100.0, ethics_threshold=0))
    verdict, reason = gov.evaluate("post_content", cost_usd=0.0, tags=["privacy_violation"])
    assert verdict == "DENY"
    assert "ethics_below_threshold" in reason


def test_governor_veto_takes_precedence_over_ethics_score():
    """A hard veto tag (e.g. deception) denies regardless of additive score,
    exactly like ADROS's SafetyKernel: 'a positive score can never outvote a
    hard veto'."""
    gov = Governor(GovernorConfig(budget_usd=100.0, ethics_threshold=0))
    verdict, reason = gov.evaluate("post_content", cost_usd=0.0, tags=["deception"])
    assert verdict == "DENY"
    assert "shackle_rule_veto" in reason


def test_governor_ethics_above_threshold_allows():
    gov = Governor(GovernorConfig(budget_usd=100.0, ethics_threshold=0))
    verdict, _ = gov.evaluate("post_content", cost_usd=0.0, tags=["no_harm", "transparency"])
    assert verdict == "ALLOW"
