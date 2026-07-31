/**
 * onitsirClient.ts — typed client for the new /api/mission, /ws/mission/:id
 * routes exposed by onitsir-server (SYNERGY #5).
 *
 * SYNERGY #2: `preFilter()` calls GET /api/router/prefilter so handleChain()
 * can shortlist candidates before invoking the LLM planner.
 * SYNERGY #3: `checkGate()` calls POST /api/mission/:id/gate before each
 * chain step; on DENY/HITL the chain halts/pauses exactly as ONITSIR's
 * Python Engine.run() does. Decisioning is 100% server-side (SYNERGY #6).
 * SYNERGY #4: `verifyStep()` calls POST /api/mission/:id/verify-step.
 * SYNERGY #8: `suggestTeam()` calls POST /api/router/route.
 * SYNERGY #24: `subscribeMission()` opens WS /ws/mission/:id and maps each
 * event onto activityBus's addNode/updateNode/linkNodes so the existing
 * MindMap.tsx renders governed missions with zero changes to itself.
 */
import { addNode, linkNodes, updateNode } from "./activityBus";
import type { DenyReason, MissionEvent, RouterAssignment, Verdict } from "../types";

let _backendUrl: string | null = null;

/** SYNERGY #5: SettingsPanel's "Use ONITSIR backend" toggle sets this. When
 * null, agentosirus runs in static/offline mode (apiShim.ts + localLedger). */
export function setBackendUrl(url: string | null): void {
  _backendUrl = url ? url.replace(/\/$/, "") : null;
}

export function getBackendUrl(): string | null {
  return _backendUrl;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!_backendUrl) throw new Error("No ONITSIR backend configured.");
  const response = await fetch(_backendUrl + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error("onitsir-server " + response.status + ": " + text.slice(0, 200));
  }
  return response.json() as Promise<T>;
}

/** SYNERGY #2. */
export function preFilter(goal: string, limit = 8): Promise<RouterAssignment[]> {
  const qs = new URLSearchParams({ goal, limit: String(limit) });
  return apiFetch<RouterAssignment[]>("/api/router/prefilter?" + qs.toString());
}

/** SYNERGY #8. */
export function suggestTeam(goal: string, crewSize = 3): Promise<RouterAssignment[]> {
  return apiFetch<RouterAssignment[]>("/api/router/route", {
    method: "POST",
    body: JSON.stringify({ goal, crew_size: crewSize })
  });
}

export interface GateResult {
  verdict: Verdict;
  reason: string;
  deny_reason: DenyReason;
}

/** SYNERGY #3: the ONLY place agentosirus consults governance -- always a
 * round-trip to the server, never a local re-implementation (SYNERGY #6). */
export function checkGate(
  missionId: string,
  toolName: string,
  costUsd = 0.0,
  tags: string[] = []
): Promise<GateResult> {
  return apiFetch<GateResult>("/api/mission/" + missionId + "/gate", {
    method: "POST",
    body: JSON.stringify({ tool_name: toolName, cost_usd: costUsd, tags })
  });
}

export interface VerifyStepResult {
  passed: boolean;
  command: string;
  output_summary: string;
}

/** SYNERGY #4. */
export function verifyStep(
  missionId: string,
  agentId: string,
  task: string,
  output: string
): Promise<VerifyStepResult> {
  return apiFetch<VerifyStepResult>("/api/mission/" + missionId + "/verify-step", {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId, task, output })
  });
}

export function submitMission(goal: string, crewSize = 3, budgetUsd = 1.0): Promise<{ mission_id: string; crew: RouterAssignment[] }> {
  return apiFetch("/api/mission", {
    method: "POST",
    body: JSON.stringify({ goal, crew_size: crewSize, budget_usd: budgetUsd })
  });
}

/** SYNERGY #10: operator resolves a pending HITL prompt. */
export function resolveHitl(missionId: string, decision: "approve" | "reject" | "modify"): Promise<unknown> {
  return apiFetch("/api/mission/" + missionId + "/hitl", {
    method: "POST",
    body: JSON.stringify({ decision })
  });
}

const VERDICT_NODE_STATE: Record<Verdict, "done" | "error" | "thinking"> = {
  ALLOW: "done",
  DENY: "error",
  HITL: "thinking"
};

/**
 * SYNERGY #24: subscribe to WS /ws/mission/:id and translate each
 * MissionEvent into activityBus calls. Returns an unsubscribe function.
 * No changes needed to MindMap.tsx -- it already renders the generic
 * MindGraph shape that addNode/updateNode/linkNodes produce.
 */
export function subscribeMission(missionId: string, onEvent?: (ev: MissionEvent) => void): () => void {
  if (!_backendUrl) throw new Error("No ONITSIR backend configured.");
  const wsUrl = _backendUrl.replace(/^http/, "ws") + "/ws/mission/" + missionId;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    let ev: MissionEvent;
    try {
      ev = JSON.parse(event.data);
    } catch {
      return;
    }
    onEvent?.(ev);

    switch (ev.type) {
      case "MISSION_CREATED": {
        const crew = (ev.crew as RouterAssignment[]) || [];
        crew.forEach((a, i) => {
          addNode({ id: a.id, label: a.name, emoji: "\u{1F916}", state: "idle", detail: a.confidence + " confidence" });
          if (i > 0) linkNodes(crew[i - 1].id, a.id);
        });
        break;
      }
      case "GOVERNOR_VERDICT": {
        const toolName = String(ev.tool_name || "governor");
        const verdict = ev.verdict as Verdict;
        updateNode(toolName, {
          state: VERDICT_NODE_STATE[verdict] || "idle",
          detail: "Shackle " + verdict + ": " + String(ev.reason || "")
        });
        break;
      }
      case "HITL_PROMPT": {
        addNode({
          id: "hitl:" + String(ev.tool_name),
          label: "Human review needed",
          emoji: "\u{1F9D1}",
          state: "thinking",
          detail: String(ev.reason || "")
        });
        break;
      }
      case "HITL_RESPONSE": {
        updateNode("hitl:" + String(ev.tool_name), { state: "done", detail: "Operator: " + String(ev.decision) });
        break;
      }
      case "STEP_VERIFIED": {
        const agentId = String(ev.agent_id);
        updateNode(agentId, {
          state: ev.passed ? "done" : "error",
          detail: ev.passed ? "Iron Law: verified" : "Iron Law: evidence check failed"
        });
        break;
      }
      case "TOOL_EVIDENCE": {
        updateNode(String(ev.tool_name), {
          state: ev.passed ? "done" : "error",
          detail: "Tool evidence: " + (ev.passed ? "passed" : "failed")
        });
        break;
      }
      default:
        break;
    }
  };

  return () => ws.close();
}
