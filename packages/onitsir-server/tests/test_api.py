"""End-to-end FastAPI route tests covering the governed mission surface
(SYNERGY #2, #3, #4, #5, #7, #8, #9, #10, #17, #24)."""
from fastapi.testclient import TestClient

from app.main import app


def test_health_and_divisions_live_counts():
    with TestClient(app) as client:
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["roster_size"] == 164

        r = client.get("/api/divisions")
        assert r.status_code == 200
        divisions = r.json()
        assert any(d["id"] == "strategy" for d in divisions)  # SYNERGY #1 bug fix
        assert any(d["id"] == "integrations" for d in divisions)
        total = sum(d["agentCount"] for d in divisions)
        assert total == 164  # SYNERGY #9: live, not hardcoded


def test_router_prefilter_and_route():
    with TestClient(app) as client:
        r = client.get("/api/router/prefilter", params={"goal": "brand identity design work", "limit": 5})
        assert r.status_code == 200
        assert len(r.json()) <= 5

        r = client.post("/api/router/route", json={"goal": "brand identity design work", "crew_size": 2})
        assert r.status_code == 200
        assert len(r.json()) <= 2


def test_full_mission_lifecycle_gate_verify_audit():
    with TestClient(app) as client:
        r = client.post("/api/mission", json={"goal": "launch a marketing campaign", "budget_usd": 1.0})
        mission_id = r.json()["mission_id"]

        r = client.post(f"/api/mission/{mission_id}/gate", json={"tool_name": "phase:intake", "cost_usd": 0.1})
        assert r.json()["verdict"] == "ALLOW"

        r = client.post(
            f"/api/mission/{mission_id}/verify-step",
            json={
                "agent_id": "marketing-app-store-optimizer",
                "task": "optimize the app store listing",
                "output": "Here is a fully optimized app store listing with keywords and screenshots.",
            },
        )
        assert r.json()["passed"] is True

        r = client.get(f"/api/audit/{mission_id}")
        assert len(r.json()["entries"]) >= 1

        r = client.get(f"/api/audit/{mission_id}/verify")
        assert r.json()["intact"] is True


def test_gate_denies_after_budget_exhausted():
    # Cost is deducted from the budget BEFORE decide() runs (onitsir-core's
    # Governor.evaluate() semantics): a call that leaves remaining budget
    # > 0 still ALLOWs; the NEXT call, once remaining hits exactly 0 (or
    # would go negative), is DENIED. Spend half first, then the rest.
    with TestClient(app) as client:
        r = client.post("/api/mission", json={"goal": "launch a marketing campaign", "budget_usd": 0.10})
        mission_id = r.json()["mission_id"]
        r = client.post(f"/api/mission/{mission_id}/gate", json={"tool_name": "phase:intake", "cost_usd": 0.05})
        assert r.json()["verdict"] == "ALLOW"
        r = client.post(f"/api/mission/{mission_id}/gate", json={"tool_name": "phase:spec", "cost_usd": 0.05})
        assert r.json()["verdict"] == "DENY"
        assert r.json()["deny_reason"] == "budget_exhausted"


def test_hitl_decision_endpoint():
    with TestClient(app) as client:
        r = client.post("/api/mission", json={"goal": "launch a marketing campaign", "budget_usd": 1.0})
        mission_id = r.json()["mission_id"]
        r = client.post(f"/api/mission/{mission_id}/hitl", json={"decision": "approve"})
        assert r.status_code == 200
        assert r.json()["decision"] == "approve"


def test_evidence_endpoint_synergy_7():
    with TestClient(app) as client:
        r = client.post("/api/mission", json={"goal": "launch a marketing campaign"})
        mission_id = r.json()["mission_id"]
        r = client.post(
            f"/api/mission/{mission_id}/evidence",
            json={"tool_name": "github.writeFile", "command": "PUT /repos/x/y", "output": "200 OK", "passed": True},
        )
        assert r.status_code == 200
        assert r.json()["passed"] is True


def test_swarm_status_endpoint():
    with TestClient(app) as client:
        r = client.get("/api/swarm/status")
        assert r.status_code == 200
        assert "total_agents" in r.json()


def test_mission_events_polling_synergy_24():
    with TestClient(app) as client:
        r = client.post("/api/mission", json={"goal": "launch a marketing campaign"})
        mission_id = r.json()["mission_id"]
        r = client.get(f"/api/mission/{mission_id}/events")
        assert r.status_code == 200
        assert r.json()["events"][0]["type"] == "MISSION_CREATED"


def test_agent_detail_endpoint_resolves_content():
    with TestClient(app) as client:
        r = client.get("/api/agents")
        agents = r.json()
        sample = agents[0]
        r = client.get(f"/api/agents/{sample['category']}/{sample['id']}")
        assert r.status_code == 200
        assert "content" in r.json()


def test_mission_not_found_returns_404():
    with TestClient(app) as client:
        r = client.get("/api/mission/does-not-exist")
        assert r.status_code == 404
