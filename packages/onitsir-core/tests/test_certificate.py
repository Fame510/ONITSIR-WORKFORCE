"""Conformance certificate digest integrity.

The certificate's only claim is that a named implementation at a named version
passed the published vectors. These tests confirm that claim cannot be edited
without invalidating the digest, in particular that a NON_CONFORMANT result
cannot be upgraded to CONFORMANT.
"""
from onitsir.conformance import (
    ConformanceRunner,
    issue_certificate,
    verify_certificate,
)
from onitsir.conformance.certificate import CERT_SCHEMA


def _report():
    return ConformanceRunner(
        implementation="onitsir-core", implementation_version="1.0.0"
    ).run()


def test_runner_reports_conformant_against_shipped_vectors():
    report = _report()
    assert report.verdict == "CONFORMANT"
    assert report.total_vectors == report.passed_vectors
    assert report.total_vectors > 0


def test_every_vector_binds_to_a_known_clause():
    report = _report()
    clause_ids = {c.clause for c in report.clause_results}
    for vector in report.vector_results:
        assert vector.clause in clause_ids


def test_every_clause_has_at_least_one_vector():
    """A clause with no vectors reports as failed rather than silently
    passing. Asserting coverage keeps that from happening by accident."""
    report = _report()
    for clause in report.clause_results:
        assert clause.vector_ids, "clause has no bound vectors: " + clause.clause


def test_highest_level_is_the_provider_contract_level():
    report = _report()
    assert report.highest_level == "L3_PROVIDER_CONTRACT"


def test_issued_certificate_verifies():
    cert = issue_certificate(_report())
    assert cert["schema"] == CERT_SCHEMA
    assert verify_certificate(cert) is True


def test_certificate_records_the_implementation_identity():
    cert = issue_certificate(_report())
    assert cert["implementation"] == "onitsir-core"
    assert cert["implementation_version"] == "1.0.0"
    assert cert["standard"] == "ONITSIR"


def test_tampering_with_the_verdict_invalidates_the_certificate():
    """The forgery this design exists to stop."""
    cert = issue_certificate(_report())
    cert["verdict"] = "CONFORMANT_PLUS"
    assert verify_certificate(cert) is False


def test_upgrading_a_non_conformant_verdict_is_detected():
    report = _report()
    report.verdict = "NON_CONFORMANT"
    cert = issue_certificate(report)
    assert verify_certificate(cert) is True
    cert["verdict"] = "CONFORMANT"
    assert verify_certificate(cert) is False


def test_tampering_with_the_implementation_name_invalidates_it():
    """Stops a passing certificate being re-badged onto another product."""
    cert = issue_certificate(_report())
    cert["implementation"] = "someone-elses-engine"
    assert verify_certificate(cert) is False


def test_tampering_with_vector_totals_invalidates_it():
    cert = issue_certificate(_report())
    cert["vector_totals"] = [999, 999]
    assert verify_certificate(cert) is False


def test_adding_a_fake_passing_clause_invalidates_it():
    cert = issue_certificate(_report())
    cert["clauses"] = list(cert["clauses"]) + [["XX-9", True]]
    assert verify_certificate(cert) is False


def test_tampering_with_the_highest_level_invalidates_it():
    cert = issue_certificate(_report())
    cert["highest_level"] = "L9_TOTAL_SAFETY"
    assert verify_certificate(cert) is False


def test_removing_the_digest_fails_verification():
    cert = issue_certificate(_report())
    del cert["digest"]
    assert verify_certificate(cert) is False


def test_non_dict_input_fails_verification():
    assert verify_certificate(None) is False
    assert verify_certificate("digest") is False
    assert verify_certificate([]) is False


def test_issued_at_is_not_part_of_the_digest():
    """Documented property: issued_at is metadata, not an attested fact, so
    changing it does not invalidate the certificate. Recorded here so nobody
    mistakes the digest for a timestamp attestation."""
    cert = issue_certificate(_report())
    cert["issued_at"] = 0.0
    assert verify_certificate(cert) is True
