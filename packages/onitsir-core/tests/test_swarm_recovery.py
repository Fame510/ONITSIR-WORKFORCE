"""Swarm liveness transitions and reassignment after worker loss.

Liveness is derived from heartbeat age at read time, so these tests inject an
explicit "now" rather than sleeping. Sleeping would make CI slow and flaky;
injecting time makes the thresholds exact.
"""
import time

from onitsir.swarm import (
    AgentDescriptor,
    AgentStatus,
    SwarmCoordinator,
    SwarmTask,
)


def _coordinator_with_two_workers(t0: float) -> SwarmCoordinator:
    c = SwarmCoordinator(stale_after_s=5.0, down_after_s=15.0)
    c.register(AgentDescriptor(agent_id="w-near", capabilities=["build", "test"], x=0.0, y=0.0))
    c.register(AgentDescriptor(agent_id="w-far", capabilities=["build", "test"], x=10.0, y=0.0))
    # register() stamps last_heartbeat with real wall-clock time; pin both to
    # t0 so the injected "now" values below produce exact, stable ages.
    for agent in c.agents():
        agent.last_heartbeat = t0
    return c


def test_registration_marks_a_worker_online():
    c = SwarmCoordinator()
    agent = c.register(AgentDescriptor(agent_id="w-1", capabilities=["build"]))
    assert agent.status is AgentStatus.ONLINE
    assert len(c.agents()) == 1


def test_heartbeat_for_unknown_worker_returns_false():
    c = SwarmCoordinator()
    assert c.heartbeat("never-registered") is False


def test_heartbeat_updates_position_when_supplied():
    c = SwarmCoordinator()
    c.register(AgentDescriptor(agent_id="w-1", capabilities=["build"]))
    assert c.heartbeat("w-1", 3.0, 4.0) is True
    agent = c.agents()[0]
    assert (agent.x, agent.y) == (3.0, 4.0)


def test_worker_goes_stale_then_down_as_heartbeat_ages():
    t0 = time.time()
    c = _coordinator_with_two_workers(t0)

    assert len(c.live_agents(now=t0 + 1.0)) == 2

    c._refresh_liveness(now=t0 + 6.0)
    assert all(a.status is AgentStatus.STALE for a in c.agents())
    assert c.live_agents(now=t0 + 6.0) == []

    c._refresh_liveness(now=t0 + 20.0)
    assert all(a.status is AgentStatus.DOWN for a in c.agents())


def test_stale_threshold_is_inclusive_at_the_boundary():
    """age >= stale_after_s is stale, so exactly 5.0s is already stale rather
    than online. Pinning the boundary stops an off-by-one from silently
    widening the online window."""
    t0 = time.time()
    c = _coordinator_with_two_workers(t0)
    c._refresh_liveness(now=t0 + 5.0)
    assert all(a.status is AgentStatus.STALE for a in c.agents())


def test_down_threshold_is_inclusive_at_the_boundary():
    t0 = time.time()
    c = _coordinator_with_two_workers(t0)
    c._refresh_liveness(now=t0 + 15.0)
    assert all(a.status is AgentStatus.DOWN for a in c.agents())


def test_allocation_prefers_the_nearest_eligible_worker():
    t0 = time.time()
    c = _coordinator_with_two_workers(t0)
    task = SwarmTask(task_id="t-1", required_capabilities=["build"], x=0.0, y=0.0)
    assignments = c.allocate([task], now=t0 + 1.0)
    assert len(assignments) == 1
    assert assignments[0].agent_id == "w-near"
    assert assignments[0].cost == 0.0


def test_each_worker_takes_at_most_one_task_per_round():
    t0 = time.time()
    c = _coordinator_with_two_workers(t0)
    tasks = [
        SwarmTask(task_id="t-1", required_capabilities=["build"], x=0.0, y=0.0),
        SwarmTask(task_id="t-2", required_capabilities=["build"], x=0.0, y=0.0),
    ]
    assignments = c.allocate(tasks, now=t0 + 1.0)
    assert {a.agent_id for a in assignments} == {"w-near", "w-far"}


def test_third_task_is_unassigned_when_only_two_workers_are_live():
    t0 = time.time()
    c = _coordinator_with_two_workers(t0)
    tasks = [
        SwarmTask(task_id="t-a", required_capabilities=["build"]),
        SwarmTask(task_id="t-b", required_capabilities=["build"]),
        SwarmTask(task_id="t-c", required_capabilities=["build"]),
    ]
    assignments = c.allocate(tasks, now=t0 + 1.0)
    unassigned = [a for a in assignments if a.agent_id is None]
    assert len(unassigned) == 1
    assert "no eligible live agent" in unassigned[0].reason


def test_capability_mismatch_leaves_the_task_unassigned():
    t0 = time.time()
    c = _coordinator_with_two_workers(t0)
    task = SwarmTask(task_id="t-gpu", required_capabilities=["gpu"])
    assignments = c.allocate([task], now=t0 + 1.0)
    assert assignments[0].agent_id is None
    assert assignments[0].cost == float("inf")


def test_higher_priority_task_is_allocated_first():
    """With one live worker and two tasks, the higher-priority task must win
    the worker."""
    t0 = time.time()
    c = SwarmCoordinator(stale_after_s=5.0, down_after_s=15.0)
    c.register(AgentDescriptor(agent_id="only", capabilities=["build"]))
    c.agents()[0].last_heartbeat = t0
    tasks = [
        SwarmTask(task_id="t-low", required_capabilities=["build"], priority=0),
        SwarmTask(task_id="t-high", required_capabilities=["build"], priority=9),
    ]
    assignments = {a.task_id: a.agent_id for a in c.allocate(tasks, now=t0 + 1.0)}
    assert assignments["t-high"] == "only"
    assert assignments["t-low"] is None


def test_reassignment_moves_work_off_a_worker_that_went_down():
    """The recovery property: after the originally-chosen worker stops
    heartbeating, the same task must land on the surviving worker."""
    t0 = time.time()
    c = _coordinator_with_two_workers(t0)
    task = SwarmTask(task_id="t-1", required_capabilities=["build"], x=0.0, y=0.0)

    first = c.allocate([task], now=t0 + 1.0)
    assert first[0].agent_id == "w-near"

    # w-far keeps heartbeating; w-near falls silent and ages out.
    for agent in c.agents():
        if agent.agent_id == "w-far":
            agent.last_heartbeat = t0 + 19.0

    recovered = c.reassign_failed([task], now=t0 + 20.0)
    assert recovered[0].agent_id == "w-far"


def test_reassignment_yields_no_worker_when_the_whole_fleet_is_down():
    t0 = time.time()
    c = _coordinator_with_two_workers(t0)
    task = SwarmTask(task_id="t-1", required_capabilities=["build"])
    c.allocate([task], now=t0 + 1.0)
    recovered = c.reassign_failed([task], now=t0 + 60.0)
    assert recovered[0].agent_id is None


def test_status_summary_counts_by_state_and_active_assignments():
    t0 = time.time()
    c = _coordinator_with_two_workers(t0)
    task = SwarmTask(task_id="t-1", required_capabilities=["build"], x=0.0, y=0.0)
    c.allocate([task], now=t0 + 1.0)

    summary = c.status_summary(now=t0 + 1.0)
    assert summary["total_agents"] == 2
    assert summary["by_status"]["online"] == 2
    assert summary["active_assignments"] == 1

    stale = c.status_summary(now=t0 + 6.0)
    assert stale["by_status"]["stale"] == 2
    assert stale["by_status"]["online"] == 0


def test_heartbeat_revives_a_stale_worker():
    t0 = time.time()
    c = _coordinator_with_two_workers(t0)
    c._refresh_liveness(now=t0 + 6.0)
    assert all(a.status is AgentStatus.STALE for a in c.agents())
    assert c.heartbeat("w-near") is True
    assert c._agents["w-near"].status is AgentStatus.ONLINE
