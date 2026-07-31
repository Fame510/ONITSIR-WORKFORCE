"""Pydantic models mirroring agentosirus's src/types.ts field-for-field
(architecture doc section 2.3, item 5) so the JSON shape is identical on
both sides of the bridge with no translation layer beyond standard JSON.

SYNERGY #6: `VerdictLiteral`/`DenyReasonLiteral`/`HitlModeLiteral` are the
Pydantic-side source that `infra/scripts/sync-shackle-types.mjs` reads (via
`.model_json_schema()`) to keep `agentosirus-web/src/lib/shackle.ts`'s
TypeScript types in sync — TypeScript never re-implements decide() logic,
only mirrors these value sets for display.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

VerdictLiteral = Literal["ALLOW", "DENY", "HITL"]
DenyReasonLiteral = Literal[
    "unspecified", "budget_exhausted", "max_repeat_exceeded", "circuit_open",
    "window_exceeded", "global_limit", "policy_violation", "auth_failed",
    "ethics_below_threshold", "shackle_rule_veto", "hitl_timeout",
]
HitlModeLiteral = Literal["never", "on_deny", "on_threshold", "always"]


class Agent(BaseModel):
    """Mirrors agentosirus's `Agent` interface in src/types.ts."""
    id: str
    name: str
    description: str
    color: str = "indigo"
    emoji: str = "\U0001F916"
    vibe: str = ""
    category: str
    filePath: str = ""
    content: Optional[str] = None
    contentFile: Optional[str] = None


class Division(BaseModel):
    """Mirrors agentosirus's `Division` interface."""
    id: str
    name: str
    emoji: str
    color: str
    description: str


class Message(BaseModel):
    role: Literal["user", "model"]
    text: str


class ChatRequest(BaseModel):
    message: str
    history: list[Message] = Field(default_factory=list)
    systemInstruction: Optional[str] = None
    agentName: str = "Assistant"
    agentEmoji: str = "\U0001F4AC"


class RouteRequest(BaseModel):
    """SYNERGY #8: powers TeamBuilder's "Suggest a team" free-text box."""
    goal: str
    crew_size: int = 3


class PreFilterRequest(BaseModel):
    """SYNERGY #2: pre-filter shortlist for the LLM Swarm Architect planner."""
    goal: str
    limit: int = 8


class Assignment(BaseModel):
    id: str
    name: str
    category: str
    description: str
    score: int
    confidence: Literal["high", "medium", "low"]


class GateRequest(BaseModel):
    """SYNERGY #3: request body for POST /api/mission/:id/gate."""
    tool_name: str
    cost_usd: float = 0.0
    nonce: Optional[str] = None
    params: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


class GateResponse(BaseModel):
    verdict: VerdictLiteral
    reason: str
    deny_reason: DenyReasonLiteral = "unspecified"


class VerifyStepRequest(BaseModel):
    """SYNERGY #4: request body for POST /api/mission/:id/verify-step."""
    agent_id: str
    task: str
    output: str
    command: Optional[str] = None


class VerifyStepResponse(BaseModel):
    passed: bool
    command: str
    output_summary: str


class EvidenceRequest(BaseModel):
    """SYNERGY #7: evidence-wrap tool-integration side effects."""
    tool_name: str
    command: str
    output: str
    passed: bool


class HitlDecisionRequest(BaseModel):
    """SYNERGY #10: operator APPROVE/REJECT/MODIFY."""
    decision: Literal["approve", "reject", "modify"]


class MissionSubmitRequest(BaseModel):
    goal: str
    crew_size: int = 3
    budget_usd: float = 1.0
    hitl_mode: HitlModeLiteral = "never"


class MissionStatus(BaseModel):
    mission_id: str
    goal: str
    crew: list[Assignment]
    phase_log: list[str]
    shipped: bool
    blocked_reason: Optional[str] = None
    hitl_required: bool = False
    hitl_pending_phase: Optional[str] = None
    audit_intact: bool = True


class SwarmRegisterRequest(BaseModel):
    """Request body for POST /api/swarm/register (SYNERGY #17).

    This route previously took raw query parameters, which meant no validation
    and no schema in the generated OpenAPI document. `capabilities` is a real
    list here rather than a comma-separated string.
    """
    agent_id: str = Field(min_length=1, description="Stable identifier for the mission worker.")
    capabilities: list[str] = Field(
        default_factory=list,
        description="Capability tags the worker can serve, e.g. ['chat', 'browser'].",
    )
    x: float = Field(default=0.0, description="Generic 2D affinity coordinate, not a physical position.")
    y: float = Field(default=0.0, description="Generic 2D affinity coordinate, not a physical position.")


class SwarmRegisterResponse(BaseModel):
    agent_id: str
    status: str
    capabilities: list[str] = Field(default_factory=list)


class SwarmHeartbeatRequest(BaseModel):
    """Request body for POST /api/swarm/heartbeat (SYNERGY #17)."""
    agent_id: str = Field(min_length=1, description="Identifier of a previously registered worker.")
    x: Optional[float] = Field(default=None, description="Optional updated affinity coordinate.")
    y: Optional[float] = Field(default=None, description="Optional updated affinity coordinate.")


class SwarmHeartbeatResponse(BaseModel):
    ok: bool = Field(description="False when the agent_id was never registered.")
