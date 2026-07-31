"""SP/1.0-Custody: the enforcement boundary, tested as a boundary.

The valuable assertions here are not "an authorized call runs". They are
"an unauthorized call cannot run, and the attempt is recorded". Each test
below either burns a capability or proves one was never issued.
"""
import pytest

from onitsir.canonical import canonical_hash
from onitsir.custody import (
    PROTECTED_TOOLS,
    CapabilityHolder,
    CapabilityInvalid,
    CapabilityRequired,
    CustodyDaemon,
    CustodyLedger,
    ProtectedExecutor,
    UnknownTool,
    is_protected,
)
from onitsir.custody.ledger import EVENT_MINTED, EVENT_REFUSED, EVENT_SPENT
from onitsir.custody import signing
from onitsir.shackle import Governor, GovernorConfig

MISSION = "mission-under-test"


@pytest.fixture
def holder():
    return CapabilityHolder()


@pytest.fixture
def daemon(holder):
    return CustodyDaemon(holder)


@pytest.fixture
def executor(holder):
    ex = ProtectedExecutor(holder)
    ex.register("email.send", lambda params: {"sent": params})
    ex.register("payments.transfer", lambda params: {"transferred": params})
    ex.register("docs.read", lambda params: {"read": params})
    return ex


def _gov(**kwargs):
    kwargs.setdefault("budget_usd", 10.0)
    return Governor(GovernorConfig(**kwargs))


# --- the protected surface --------------------------------------------------
def test_protected_tool_set_is_explicit():
    """Membership is a security decision, so it is a literal set rather than
    a pattern. A pattern typo would silently unprotect a tool."""
    assert is_protected("payments.transfer") is True
    assert is_protected("email.send") is True
    assert is_protected("docs.read") is False
    assert isinstance(PROTECTED_TOOLS, frozenset)


# --- minting ----------------------------------------------------------------
def test_allow_on_a_protected_tool_mints_a_capability(daemon, holder):
    auth = daemon.authorize(
        _gov(), mission_id=MISSION, tool_name="email.send", nonce="n-1",
        params={"to": "ops@example.com"},
    )
    assert auth.verdict == "ALLOW"
    assert auth.granted is True
    assert holder.live_count() == 1


def test_allow_on_an_unprotected_tool_mints_nothing(daemon, holder):
    """Returning a capability for an unprotected tool would imply a guarantee
    the executor does not enforce for it."""
    auth = daemon.authorize(_gov(), mission_id=MISSION, tool_name="docs.read", nonce="n-1")
    assert auth.verdict == "ALLOW"
    assert auth.granted is False
    assert holder.live_count() == 0


def test_deny_mints_nothing(daemon, holder):
    gov = _gov(budget_usd=0.10)
    auth = daemon.authorize(
        gov, mission_id=MISSION, tool_name="email.send", cost_usd=0.10, nonce="n-1",
    )
    assert auth.verdict == "DENY"
    assert auth.capability is None
    assert holder.live_count() == 0


def test_hitl_mints_nothing(daemon, holder):
    auth = daemon.authorize(
        _gov(hitl_mode="always"), mission_id=MISSION, tool_name="email.send", nonce="n-1",
    )
    assert auth.verdict == "HITL"
    assert auth.capability is None
    assert holder.live_count() == 0


def test_the_capability_digest_is_the_canonical_hash_of_the_arguments(daemon):
    params = {"b": 2, "a": 1}
    auth = daemon.authorize(
        _gov(), mission_id=MISSION, tool_name="email.send", nonce="n-1", params=params,
    )
    assert auth.capability.args_digest == canonical_hash(params)


# --- bypass resistance ------------------------------------------------------
def test_a_protected_tool_cannot_run_without_a_capability(executor):
    """The claim this whole package exists to support: a caller that ignores
    the gate does not get a slap on the wrist, it gets no token."""
    with pytest.raises(CapabilityRequired):
        executor.execute("email.send", mission_id=MISSION, nonce="n-1", params={"to": "x"})


def test_a_bypass_attempt_is_recorded_rather_than_merely_absent(executor, holder):
    with pytest.raises(CapabilityRequired):
        executor.execute("email.send", mission_id=MISSION, nonce="n-1", params={})
    last = holder.ledger.entries()[-1]
    assert last.event == EVENT_REFUSED
    assert last.detail == "missing"


def test_a_denied_call_leaves_the_caller_with_nothing_to_present(daemon, executor):
    gov = _gov(budget_usd=0.10)
    auth = daemon.authorize(
        gov, mission_id=MISSION, tool_name="email.send", cost_usd=0.10, nonce="n-1",
    )
    assert auth.verdict == "DENY"
    with pytest.raises(CapabilityRequired):
        executor.execute("email.send", mission_id=MISSION, nonce="n-1", params={})


def test_an_unknown_token_is_refused(executor):
    with pytest.raises(CapabilityInvalid) as exc:
        executor.execute(
            "email.send", mission_id=MISSION, capability_token="fabricated", nonce="n-1",
        )
    assert exc.value.reason == "replayed"


# --- redemption -------------------------------------------------------------
def test_an_authorized_call_runs(daemon, executor):
    auth = daemon.authorize(
        _gov(), mission_id=MISSION, tool_name="email.send", nonce="n-1",
        params={"to": "ops@example.com"},
    )
    result = executor.execute(
        "email.send", mission_id=MISSION,
        capability_token=auth.capability.token_id, nonce="n-1",
        params={"to": "ops@example.com"},
    )
    assert result == {"sent": {"to": "ops@example.com"}}


def test_a_capability_is_single_use(daemon, executor):
    auth = daemon.authorize(
        _gov(), mission_id=MISSION, tool_name="email.send", nonce="n-1", params={},
    )
    executor.execute(
        "email.send", mission_id=MISSION,
        capability_token=auth.capability.token_id, nonce="n-1", params={},
    )
    with pytest.raises(CapabilityInvalid) as exc:
        executor.execute(
            "email.send", mission_id=MISSION,
            capability_token=auth.capability.token_id, nonce="n-1", params={},
        )
    assert exc.value.reason == "replayed"


def test_a_capability_does_not_authorize_different_arguments(daemon, executor):
    """docs/ROADMAP.md item 2. An ALLOW obtained for one recipient is
    cryptographically useless for another."""
    auth = daemon.authorize(
        _gov(), mission_id=MISSION, tool_name="email.send", nonce="n-1",
        params={"to": "ops@example.com"},
    )
    with pytest.raises(CapabilityInvalid) as exc:
        executor.execute(
            "email.send", mission_id=MISSION,
            capability_token=auth.capability.token_id, nonce="n-1",
            params={"to": "attacker@example.com"},
        )
    assert exc.value.reason == "args_mismatch"


def test_a_capability_does_not_authorize_a_different_tool(daemon, executor):
    auth = daemon.authorize(
        _gov(), mission_id=MISSION, tool_name="email.send", nonce="n-1", params={},
    )
    with pytest.raises(CapabilityInvalid) as exc:
        executor.execute(
            "payments.transfer", mission_id=MISSION,
            capability_token=auth.capability.token_id, nonce="n-1", params={},
        )
    assert exc.value.reason == "tool_mismatch"


def test_a_capability_does_not_cross_missions(daemon, executor):
    auth = daemon.authorize(
        _gov(), mission_id=MISSION, tool_name="email.send", nonce="n-1", params={},
    )
    with pytest.raises(CapabilityInvalid) as exc:
        executor.execute(
            "email.send", mission_id="a-different-mission",
            capability_token=auth.capability.token_id, nonce="n-1", params={},
        )
    assert exc.value.reason == "mission_mismatch"


def test_a_capability_does_not_authorize_a_different_nonce(daemon, executor):
    auth = daemon.authorize(
        _gov(), mission_id=MISSION, tool_name="email.send", nonce="n-1", params={},
    )
    with pytest.raises(CapabilityInvalid) as exc:
        executor.execute(
            "email.send", mission_id=MISSION,
            capability_token=auth.capability.token_id, nonce="n-2", params={},
        )
    assert exc.value.reason == "nonce_mismatch"


def test_a_capability_expires(daemon, executor):
    auth = daemon.authorize(
        _gov(), mission_id=MISSION, tool_name="email.send", nonce="n-1",
        params={}, ttl_s=1.0,
    )
    with pytest.raises(CapabilityInvalid) as exc:
        executor.execute(
            "email.send", mission_id=MISSION,
            capability_token=auth.capability.token_id, nonce="n-1", params={},
            now=auth.capability.expires_at + 1.0,
        )
    assert exc.value.reason == "expired"


def test_a_misaimed_capability_is_burned_not_left_for_a_second_attempt(daemon, executor):
    """The token is popped before any binding check. An attacker who guesses
    wrong once does not get to guess again with the same token."""
    auth = daemon.authorize(
        _gov(), mission_id=MISSION, tool_name="email.send", nonce="n-1",
        params={"to": "ops@example.com"},
    )
    with pytest.raises(CapabilityInvalid):
        executor.execute(
            "email.send", mission_id=MISSION,
            capability_token=auth.capability.token_id, nonce="n-1",
            params={"to": "wrong@example.com"},
        )
    with pytest.raises(CapabilityInvalid) as exc:
        executor.execute(
            "email.send", mission_id=MISSION,
            capability_token=auth.capability.token_id, nonce="n-1",
            params={"to": "ops@example.com"},
        )
    assert exc.value.reason == "replayed"


def test_argument_order_does_not_change_the_binding(daemon, executor):
    """The binding is over the canonical hash, not over a serialization, so a
    caller that reorders its own keys is not punished for it."""
    auth = daemon.authorize(
        _gov(), mission_id=MISSION, tool_name="email.send", nonce="n-1",
        params={"to": "ops@example.com", "subject": "s"},
    )
    executor.execute(
        "email.send", mission_id=MISSION,
        capability_token=auth.capability.token_id, nonce="n-1",
        params={"subject": "s", "to": "ops@example.com"},
    )


def test_an_unprotected_tool_runs_with_no_capability(executor):
    assert executor.execute("docs.read", mission_id=MISSION, params={"p": 1}) == {"read": {"p": 1}}


def test_an_unregistered_tool_raises(executor):
    with pytest.raises(UnknownTool):
        executor.execute("docs.read.unregistered", mission_id=MISSION)


# --- revocation -------------------------------------------------------------
def test_a_tripped_circuit_revokes_outstanding_capabilities(daemon, holder):
    """A capability was minted under an assumption that no longer holds."""
    gov = _gov(budget_usd=0.20)
    daemon.authorize(
        gov, mission_id=MISSION, tool_name="email.send", cost_usd=0.05, nonce="n-1",
    )
    assert holder.live_count() == 1

    denied = daemon.authorize(
        gov, mission_id=MISSION, tool_name="email.send", cost_usd=0.20, nonce="n-2",
    )
    assert denied.verdict == "DENY"
    assert holder.live_count() == 0


def test_revoke_drops_one_capability(daemon, holder):
    auth = daemon.authorize(
        _gov(), mission_id=MISSION, tool_name="email.send", nonce="n-1",
    )
    assert holder.revoke(auth.capability.token_id) is True
    assert holder.revoke(auth.capability.token_id) is False


def test_revoke_mission_only_touches_that_mission(daemon, holder):
    daemon.authorize(_gov(), mission_id=MISSION, tool_name="email.send", nonce="n-1")
    daemon.authorize(_gov(), mission_id="other", tool_name="email.send", nonce="n-1")
    assert holder.revoke_mission(MISSION) == 1
    assert holder.live_count() == 1


# --- HITL interaction -------------------------------------------------------
def test_an_operator_approval_still_requires_a_capability(daemon, executor):
    """Approving at the gate does not hand the caller a token directly. The
    approval makes the next authorize() return ALLOW; the token comes from
    that ALLOW, and nowhere else."""
    gov = _gov(hitl_mode="always")
    first = daemon.authorize(
        gov, mission_id=MISSION, tool_name="email.send", nonce="n-1", params={"to": "x"},
    )
    assert first.verdict == "HITL"
    assert first.capability is None

    gov.request_hitl("email.send", "hitl_all_calls", nonce="n-1", params={"to": "x"})
    gov.resolve_hitl("approve")

    second = daemon.authorize(
        gov, mission_id=MISSION, tool_name="email.send", nonce="n-1", params={"to": "x"},
    )
    assert second.verdict == "ALLOW"
    assert second.granted is True
    executor.execute(
        "email.send", mission_id=MISSION,
        capability_token=second.capability.token_id, nonce="n-1", params={"to": "x"},
    )


# --- the custody ledger -----------------------------------------------------
def test_mint_and_spend_are_both_recorded(daemon, executor, holder):
    auth = daemon.authorize(
        _gov(), mission_id=MISSION, tool_name="email.send", nonce="n-1", params={},
    )
    executor.execute(
        "email.send", mission_id=MISSION,
        capability_token=auth.capability.token_id, nonce="n-1", params={},
    )
    assert [e.event for e in holder.ledger.entries()] == [EVENT_MINTED, EVENT_SPENT]


def test_the_custody_ledger_is_hash_chained(holder):
    holder.ledger.append(EVENT_MINTED, mission_id=MISSION, tool_name="a", token_id="t1")
    holder.ledger.append(EVENT_SPENT, mission_id=MISSION, tool_name="a", token_id="t1")
    assert holder.ledger.verify() is True


def test_mutating_a_custody_entry_breaks_the_chain():
    ledger = CustodyLedger()
    ledger.append(EVENT_MINTED, mission_id=MISSION, tool_name="a", token_id="t1")
    ledger.append(EVENT_SPENT, mission_id=MISSION, tool_name="a", token_id="t1")
    original = ledger._entries[0]
    tampered = type(original)(
        index=original.index, at=original.at, event=EVENT_SPENT,
        mission_id=original.mission_id, tool_name=original.tool_name,
        token_id=original.token_id, detail=original.detail,
        prev_hash=original.prev_hash, entry_hash=original.entry_hash,
    )
    ledger._entries[0] = tampered
    assert ledger.verify() is False


def test_reordering_custody_entries_breaks_the_chain():
    ledger = CustodyLedger()
    ledger.append(EVENT_MINTED, mission_id=MISSION, tool_name="a", token_id="t1")
    ledger.append(EVENT_SPENT, mission_id=MISSION, tool_name="a", token_id="t1")
    ledger._entries.reverse()
    assert ledger.verify() is False


def test_entries_can_be_filtered_by_mission(daemon, holder):
    daemon.authorize(_gov(), mission_id=MISSION, tool_name="email.send", nonce="n-1")
    daemon.authorize(_gov(), mission_id="other", tool_name="email.send", nonce="n-1")
    assert len(holder.ledger.entries(MISSION)) == 1
    assert len(holder.ledger.entries()) == 2


# --- signing ----------------------------------------------------------------
def test_a_signature_covers_every_bound_field():
    key = signing.new_key()
    fields = {"a": "1", "b": "2"}
    sig = signing.sign(key, fields)
    assert signing.verify(key, fields, sig) is True
    assert signing.verify(key, {"a": "1", "b": "3"}, sig) is False


def test_a_signature_does_not_verify_under_a_different_key():
    fields = {"a": "1"}
    sig = signing.sign(signing.new_key(), fields)
    assert signing.verify(signing.new_key(), fields, sig) is False


def test_the_binding_payload_is_order_independent():
    assert signing.binding_payload({"b": 2, "a": 1}) == signing.binding_payload({"a": 1, "b": 2})


def test_two_different_bindings_do_not_share_a_payload():
    """The separator is a control character that cannot appear in a mission
    id, tool name, nonce or hex digest, so no two bindings collide."""
    left = signing.binding_payload({"tool_name": "a", "nonce": "b"})
    right = signing.binding_payload({"tool_name": "a\x1fnonce=b", "nonce": ""})
    assert left != right


def test_a_forged_signature_is_refused(holder):
    """A token whose stored signature does not verify is refused even though
    every other bound field matches."""
    capability = holder.mint(mission_id=MISSION, tool_name="email.send", nonce="n-1")
    holder._live[capability.token_id] = type(capability)(
        token_id=capability.token_id,
        mission_id=capability.mission_id,
        tool_name=capability.tool_name,
        nonce=capability.nonce,
        args_digest=capability.args_digest,
        expires_at=capability.expires_at,
        signature="0" * 64,
    )
    with pytest.raises(CapabilityInvalid) as exc:
        holder.redeem(
            capability.token_id, mission_id=MISSION, tool_name="email.send", nonce="n-1",
        )
    assert exc.value.reason == "bad_signature"


def test_token_ids_are_unguessable_and_unique():
    seen = {signing.new_token_id() for _ in range(256)}
    assert len(seen) == 256
    assert all(len(t) >= 40 for t in seen)
