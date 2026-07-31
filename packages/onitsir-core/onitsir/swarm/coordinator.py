"""SYNERGY #17: SwarmCoordinator — ported from
ADROS/backend/swarm/coordinator.py.

ADROS's capability-aware task allocation + heartbeat liveness + automatic
reassignment generalizes cleanly from "robots on a factory floor" to
"concurrent mission workers" in the unified system: instead of the system
handling one ONITSIR mission / agentosirus chain at a time, each active
Mission/chain-execution worker registers itself as an "agent" in the
coordinator's registry with heartbeats, enabling multi-tenant/multi-mission
scheduling. `onitsir-server` exposes `GET /api/swarm/status` for a
fleet-wide view (rendered by agentosirus-web's `SwarmStatus.tsx`).

Ported feature-for-feature from ADROS, adapted from robot
poses/embodiment-capabilities to mission-worker capabilities/goal-affinity:
  - agent registry with heartbeat-based liveness (ONLINE/STALE/DOWN)
  - capability-aware distributed task (mission) allocation
    (greedy min-cost assignment)
  - automatic reassignment when a worker goes stale/down

Deterministic and dependency-free (stdlib only) so it runs in CI.
"""
from __future__ import annotations

import math
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple


class AgentStatus(str, Enum):
    ONLINE = "online"
    STALE = "stale"
    DOWN = "down"


@dataclass
class AgentDescriptor:
    """A registered mission-worker. `x`/`y` are a generic 2D affinity
    coordinate (ADROS uses physical position; here it can represent e.g.
    (queue_depth, latency_score) or simply (0, 0) if unused) so the exact
    same min-cost allocation math applies without robotics assumptions."""
    agent_id: str
    capabilities: List[str] = field(default_factory=list)
    x: float = 0.0
    y: float = 0.0
    status: AgentStatus = AgentStatus.ONLINE
    last_heartbeat: float = field(default_factory=time.time)


@dataclass
class SwarmTask:
    task_id: str
    required_capabilities: List[str] = field(default_factory=list)
    x: float = 0.0
    y: float = 0.0
    priority: int = 0


@dataclass
class TaskAssignment:
    task_id: str
    agent_id: Optional[str]
    cost: float
    reason: str = ""


class SwarmCoordinator:
    def __init__(self, stale_after_s: float = 5.0, down_after_s: float = 15.0) -> None:
        self._lock = threading.RLock()
        self._agents: Dict[str, AgentDescriptor] = {}
        self._assignments: Dict[str, TaskAssignment] = {}
        self.stale_after_s = stale_after_s
        self.down_after_s = down_after_s

    # --- registry ------------------------------------------------------------
    def register(self, agent: AgentDescriptor) -> AgentDescriptor:
        with self._lock:
            agent.last_heartbeat = time.time()
            agent.status = AgentStatus.ONLINE
            self._agents[agent.agent_id] = agent
            return agent

    def heartbeat(self, agent_id: str, x: Optional[float] = None, y: Optional[float] = None) -> bool:
        with self._lock:
            a = self._agents.get(agent_id)
            if not a:
                return False
            a.last_heartbeat = time.time()
            a.status = AgentStatus.ONLINE
            if x is not None:
                a.x = x
            if y is not None:
                a.y = y
            return True

    def agents(self) -> List[AgentDescriptor]:
        with self._lock:
            return list(self._agents.values())

    def _refresh_liveness(self, now: Optional[float] = None) -> None:
        now = now or time.time()
        for a in self._agents.values():
            age = now - a.last_heartbeat
            if age >= self.down_after_s:
                a.status = AgentStatus.DOWN
            elif age >= self.stale_after_s:
                a.status = AgentStatus.STALE
            else:
                a.status = AgentStatus.ONLINE

    def live_agents(self, now: Optional[float] = None) -> List[AgentDescriptor]:
        with self._lock:
            self._refresh_liveness(now)
            return [a for a in self._agents.values() if a.status is AgentStatus.ONLINE]

    # --- task allocation -----------------------------------------------------
    @staticmethod
    def _distance(a: AgentDescriptor, task: SwarmTask) -> float:
        return math.hypot(a.x - task.x, a.y - task.y)

    def _eligible(self, agent: AgentDescriptor, task: SwarmTask) -> bool:
        return set(task.required_capabilities).issubset(set(agent.capabilities))

    def allocate(self, tasks: List[SwarmTask], now: Optional[float] = None) -> List[TaskAssignment]:
        """Greedy capability-aware min-cost assignment. Highest priority first;
        each live agent takes at most one task per allocation round."""
        with self._lock:
            live = self.live_agents(now)
            free = {a.agent_id: a for a in live}
            assignments: List[TaskAssignment] = []
            for task in sorted(tasks, key=lambda t: (-t.priority, t.task_id)):
                best: Tuple[Optional[str], float] = (None, float("inf"))
                for aid, agent in free.items():
                    if not self._eligible(agent, task):
                        continue
                    d = self._distance(agent, task)
                    if d < best[1]:
                        best = (aid, d)
                if best[0] is None:
                    assignments.append(TaskAssignment(
                        task_id=task.task_id, agent_id=None, cost=float("inf"),
                        reason="no eligible live agent (capability/availability)"))
                    continue
                aid = best[0]
                assignments.append(TaskAssignment(
                    task_id=task.task_id, agent_id=aid, cost=best[1],
                    reason=f"nearest eligible agent at cost {best[1]:.2f}"))
                free.pop(aid, None)  # one task per agent per round
            self._assignments = {a.task_id: a for a in assignments}
            return assignments

    def reassign_failed(self, tasks: List[SwarmTask], now: Optional[float] = None) -> List[TaskAssignment]:
        """Recompute assignments after liveness changes — tasks on non-live
        workers are reallocated to healthy ones (consensus recovery)."""
        return self.allocate(tasks, now=now)

    # --- summary -------------------------------------------------------------
    def status_summary(self, now: Optional[float] = None) -> dict:
        with self._lock:
            self._refresh_liveness(now)
            counts = {s.value: 0 for s in AgentStatus}
            for a in self._agents.values():
                counts[a.status.value] += 1
            return {
                "total_agents": len(self._agents),
                "by_status": counts,
                "active_assignments": sum(1 for a in self._assignments.values() if a.agent_id),
            }
