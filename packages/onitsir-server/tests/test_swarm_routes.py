"""Route tests for the swarm registry surface (SYNERGY #17).

These cover the validated-body versions of `/api/swarm/register` and
`/api/swarm/heartbeat`, which previously took raw query parameters.

Every test enters the app lifespan via `with TestClient(app)`, which
constructs a fresh SwarmCoordinator, so registrations made in one test are not
visible in another.
"""
from fastapi.testclient import TestClient

from app.main import app


def test_register_returns_agent_and_online_status():
    with TestClient(app) as client:
        r = client.post(
            "/api/swarm/register",
            json={"agent_id": "worker-1", "capabilities": ["chat", "browser"]},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["agent_id"] == "worker-1"
        assert body["status"] == "online"
        assert body["capabilities"] == ["chat", "browser"]


def test_register_accepts_a_json_list_not_a_comma_separated_string():
    # The point of the body migration: capabilities is a real list, so a
    # capability containing a comma is no longer split into two.
    with TestClient(app) as client:
        r = client.post(
            "/api/swarm/register",
            json={"agent_id": "worker-1", "capabilities": ["vision,3d"]},
        )
        assert r.json()["capabilities"] == ["vision,3d"]


def test_register_defaults_capabilities_to_empty_list():
    with TestClient(app) as client:
        r = client.post("/api/swarm/register", json={"agent_id": "worker-1"})
        assert r.status_code == 200
        assert r.json()["capabilities"] == []


def test_register_rejects_missing_agent_id():
    with TestClient(app) as client:
        r = client.post("/api/swarm/register", json={"capabilities": ["chat"]})
        assert r.status_code == 422


def test_register_rejects_empty_agent_id():
    with TestClient(app) as client:
        r = client.post("/api/swarm/register", json={"agent_id": ""})
        assert r.status_code == 422


def test_register_rejects_non_list_capabilities():
    # Guards against a caller still sending the old comma-separated string.
    with TestClient(app) as client:
        r = client.post(
            "/api/swarm/register",
            json={"agent_id": "worker-1", "capabilities": "chat,browser"},
        )
        assert r.status_code == 422


def test_registering_the_same_id_twice_replaces_rather_than_duplicates():
    with TestClient(app) as client:
        client.post(
            "/api/swarm/register",
            json={"agent_id": "worker-1", "capabilities": ["chat"]},
        )
        r = client.post(
            "/api/swarm/register",
            json={"agent_id": "worker-1", "capabilities": ["vision"]},
        )
        assert r.json()["capabilities"] == ["vision"]

        status = client.get("/api/swarm/status").json()
        assert status["total_agents"] == 1


def test_status_counts_registered_agents_by_liveness():
    with TestClient(app) as client:
        client.post("/api/swarm/register", json={"agent_id": "worker-1"})
        client.post("/api/swarm/register", json={"agent_id": "worker-2"})

        status = client.get("/api/swarm/status").json()
        assert status["total_agents"] == 2
        # Freshly registered workers are online; nothing has had time to go
        # stale, and no allocation round has run.
        assert status["by_status"]["online"] == 2
        assert status["by_status"]["stale"] == 0
        assert status["by_status"]["down"] == 0
        assert status["active_assignments"] == 0


def test_status_is_isolated_between_clients():
    # Each `with TestClient(app)` re-enters the lifespan and builds a fresh
    # coordinator. If this ever fails, swarm state is leaking across tests.
    with TestClient(app) as client:
        client.post("/api/swarm/register", json={"agent_id": "worker-1"})
        assert client.get("/api/swarm/status").json()["total_agents"] == 1

    with TestClient(app) as client:
        assert client.get("/api/swarm/status").json()["total_agents"] == 0


def test_heartbeat_for_a_registered_agent_reports_ok():
    with TestClient(app) as client:
        client.post("/api/swarm/register", json={"agent_id": "worker-1"})
        r = client.post("/api/swarm/heartbeat", json={"agent_id": "worker-1"})
        assert r.status_code == 200
        assert r.json()["ok"] is True


def test_heartbeat_for_an_unknown_agent_reports_not_ok_rather_than_erroring():
    # Deliberately not a 404: a worker whose registration was lost on a server
    # restart needs to detect that and re-register.
    with TestClient(app) as client:
        r = client.post("/api/swarm/heartbeat", json={"agent_id": "never-registered"})
        assert r.status_code == 200
        assert r.json()["ok"] is False


def test_heartbeat_rejects_missing_agent_id():
    with TestClient(app) as client:
        r = client.post("/api/swarm/heartbeat", json={})
        assert r.status_code == 422


def test_heartbeat_updates_affinity_coordinates_when_supplied():
    with TestClient(app) as client:
        client.post(
            "/api/swarm/register",
            json={"agent_id": "worker-1", "x": 1.0, "y": 2.0},
        )
        r = client.post(
            "/api/swarm/heartbeat",
            json={"agent_id": "worker-1", "x": 3.5, "y": 4.5},
        )
        assert r.json()["ok"] is True
        agent = client.app.state.swarm_coordinator.agents()[0]
        assert agent.x == 3.5
        assert agent.y == 4.5


def test_heartbeat_without_coordinates_leaves_them_unchanged():
    with TestClient(app) as client:
        client.post(
            "/api/swarm/register",
            json={"agent_id": "worker-1", "x": 1.0, "y": 2.0},
        )
        client.post("/api/swarm/heartbeat", json={"agent_id": "worker-1"})
        agent = client.app.state.swarm_coordinator.agents()[0]
        assert agent.x == 1.0
        assert agent.y == 2.0


def test_register_and_heartbeat_reject_query_parameter_style_calls():
    # The old interface. It must now fail validation rather than silently
    # registering an agent with no body.
    with TestClient(app) as client:
        assert client.post("/api/swarm/register?agent_id=worker-1").status_code == 422
        assert client.post("/api/swarm/heartbeat?agent_id=worker-1").status_code == 422
