"""Declarative JSON-rule veto engine (SYNERGY #11)."""
from onitsir.shackle_rules import DEFAULT_RULES, ShackleValidator


def test_loads_baseline_ruleset_by_default():
    validator = ShackleValidator.from_path(None)
    assert len(validator.rules) >= len(DEFAULT_RULES)


def test_any_tags_veto_triggers():
    validator = ShackleValidator()
    vetoes = validator.validate(tags=["human_harm"])
    assert any("no_human_harm" in v for v in vetoes)


def test_no_veto_for_benign_tags():
    validator = ShackleValidator()
    vetoes = validator.validate(tags=["consent_given"])
    assert vetoes == []


def test_all_tags_veto_requires_every_tag(tmp_path):
    rules_file = tmp_path / "rules.json"
    rules_file.write_text(
        '[{"name": "needs-both", "all_tags": ["a", "b"], "reason": "test"}]'
    )
    validator = ShackleValidator.from_path(rules_file)
    assert validator.validate(tags=["a"]) == []
    assert validator.validate(tags=["a", "b"]) == ["needs-both"]


def test_forbid_environment_veto(tmp_path):
    rules_file = tmp_path / "rules.json"
    rules_file.write_text(
        '[{"name": "no-prod", "forbid_environment": ["production"], "reason": "test"}]'
    )
    validator = ShackleValidator.from_path(rules_file)
    assert validator.validate(tags=[], params={"environment": "staging"}) == []
    assert validator.validate(tags=[], params={"environment": "production"}) == ["no-prod"]


def test_require_reversible_if_tags(tmp_path):
    rules_file = tmp_path / "rules.json"
    rules_file.write_text(
        '[{"name": "need-reversible", "require_reversible_if_tags": ["destructive_action"], "reason": "test"}]'
    )
    validator = ShackleValidator.from_path(rules_file)
    # Tag absent -> rule doesn't apply.
    assert validator.validate(tags=[], params={}) == []
    # Tag present, not reversible -> veto.
    assert validator.validate(tags=["destructive_action"], params={"reversible": False}) == ["need-reversible"]
    # Tag present, reversible=True -> fine.
    assert validator.validate(tags=["destructive_action"], params={"reversible": True}) == []


def test_object_shaped_rules_file(tmp_path):
    rules_file = tmp_path / "rules.json"
    rules_file.write_text(
        '{"standard": "CUSTOM", "version": "2.0", "rules": [{"name": "x", "any_tags": ["y"], "reason": "z"}]}'
    )
    validator = ShackleValidator.from_path(rules_file)
    assert validator.standard == "CUSTOM"
    assert validator.version == "2.0"
    assert validator.validate(tags=["y"]) == ["x"]
