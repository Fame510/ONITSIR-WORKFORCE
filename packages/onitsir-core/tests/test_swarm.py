"""SwarmCoordinator (SYNERGY #17)."""
import time

from onitsir.swarm import AgentDescriptor, AgentStatus, SwarmCoordinator, SwarmTask


def test_register_and_list_agents():
    coord = SwarmCoordinator()
    coord.register(AgentDescriptor(agent_id="w1", capabilities=["chat"]))
    assert len(coord.agents()) == 1


def test_heartbeat_keeps_agent_online():
    coord = SwarmCoordinator(stale_after_s=100, down_after_s=200)
    coord.register(AgentDescriptor(agent_id="w1", capabilities=["chat"]))
    assert coord.heartbeat("w1") is True
    live = coord.live_agents()
    assert len(live) == 1
    assert live[0].status == AgentStatus.ONLINE


def test_heartbeat_unknown_agent_returns_false():
    coord = SwarmCoordinator()
    assert coord.heartbeat("nonexistent") is False


def test_liveness_transitions_to_stale_then_down():
    coord = SwarmCoordinator(stale_after_s=0.01, down_after_s=0.02)
    coord.register(AgentDescriptor(agent_id="w1", capabilities=["chat"]))
    time.sleep(0.015)
    coord._refresh_liveness()
    assert coord._agents["w1"].status == AgentStatus.STALE
    time.sleep(0.02)
    coord._refresh_liveness()
    assert coord._agents["w1"].status == AgentStatus.DOWN


def test_capability_aware_allocation_assigns_eligible_agent():
    coord = SwarmCoordinator()
    coord.register(AgentDescriptor(agent_id="w1", capabilities=["chat"], x=0, y=0))
    coord.register(AgentDescriptor(agent_id="w2", capabilities=["browser"], x=10, y=10))
    tasks = [SwarmTask(task_id="t1", required_capabilities=["browser"], x=9, y=9)]
    assignments = coord.allocate(tasks)
    assert assignments[0].agent_id == "w2"


def test_allocation_leaves_ineligible_task_unassigned():
    coord = SwarmCoordinator()
    coord.register(AgentDescriptor(agent_id="w1", capabilities=["chat"]))
    tasks = [SwarmTask(task_id="t1", required_capabilities=["vision"])]
    assignments = coord.allocate(tasks)
    assert assignments[0].agent_id is None


def test_allocation_respects_priority_order():
    coord = SwarmCoordinator()
    coord.register(AgentDescriptor(agent_id="w1", capabilities=["chat"]))
    tasks = [
        SwarmTask(task_id="low", required_capabilities=["chat"], priority=0),
        SwarmTask(task_id="high", required_capabilities=["chat"], priority=5),
    ]
    assignments = coord.allocate(tasks)
    by_id = {a.task_id: a for a in assignments}
    assert by_id["high"].agent_id == "w1"
    assert by_id["low"].agent_id is None  # only one agent, taken by higher priority


def test_status_summary_counts():
    coord = SwarmCoordinator()
    coord.register(AgentDescriptor(agent_id="w1", capabilities=["chat"]))
    summary = coord.status_summary()
    assert summary["total_agents"] == 1
    assert summary["by_status"]["online"] == 1


def test_reassign_failed_recomputes_allocation():
    coord = SwarmCoordinator(stale_after_s=0.01, down_after_s=0.02)
    coord.register(AgentDescriptor(agent_id="w1", capabilities=["chat"]))
    tasks = [SwarmTask(task_id="t1", required_capabilities=["chat"])]
    first = coord.allocate(tasks)
    assert first[0].agent_id == "w1"
    time.sleep(0.03)  # let w1 go DOWN
    second = coord.reassign_failed(tasks)
    assert second[0].agent_id is None  # no live agents left
