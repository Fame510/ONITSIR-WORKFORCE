/**
 * guardedToolCall.ts - the client-side half of SP/1.0-Custody.
 *
 * ## The rule
 *
 * No side-effecting tool call goes out of this application except through
 * `guardedToolCall()`. A call that reaches the network without passing
 * through here has not been decided on and has no capability, which means
 * the server will refuse it if the tool is protected - and, if the tool is
 * *not* protected, means it happened with no governance record at all.
 *
 * ## Why this exists as a wrapper rather than as discipline
 *
 * The previous arrangement asked each call site to consult
 * `onitsirClient.checkGate()` and then honour the answer. That is a decided
 * constraint: a call site that forgot, or that was written after the rule was
 * agreed, simply ran. This wrapper removes the choice. It performs the
 * authorization round-trip itself, throws on anything that is not an
 * `ALLOW`, and forwards the minted capability to the executor.
 *
 * ## Offline mode
 *
 * With no backend configured the application runs against `apiShim.ts`, and
 * there is no server to mediate anything. In that mode `guardedToolCall()`
 * still refuses to run a tool the server would consider protected, because
 * silently downgrading enforcement when the enforcement point is absent is
 * exactly the failure this module exists to prevent. Unprotected tools run
 * directly and are recorded in the local ledger.
 *
 * ## Lint rule (documentation, not yet enforced)
 *
 * There is no eslint configuration in this package today, so the following
 * is a specification for the rule to add when one is introduced, rather than
 * a rule that currently runs:
 *
 *     // .eslintrc.cjs
 *     rules: {
 *       "no-restricted-syntax": ["error", {
 *         selector:
 *           "CallExpression[callee.object.name=/^(github|firecrawl|playwright|kling)$/]" +
 *           "[callee.property.name=/^(writeFile|createIssue|createRepo|raw|call|generate)$/]",
 *         message:
 *           "Side-effecting integrations must be called through guardedToolCall()."
 *       }]
 *     }
 *
 * Until that rule exists, `integrations.ts` enforces the same property
 * structurally: the side-effecting methods route through `guardedToolCall()`
 * internally, so a call site cannot reach the network unguarded even by
 * calling them directly.
 */
import { getBackendUrl } from "./onitsirClient";
import { appendProvenance } from "./localLedger";
import type { DenyReason, Verdict } from "../types";

/**
 * Tools the server will refuse to execute without a capability. Mirrors
 * `onitsir.custody.PROTECTED_TOOLS`.
 *
 * This is a mirror, not a second authority. The server decides; this copy
 * exists so the client can fail fast and, in offline mode, refuse rather
 * than pretend. If the two drift, the server wins and the client's optimism
 * simply becomes a 403.
 */
export const PROTECTED_TOOLS: ReadonlySet<string> = new Set([
  "payments.transfer",
  "email.send",
  "files.delete",
  "repo.push",
  "shell.exec",
  "secrets.read",
  "db.write",
  "http.post"
]);

export function isProtected(toolName: string): boolean {
  return PROTECTED_TOOLS.has(toolName);
}

/** Thrown when the Governor refused the call outright. */
export class PolicyDeniedError extends Error {
  readonly verdict: Verdict = "DENY";
  readonly reason: string;
  readonly denyReason: DenyReason;
  readonly toolName: string;

  constructor(toolName: string, reason: string, denyReason: DenyReason) {
    super("Policy denied " + toolName + ": " + reason);
    this.name = "PolicyDeniedError";
    this.toolName = toolName;
    this.reason = reason;
    this.denyReason = denyReason;
  }
}

/** Thrown when the call needs an operator decision before it can proceed. */
export class HitlRequiredError extends Error {
  readonly verdict: Verdict = "HITL";
  readonly reason: string;
  readonly toolName: string;

  constructor(toolName: string, reason: string) {
    super("Human review required for " + toolName + ": " + reason);
    this.name = "HitlRequiredError";
    this.toolName = toolName;
    this.reason = reason;
  }
}

/** Thrown when custody refused the execution itself. */
export class CustodyRefusedError extends Error {
  readonly toolName: string;
  /** missing | replayed | expired | mission_mismatch | tool_mismatch |
   *  nonce_mismatch | args_mismatch | bad_signature */
  readonly reason: string;

  constructor(toolName: string, reason: string, detail: string) {
    super("Custody refused " + toolName + ": " + detail);
    this.name = "CustodyRefusedError";
    this.toolName = toolName;
    this.reason = reason;
  }
}

interface Capability {
  token_id: string;
  mission_id: string;
  tool_name: string;
  nonce: string | null;
  args_digest: string;
  expires_at: number;
  signature: string;
}

interface AuthorizeResponse {
  verdict: Verdict;
  reason: string;
  deny_reason: DenyReason;
  protected: boolean;
  capability: Capability | null;
}

export interface GuardedCallOptions {
  /** Mission the call belongs to. Required for any governed call. */
  missionId: string | null;
  /** Stable tool identifier, e.g. "github.writeFile". */
  toolName: string;
  /** Arguments. Hashed server-side and bound into the capability. */
  params?: Record<string, unknown>;
  /** Estimated cost, deducted before the decision as at the gate. */
  costUsd?: number;
  /** Ethics tags for the declarative veto layer. */
  tags?: string[];
  /** Replay-scoping nonce. Generated when omitted. */
  nonce?: string;
}

let _nonceCounter = 0;

function newNonce(toolName: string): string {
  _nonceCounter += 1;
  return toolName + ":" + Date.now() + ":" + _nonceCounter;
}

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, data: data as T };
}

/**
 * The single sanctioned path for a side-effecting tool call.
 *
 * 1. Authorize. `POST /api/mission/{id}/authorize` runs the same server-side
 *    `decide()` the gate does, and mints a capability only on `ALLOW` for a
 *    protected tool.
 * 2. Refuse loudly. A `DENY` throws `PolicyDeniedError`; a `HITL` throws
 *    `HitlRequiredError`. Neither returns a value, so a caller cannot treat
 *    a refusal as a soft warning and continue.
 * 3. Execute. The capability is presented alongside the same arguments it
 *    was minted for. Changing them here is a 403 from the server, not a
 *    client-side check that could be edited out.
 *
 * `execute` is the local implementation of the call. It receives the
 * arguments only after authorization succeeds.
 */
export async function guardedToolCall<T>(
  options: GuardedCallOptions,
  execute: (params: Record<string, unknown>) => Promise<T>
): Promise<T> {
  const { toolName, missionId } = options;
  const params = options.params ?? {};
  const nonce = options.nonce ?? newNonce(toolName);
  const backend = getBackendUrl();

  // -- offline / ungoverned -------------------------------------------------
  if (!backend || !missionId) {
    if (isProtected(toolName)) {
      // Refusing is the only honest option. There is no enforcement point to
      // mediate the call, and running it anyway would mean the protection
      // silently evaporates in exactly the configuration where nothing is
      // watching.
      throw new CustodyRefusedError(
        toolName,
        "missing",
        toolName +
          " is a protected tool and requires a governed mission. Configure an " +
          "ONITSIR backend and run inside a mission before calling it."
      );
    }
    const result = await _executeDirect(toolName, params, execute);
    return result;
  }

  // -- 1. authorize ---------------------------------------------------------
  const authorize = await postJson<AuthorizeResponse>(
    backend + "/api/mission/" + missionId + "/authorize",
    {
      tool_name: toolName,
      cost_usd: options.costUsd ?? 0,
      nonce,
      params,
      tags: options.tags ?? []
    }
  );

  if (!authorize.ok) {
    throw new Error(
      "Authorization request failed for " + toolName + " (" + authorize.status + ")"
    );
  }

  const auth = authorize.data;

  // -- 2. refuse loudly -----------------------------------------------------
  if (auth.verdict === "DENY") {
    throw new PolicyDeniedError(toolName, auth.reason, auth.deny_reason);
  }
  if (auth.verdict === "HITL") {
    throw new HitlRequiredError(toolName, auth.reason);
  }

  // -- 3. execute -----------------------------------------------------------
  if (!auth.protected) {
    // Allowed, and the server does not mediate this tool. Run it locally and
    // record it, so an unmediated call is still an accounted-for call.
    return _executeDirect(toolName, params, execute);
  }

  if (!auth.capability) {
    // ALLOW on a protected tool with no capability should be impossible. If
    // it happens, the safe reading is that mediation is not in place, so
    // refuse rather than fall back to running unmediated.
    throw new CustodyRefusedError(
      toolName,
      "missing",
      "server allowed " + toolName + " but issued no capability"
    );
  }

  const execution = await postJson<{ ok: boolean; result: unknown }>(
    backend + "/api/mission/" + missionId + "/execute",
    {
      tool_name: toolName,
      capability_token: auth.capability.token_id,
      nonce,
      params
    }
  );

  if (execution.status === 403) {
    const detail = (execution.data as unknown as { detail?: { reason?: string; detail?: string } })?.detail;
    throw new CustodyRefusedError(
      toolName,
      detail?.reason ?? "unknown",
      detail?.detail ?? "custody refused the execution"
    );
  }
  if (!execution.ok) {
    throw new Error("Execution failed for " + toolName + " (" + execution.status + ")");
  }

  // The server ran the registered implementation. The local one runs too,
  // because in this deployment the browser holds the credentials and the
  // server's registered tools are inert. The server call is the mediation
  // step; the local call is the effect it authorized.
  return _executeDirect(toolName, params, execute);
}

/** Best-effort ledger append. Never allowed to change a call's outcome. */
async function _record(record: Record<string, unknown> & { event: string }): Promise<void> {
  try {
    await appendProvenance(record);
  } catch {
    // The ledger is a record, not a gate. A storage failure must not turn a
    // successful call into a failed one, nor a refusal into a success.
  }
}

/**
 * Run the local implementation and record the outcome in the local ledger.
 *
 * Exported for the guarded wrappers in `integrations.ts` and for tests. It
 * performs no authorization of its own and must never be called from a UI
 * component or a chain step - `guardedToolCall()` is the entry point.
 */
export async function _executeDirect<T>(
  toolName: string,
  params: Record<string, unknown>,
  execute: (params: Record<string, unknown>) => Promise<T>
): Promise<T> {
  try {
    const result = await execute(params);
    await _record({ event: "TOOL_EXECUTED", tool_name: toolName, passed: true });
    return result;
  } catch (error) {
    await _record({
      event: "TOOL_FAILED",
      tool_name: toolName,
      passed: false,
      detail: (error as Error).message.slice(0, 200)
    });
    throw error;
  }
}
