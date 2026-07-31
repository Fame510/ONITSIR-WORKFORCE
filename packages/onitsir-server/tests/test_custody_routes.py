"""SP/1.0-Custody over HTTP: /authorize, /execute and the 403 boundary.

`test_custody.py` proves the enforcement point refuses. These tests prove the
refusal survives the route layer - that a caller talking to the running server
cannot reach a protected tool by skipping `/authorize`, by reusing a token, or
by editing the arguments after approval.
"""
from fastapi.testclient import TestClient

from app.main import app

GOAL = "launch a marketing campaign"


def _mission(client, budget_usd: float = 5.0, hitl_mode: str = "never") -> str:
    r = client.post(
        "/api/mission",
        json={"goal": GOAL, "budget_usd": budget_usd, "hitl_mode": hitl_mode},
    )
    assert r.status_code == 200
    return r.json()["mission_id"]


def test_authorize_returns_a_capability_for_an_allowed_protected_tool():
    with TestClient(app) as client:
        mid = _mission(client)
        r = client.post(
            f"/api/mission/{mid}/authorize",
            json={
                "tool_name": "email.send",
                "cost_usd": 0.1,
                "nonce": "n-1",
                "params": {"to": "ops@example.com"},
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["verdict"] == "ALLOW"
        assert body["protected"] is True
        assert body["capability"]["tool_name"] == "email.send"
        assert body["capability"]["token_id"]


def test_authorize_returns_no_capability_for_an_unprotected_tool():
    with TestClient(app) as client:
        mid = _mission(client)
        r = client.post(
            f"/api/mission/{mid}/authorize",
            json={"tool_name": "docs.read", "nonce": "n-1"},
        )
        assert r.json()["verdict"] == "ALLOW"
        assert r.json()["protected"] is False
        assert r.json()["capability"] is None


def test_authorize_returns_no_capability_on_deny():
    with TestClient(app) as client:
        mid = _mission(client, budget_usd=0.10)
        r = client.post(
            f"/api/mission/{mid}/authorize",
            json={"tool_name": "email.send", "cost_usd": 0.10, "nonce": "n-1"},
        )
        assert r.json()["verdict"] == "DENY"
        assert r.json()["capability"] is None


def test_authorize_returns_no_capability_on_hitl():
    with TestClient(app) as client:
        mid = _mission(client, hitl_mode="always")
        r = client.post(
            f"/api/mission/{mid}/authorize",
            json={"tool_name": "email.send", "nonce": "n-1"},
        )
        assert r.json()["verdict"] == "HITL"
        assert r.json()["capability"] is None


def test_execute_refuses_a_protected_tool_with_no_capability():
    """The bypass test. A caller that never called /authorize gets 403, not a
    side effect."""
    with TestClient(app) as client:
        mid = _mission(client)
        r = client.post(
            f"/api/mission/{mid}/execute",
            json={"tool_name": "email.send", "nonce": "n-1", "params": {"to": "x"}},
        )
        assert r.status_code == 403
        assert r.json()["detail"]["reason"] == "missing"


def test_execute_refuses_a_caller_that_ignored_a_deny():
    with TestClient(app) as client:
        mid = _mission(client, budget_usd=0.10)
        denied = client.post(
            f"/api/mission/{mid}/authorize",
            json={"tool_name": "email.send", "cost_usd": 0.10, "nonce": "n-1"},
        )
        assert denied.json()["verdict"] == "DENY"

        r = client.post(
            f"/api/mission/{mid}/execute",
            json={"tool_name": "email.send", "nonce": "n-1"},
        )
        assert r.status_code == 403


def test_execute_runs_with_a_valid_capability():
    with TestClient(app) as client:
        mid = _mission(client)
        auth = client.post(
            f"/api/mission/{mid}/authorize",
            json={
                "tool_name": "email.send",
                "nonce": "n-1",
                "params": {"to": "ops@example.com"},
            },
        ).json()

        r = client.post(
            f"/api/mission/{mid}/execute",
            json={
                "tool_name": "email.send",
                "capability_token": auth["capability"]["token_id"],
                "nonce": "n-1",
                "params": {"to": "ops@example.com"},
            },
        )
        assert r.status_code == 200
        assert r.json()["ok"] is True


def test_a_capability_cannot_be_replayed_over_http():
    with TestClient(app) as client:
        mid = _mission(client)
        auth = client.post(
            f"/api/mission/{mid}/authorize",
            json={"tool_name": "email.send", "nonce": "n-1"},
        ).json()
        token = auth["capability"]["token_id"]
        body = {"tool_name": "email.send", "capability_token": token, "nonce": "n-1"}

        assert client.post(f"/api/mission/{mid}/execute", json=body).status_code == 200
        second = client.post(f"/api/mission/{mid}/execute", json=body)
        assert second.status_code == 403
        assert second.json()["detail"]["reason"] == "replayed"


def test_arguments_cannot_be_swapped_after_authorization():
    with TestClient(app) as client:
        mid = _mission(client)
        auth = client.post(
            f"/api/mission/{mid}/authorize",
            json={
                "tool_name": "email.send",
                "nonce": "n-1",
                "params": {"to": "ops@example.com"},
            },
        ).json()

        r = client.post(
            f"/api/mission/{mid}/execute",
            json={
                "tool_name": "email.send",
                "capability_token": auth["capability"]["token_id"],
                "nonce": "n-1",
                "params": {"to": "attacker@example.com"},
            },
        )
        assert r.status_code == 403
        assert r.json()["detail"]["reason"] == "args_mismatch"


def test_a_capability_cannot_be_used_for_a_different_tool():
    with TestClient(app) as client:
        mid = _mission(client)
        auth = client.post(
            f"/api/mission/{mid}/authorize",
            json={"tool_name": "email.send", "nonce": "n-1"},
        ).json()

        r = client.post(
            f"/api/mission/{mid}/execute",
            json={
                "tool_name": "payments.transfer",
                "capability_token": auth["capability"]["token_id"],
                "nonce": "n-1",
            },
        )
        assert r.status_code == 403
        assert r.json()["detail"]["reason"] == "tool_mismatch"


def test_a_capability_cannot_cross_missions_over_http():
    with TestClient(app) as client:
        first = _mission(client)
        second = _mission(client)
        auth = client.post(
            f"/api/mission/{first}/authorize",
            json={"tool_name": "email.send", "nonce": "n-1"},
        ).json()

        r = client.post(
            f"/api/mission/{second}/execute",
            json={
                "tool_name": "email.send",
                "capability_token": auth["capability"]["token_id"],
                "nonce": "n-1",
            },
        )
        assert r.status_code == 403
        assert r.json()["detail"]["reason"] == "mission_mismatch"


def test_an_unprotected_tool_executes_without_a_capability():
    with TestClient(app) as client:
        mid = _mission(client)
        r = client.post(
            f"/api/mission/{mid}/execute",
            json={"tool_name": "docs.read", "params": {"path": "README.md"}},
        )
        assert r.status_code == 200
        assert r.json()["ok"] is True


def test_the_custody_log_records_mint_spend_and_refusal():
    with TestClient(app) as client:
        mid = _mission(client)
        auth = client.post(
            f"/api/mission/{mid}/authorize",
            json={"tool_name": "email.send", "nonce": "n-1"},
        ).json()
        token = auth["capability"]["token_id"]
        body = {"tool_name": "email.send", "capability_token": token, "nonce": "n-1"}
        client.post(f"/api/mission/{mid}/execute", json=body)
        client.post(f"/api/mission/{mid}/execute", json=body)  # replay, refused

        r = client.get(f"/api/mission/{mid}/custody")
        assert r.status_code == 200
        events = [e["event"] for e in r.json()["entries"]]
        assert events == ["capability_minted", "capability_spent", "capability_refused"]
        assert r.json()["intact"] is True


def test_custody_routes_404_on_an_unknown_mission():
    with TestClient(app) as client:
        assert client.post(
            "/api/mission/nope/authorize", json={"tool_name": "email.send"}
        ).status_code == 404
        assert client.post(
            "/api/mission/nope/execute", json={"tool_name": "email.send"}
        ).status_code == 404
        assert client.get("/api/mission/nope/custody").status_code == 404


def test_execute_404s_for_a_tool_with_no_implementation():
    with TestClient(app) as client:
        mid = _mission(client)
        r = client.post(
            f"/api/mission/{mid}/execute", json={"tool_name": "not.a.registered.tool"}
        )
        assert r.status_code == 404
