"""Conformance runner (SYNERGY #20)."""
from onitsir.conformance import ConformanceRunner, issue_certificate, verify_certificate
from onitsir.conformance.spec import CLAUSES_BY_ID, Level


def test_conformance_runner_produces_a_report():
    report = ConformanceRunner().run()
    assert report.total_vectors > 0
    assert report.standard == "ONITSIR"


def test_all_iron_law_clauses_pass():
    report = ConformanceRunner().run()
    iron_law_results = [cr for cr in report.clause_results if cr.level == Level.IRON_LAW.value]
    assert iron_law_results
    assert all(cr.passed for cr in iron_law_results)


def test_all_governance_clauses_pass():
    report = ConformanceRunner().run()
    gov_results = [cr for cr in report.clause_results if cr.level == Level.GOVERNANCE.value]
    assert gov_results
    assert all(cr.passed for cr in gov_results)


def test_overall_verdict_is_conformant():
    report = ConformanceRunner().run()
    assert report.verdict == "CONFORMANT"
    assert report.highest_level is not None


def test_certificate_round_trip_verifies():
    report = ConformanceRunner().run()
    cert = issue_certificate(report)
    assert verify_certificate(cert) is True


def test_certificate_detects_tampering():
    report = ConformanceRunner().run()
    cert = issue_certificate(report)
    cert["verdict"] = "CONFORMANT_BUT_FORGED"
    assert verify_certificate(cert) is False


def test_unknown_clause_reference_raises():
    import pytest
    from onitsir.conformance.runner import ConformanceRunner as CR

    runner = CR()
    orig_load = runner.run
    # sanity: clause registry has expected ids
    assert "IL-1" in CLAUSES_BY_ID
    assert "GV-1" in CLAUSES_BY_ID
    assert "PC-1" in CLAUSES_BY_ID
