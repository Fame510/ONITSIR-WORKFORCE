// Mirrors onitsir-server/app/schemas.py field-for-field (architecture doc
// section 2.3 item 5) so no translation layer is needed beyond JSON.
export interface Agent {
  id: string; // slug of the file (e.g. engineering-frontend-developer)
  name: string;
  description: string;
  color: string;
  emoji: string;
  vibe: string;
  category: string;
  filePath: string;
  content?: string;
  contentFile?: string; // static markdown file emitted at build time
}

export interface Division {
  id: string;
  name: string;
  emoji: string;
  color: string;
  description: string;
  agentCount?: number; // SYNERGY #9: live count from GET /api/divisions, never hardcoded
}

export interface Message {
  role: 'user' | 'model';
  text: string;
}

export interface TeamScenario {
  id: string;
  name: string;
  description: string;
  recommendedAgents: string[]; // agent slugs/ids
}

// ---------------------------------------------------------------------------
// SYNERGY #6: Verdict/DenyReason/HitlMode value sets, generated/kept in sync
// with onitsir-core/onitsir/shackle.py's enums via
// infra/scripts/sync-shackle-types.mjs. TypeScript NEVER re-implements
// decide() logic here — these are display-only types for rendering
// Governor verdicts (see src/lib/shackle.ts).
// ---------------------------------------------------------------------------
export type Verdict = 'ALLOW' | 'DENY' | 'HITL';

export type DenyReason =
  | 'unspecified'
  | 'budget_exhausted'
  | 'max_repeat_exceeded'
  | 'circuit_open'
  | 'window_exceeded'
  | 'global_limit'
  | 'policy_violation'
  | 'auth_failed'
  | 'ethics_below_threshold'
  | 'shackle_rule_veto'
  | 'hitl_timeout';

export type HitlMode = 'never' | 'on_deny' | 'on_threshold' | 'always';

// SYNERGY #8: Router.route() assignment shape (matches
// onitsir-server/app/schemas.py::Assignment).
export interface RouterAssignment {
  id: string;
  name: string;
  category: string;
  description: string;
  score: number;
  confidence: 'high' | 'medium' | 'low';
}

// SYNERGY #24: one live mission event, streamed over WS /ws/mission/:id.
export interface MissionEvent {
  type:
    | 'MISSION_CREATED'
    | 'GOVERNOR_VERDICT'
    | 'HITL_PROMPT'
    | 'HITL_RESPONSE'
    | 'STEP_VERIFIED'
    | 'TOOL_EVIDENCE'
    | 'ERROR';
  [key: string]: unknown;
}
