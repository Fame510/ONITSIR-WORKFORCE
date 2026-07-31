"""Audit ledger tamper detection.

The ledger's claim is narrow and worth testing precisely: it is
tamper-EVIDENT, not tamper-proof. It detects modification, removal, and
reordering after the fact. It does not prevent them.

These tests mutate `ledger._entries` directly, which is exactly what an
attacker with process memory access would do.
"""
import dataclasses

from onitsir.audit_ledger import GENESIS, AuditLedger, LedgerEntry, canonical_hash


def _ledger_with(n: int) -> AuditLedger:
    ledger = AuditLedger()
    for i in range(n):
        ledger.append(f"tool.{i}", "ALLOW", "within_thresholds", at=1000.0 + i)
    return ledger


def test_fresh_ledger_is_intact_and_head_is_genesis():
    ledger = AuditLedger()
    assert len(ledger) == 0
    assert ledger.head == GENESIS
    assert ledger.verify() is True


def test_first_entry_chains_to_genesis():
    ledger = _ledger_with(1)
    assert ledger.entries[0].prev_hash == GENESIS
    assert ledger.entries[0].index == 0


def test_chain_links_each_entry_to_its_predecessor():
    ledger = _ledger_with(4)
    entries = ledger.entries
    for i in range(1, len(entries)):
        assert entries[i].prev_hash == entries[i - 1].entry_hash
    assert ledger.head == entries[-1].entry_hash
    assert ledger.verify() is True


def test_mutating_a_verdict_breaks_the_chain():
    ledger = _ledger_with(3)
    victim = ledger._entries[1]
    ledger._entries[1] = dataclasses.replace(victim, verdict="DENY")
    assert ledger.verify() is False


def test_mutating_a_reason_breaks_the_chain():
    ledger = _ledger_with(3)
    victim = ledger._entries[0]
    ledger._entries[0] = dataclasses.replace(victim, reason="within_thresholds ")
    assert ledger.verify() is False


def test_mutating_a_timestamp_breaks_the_chain():
    """Backdating an entry is a realistic attack and must be detected."""
    ledger = _ledger_with(3)
    victim = ledger._entries[2]
    ledger._entries[2] = dataclasses.replace(victim, at=0.0)
    assert ledger.verify() is False


def test_deleting_an_entry_breaks_the_chain():
    ledger = _ledger_with(4)
    del ledger._entries[1]
    assert ledger.verify() is False


def test_reordering_entries_breaks_the_chain():
    ledger = _ledger_with(3)
    ledger._entries[0], ledger._entries[2] = ledger._entries[2], ledger._entries[0]
    assert ledger.verify() is False


def test_truncating_the_tail_is_not_detected_by_verify():
    """Documented limitation, asserted so it is a known property rather than a
    surprise: dropping trailing entries leaves a shorter but internally
    consistent chain. Detecting truncation requires an external witness of the
    expected head, which the ledger alone cannot provide."""
    ledger = _ledger_with(4)
    del ledger._entries[3]
    assert len(ledger) == 3
    assert ledger.verify() is True


def test_appending_a_forged_entry_with_recomputed_hash_is_detected_by_signature():
    """An attacker who recomputes entry_hash produces a chain that passes the
    hash check. Only the Ed25519 signature catches it — and only when nacl is
    installed. If nacl is unavailable the ledger degrades to hash-chain-only
    integrity, which this test tolerates explicitly rather than silently."""
    ledger = _ledger_with(2)
    prev = ledger._entries[-1].entry_hash
    forged_hash = canonical_hash({
        "index": 2, "at": 2000.0, "tool_name": "tool.forged",
        "verdict": "ALLOW", "reason": "within_thresholds", "prev_hash": prev,
    })
    ledger._entries.append(LedgerEntry(
        index=2, at=2000.0, tool_name="tool.forged", verdict="ALLOW",
        reason="within_thresholds", prev_hash=prev, entry_hash=forged_hash,
        signature="00" * 64, verify_key=ledger.verify_key_hex,
    ))
    if ledger.verify_key_hex:
        # Signing is active: the bogus signature must be rejected.
        assert ledger.verify() is False
    else:
        # No nacl: hash-chain-only mode. The forgery is consistent, so it
        # passes. This is the documented degradation, not a silent failure.
        assert ledger.verify() is True


def test_signed_entries_carry_signature_and_verify_key_when_available():
    ledger = _ledger_with(1)
    entry = ledger.entries[0]
    if ledger.verify_key_hex:
        assert entry.signature
        assert entry.verify_key == ledger.verify_key_hex
    else:
        assert entry.signature == ""


def test_entries_property_returns_a_copy():
    """Callers must not be able to corrupt the ledger through the public
    accessor."""
    ledger = _ledger_with(2)
    snapshot = ledger.entries
    snapshot.clear()
    assert len(ledger) == 2
    assert ledger.verify() is True


def test_identical_content_at_different_positions_yields_different_hashes():
    """The index and prev_hash are part of the digest, so a replayed entry
    cannot be relocated within the chain."""
    ledger = AuditLedger()
    a = ledger.append("tool.same", "ALLOW", "within_thresholds", at=1000.0)
    b = ledger.append("tool.same", "ALLOW", "within_thresholds", at=1000.0)
    assert a.entry_hash != b.entry_hash
