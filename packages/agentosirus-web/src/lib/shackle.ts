/**
 * shackle.ts — thin TypeScript mirror of decide() verdict TYPES ONLY.
 *
 * SYNERGY #6 (Establish ONITSIR's Python decide() as the single governance
 * source of truth): this file contains ZERO decisioning logic. It exists
 * purely so agentosirus's UI components can render Governor verdicts with
 * proper typing and human-readable labels/colors. The actual `decide()`
 * function lives ONLY in onitsir-core/onitsir/shackle.py; every real
 * verdict comes from a round trip to onitsir-server
 * (see src/lib/onitsirClient.ts::checkGate()).
 *
 * These types are kept in sync with onitsir-core's enums by
 * infra/scripts/sync-shackle-types.mjs, which reads
 * onitsir-server/app/schemas.py's `VerdictLiteral`/`DenyReasonLiteral`/
 * `HitlModeLiteral` (themselves derived from onitsir-core's Python enums
 * via pydantic's .model_json_schema()) and fails CI if this file drifts
 * from that schema.
 */
import type { DenyReason, HitlMode, Verdict } from "../types";

export type { Verdict, DenyReason, HitlMode };

/** Human-readable label for a DenyReason -- display only. */
export const DENY_REASON_LABELS: Record<DenyReason, string> = {
  unspecified: "Unspecified",
  budget_exhausted: "Budget exhausted",
  max_repeat_exceeded: "Max repeat calls exceeded",
  circuit_open: "Circuit breaker open",
  window_exceeded: "Rate window exceeded",
  global_limit: "Global call limit reached",
  policy_violation: "Policy violation",
  auth_failed: "Authentication failed",
  ethics_below_threshold: "Ethics score below threshold",
  shackle_rule_veto: "SHACKLE rule veto",
  hitl_timeout: "Human review timed out"
};

/** Color used consistently across MindMap/MissionConsole/AuditLedgerView. */
export const VERDICT_COLORS: Record<Verdict, string> = {
  ALLOW: "#22c55e", // green
  DENY: "#ef4444", // red
  HITL: "#f59e0b" // amber
};

export function verdictLabel(verdict: Verdict): string {
  return { ALLOW: "Allowed", DENY: "Denied", HITL: "Human review required" }[verdict];
}
