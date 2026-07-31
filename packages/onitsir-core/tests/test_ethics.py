"""Additive ethics tag-weight scoring (SYNERGY #12)."""
from onitsir.ethics import EthicsEngine, TAG_WEIGHTS


def test_score_sums_known_tag_weights():
    engine = EthicsEngine()
    score = engine.score(["no_harm", "privacy_respect"])
    assert score == TAG_WEIGHTS["no_harm"] + TAG_WEIGHTS["privacy_respect"]


def test_unknown_tags_score_zero():
    engine = EthicsEngine()
    assert engine.score(["totally_unknown_tag"]) == 0


def test_evaluate_allow_above_threshold():
    engine = EthicsEngine(threshold=0)
    outcome, score = engine.evaluate(["human_safety"])
    assert outcome == "ALLOW"
    assert score == TAG_WEIGHTS["human_safety"]


def test_evaluate_deny_below_threshold():
    engine = EthicsEngine(threshold=0)
    outcome, score = engine.evaluate(["hostile_action", "coercion"])
    assert outcome == "DENY"
    assert score < 0


def test_empty_tags_score_zero_and_allow_at_zero_threshold():
    engine = EthicsEngine(threshold=0)
    outcome, score = engine.evaluate([])
    assert score == 0
    assert outcome == "ALLOW"
