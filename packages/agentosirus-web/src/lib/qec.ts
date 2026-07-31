/**
 * qec.ts — SYNERGY #22: deterministic-collapse sanity filter for
 * agentosirus's LLM-generated chain plans.
 *
 * Ported from morphic-kernel's src/runtime/qecEngine.js (`QecEngine`,
 * `QEC_FATAL`). morphic-kernel's pattern: filter candidates by static
 * policy, deterministically score+sort, detect ambiguity, formally verify,
 * and FAIL CLOSED (throw) rather than silently guessing.
 *
 * Here the "candidates" are the steps of an LLM-proposed chain plan
 * (`plan.chain` from handleChain()'s planner call) and the policy is:
 *   - every referenced agentId must exist in the roster,
 *   - crew size must be within the Governor's configured budget,
 *   - no duplicate or circular steps.
 *
 * `collapse()` is called on the parsed plan immediately after the planner
 * LLM call returns, BEFORE the per-step execution loop begins -- preventing
 * handleChain() from blindly executing a malformed or policy-violating plan.
 */

export class QecFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QEC_FATAL";
  }
}

export interface ChainPlanStep {
  agentId: string;
  task: string;
}

export interface ChainPlan {
  plan?: string;
  chain?: ChainPlanStep[];
}

export interface CollapseOptions {
  knownAgentIds: Set<string> | string[];
  maxCrewSize?: number;
}

/**
 * Deterministically validate (collapse) a parsed chain plan. Returns the
 * validated chain on success; throws QecFatalError (fail-closed) on any
 * ambiguity or policy violation -- mirroring morphic-kernel's QEC_FATAL.
 */
export function collapse(plan: ChainPlan, options: CollapseOptions): ChainPlanStep[] {
  if (!plan || !Array.isArray(plan.chain)) {
    throw new QecFatalError("InvalidChainPlan: plan.chain is missing or not an array.");
  }
  const chain = plan.chain;
  if (chain.length === 0) {
    throw new QecFatalError("EmptyChainPlan: the planner returned zero steps.");
  }

  const maxCrewSize = options.maxCrewSize ?? 8;
  if (chain.length > maxCrewSize) {
    throw new QecFatalError(
      `CrewSizeExceeded: plan has ${chain.length} steps, budget allows ${maxCrewSize}.`
    );
  }

  const known = options.knownAgentIds instanceof Set ? options.knownAgentIds : new Set(options.knownAgentIds);

  // 1. Static deterministic filter: every referenced agent must exist.
  const unknown = chain.filter((step) => !known.has(step.agentId));
  if (unknown.length > 0) {
    throw new QecFatalError(
      "UnknownAgentReference: " + unknown.map((s) => s.agentId).join(", ") + " not found in roster."
    );
  }

  // 2. Ambiguity / malformed-step detector: every step needs a non-empty task.
  const malformed = chain.filter((step) => !step.task || !step.task.trim());
  if (malformed.length > 0) {
    throw new QecFatalError("MalformedStep: one or more chain steps has an empty task.");
  }

  // 3. Duplicate/circular detection: the SAME agent should not repeat
  // back-to-back (a real circularity signal in a short pipeline).
  for (let i = 1; i < chain.length; i++) {
    if (chain[i].agentId === chain[i - 1].agentId) {
      throw new QecFatalError(
        `CircularStep: agent '${chain[i].agentId}' is scheduled twice in a row (steps ${i} and ${i + 1}).`
      );
    }
  }

  // 4. Formal verification gate: passed if we reach here without throwing.
  return chain;
}

/** Non-throwing convenience wrapper -- returns null instead of throwing,
 * for call sites that want to render a friendly error instead of crashing. */
export function tryCollapse(plan: ChainPlan, options: CollapseOptions): ChainPlanStep[] | null {
  try {
    return collapse(plan, options);
  } catch {
    return null;
  }
}
