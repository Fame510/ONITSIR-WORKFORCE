"""SYNERGY #11: Declarative JSON-rule veto engine — ported from
ADROS/backend/cognitive/shackle.py::ShackleValidator.

Lets operators define/version custom hard-veto rules as DATA (JSON) rather
than code — e.g. "never let a specialist post to a public GitHub repo
without explicit consent tag" — exactly as ADROS's SHACKLE conformance seam
does. A baseline ruleset ships in
`onitsir-core/data/shackle_rules/onitsir-baseline.shackle.json`; operators
override it via the `ONITSIR_SHACKLE_RULES` env var (mirroring ADROS's
`ADROS_SHACKLE_RULES`).

Supported predicates per rule (all optional, ANDed):
  - any_tags: veto if ANY of these tags are present
  - all_tags: veto if ALL of these tags are present
  - forbid_environment: veto if params["environment"] is in this list
  - require_reversible_if_tags: veto if any of these tags present AND
    params["reversible"] is not True
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_HERE = Path(__file__).resolve().parent
BASELINE_PATH = _HERE.parent / "data" / "shackle_rules" / "onitsir-baseline.shackle.json"

# Conservative default ruleset (in-code fallback if even the baseline file is
# missing) — generalized, not domain-specific, so it protects any deployment.
DEFAULT_RULES: List[Dict[str, Any]] = [
    {
        "name": "SHACKLE-1:no_human_harm",
        "any_tags": ["human_harm", "lethal_force"],
        "reason": "SHACKLE-1: never execute an action expected to physically harm a human.",
    },
    {
        "name": "SHACKLE-2:no_hostile_action",
        "any_tags": ["hostile_action", "weaponization"],
        "reason": "SHACKLE-2: the platform must not be used to attack or as a weapon.",
    },
    {
        "name": "SHACKLE-3:no_operator_deception",
        "any_tags": ["deception"],
        "reason": "SHACKLE-3: never deceive or conceal state from the human operator.",
    },
]


class ShackleValidator:
    """Runs the SHACKLE ruleset over an action's tags/params and returns any
    triggered rule *names* (vetoes)."""

    def __init__(
        self,
        rules: Optional[List[Dict[str, Any]]] = None,
        standard: str = "SHACKLE",
        version: str = "builtin",
    ) -> None:
        self.standard = standard
        self.version = version
        self.rules = rules if rules is not None else list(DEFAULT_RULES)

    @staticmethod
    def _load_rules_file(path: str | Path) -> Tuple[List[Dict[str, Any]], str, str]:
        """Accept either a bare JSON list of rules or a
        {standard, version, rules} object."""
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, list):
            return data, "SHACKLE", "custom"
        if isinstance(data, dict) and isinstance(data.get("rules"), list):
            return data["rules"], data.get("standard", "SHACKLE"), str(data.get("version", "custom"))
        raise ValueError("SHACKLE rules file must be a JSON list or an object with a 'rules' list")

    @classmethod
    def from_env(cls) -> "ShackleValidator":
        path = os.environ.get("ONITSIR_SHACKLE_RULES")
        return cls.from_path(path)

    @classmethod
    def from_path(cls, path: Optional[str | Path] = None) -> "ShackleValidator":
        """Load, in priority order: an explicit path, the ONITSIR_SHACKLE_RULES
        env var, the committed baseline file, or the in-code fallback."""
        candidate = path or os.environ.get("ONITSIR_SHACKLE_RULES")
        if candidate and Path(candidate).is_file():
            rules, standard, version = cls._load_rules_file(candidate)
            return cls(rules=rules, standard=standard, version=version)
        if BASELINE_PATH.is_file():
            rules, standard, version = cls._load_rules_file(BASELINE_PATH)
            return cls(rules=rules, standard=standard, version=version)
        return cls()

    def validate(self, tags: List[str], params: Optional[Dict[str, Any]] = None) -> List[str]:
        """Return the names of any triggered veto rules (empty = no vetoes)."""
        params = params or {}
        tagset = set(tags)
        environment = params.get("environment")
        reversible = bool(params.get("reversible", False))

        triggered: List[str] = []
        for rule in self.rules:
            name = rule.get("name", "shackle_rule")
            matched = False
            ok = True

            if "any_tags" in rule:
                matched = True
                if not (tagset & set(rule["any_tags"])):
                    ok = False
            if ok and "all_tags" in rule:
                matched = True
                if not set(rule["all_tags"]).issubset(tagset):
                    ok = False
            if ok and "forbid_environment" in rule:
                matched = True
                if environment not in rule["forbid_environment"]:
                    ok = False
            if ok and "require_reversible_if_tags" in rule:
                matched = True
                hit = bool(tagset & set(rule["require_reversible_if_tags"]))
                if hit and reversible:
                    ok = False  # reversible => fine
                elif not hit:
                    ok = False  # tag absent => rule N/A

            if matched and ok:
                triggered.append(name)
        return triggered
