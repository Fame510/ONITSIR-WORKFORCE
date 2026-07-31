/**
 * guardedToolCall.test.ts - SP/1.0-Custody, client side.
 *
 * These tests exist to hold one property: a side-effecting call cannot reach
 * the network unless the server said so. Every case below is a way that
 * property could quietly stop holding - a refusal returned instead of thrown,
 * a protected tool running with no capability, an offline build downgrading
 * enforcement to nothing - and asserts that it does not.
 *
 * `fetch` is stubbed rather than the module being mocked, so the real
 * `onitsirClient.getBackendUrl()` is exercised and the local ledger runs
 * against jsdom's localStorage and Web Crypto exactly as it does in a browser.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  PROTECTED_TOOLS,
  isProtected,
  guardedToolCall,
  _executeDirect,
  PolicyDeniedError,
  HitlRequiredError,
  CustodyRefusedError
} from "../guardedToolCall";
import { setBackendUrl } from "../onitsirClient";
import { readLedger, clearLocalLedger } from "../localLedger";

const BACKEND = "http://localhost:8000";
const MISSION = "m-1";

interface StubbedCall {
  url: string;
  body: Record<string, unknown>;
}

const calls: StubbedCall[] = [];

/**
 * Await a call that must reject and hand back the typed error.
 *
 * Written as a helper rather than `.catch()` at each site because a
 * `.catch()` widens the result to "the value or the error", which would let a
 * test that silently started passing (the call resolving instead of throwing)
 * still type-check.
 */
async function rejection<E>(promise: Promise<unknown>): Promise<E> {
  try {
    await promise;
  } catch (error) {
    return error as E;
  }
  throw new Error("expected the call to be refused, but it resolved");
}

/** Minimal Response-shaped object; guardedToolCall reads only these members. */
function reply(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

/** Route by path so a test can describe both legs of the round-trip at once. */
function routeFetch(handlers: {
  authorize?: (body: Record<string, unknown>) => Response;
  execute?: (body: Record<string, unknown>) => Response;
}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push({ url, body });
      if (url.endsWith("/authorize")) {
        if (!handlers.authorize) throw new Error("unexpected /authorize call");
        return handlers.authorize(body);
      }
      if (url.endsWith("/execute")) {
        if (!handlers.execute) throw new Error("unexpected /execute call");
        return handlers.execute(body);
      }
      throw new Error("unexpected fetch to " + url);
    })
  );
}

function allow(isProtectedTool: boolean, capability: unknown = null): Response {
  return reply(200, {
    verdict: "ALLOW",
    reason: "ok",
    deny_reason: "unspecified",
    protected: isProtectedTool,
    capability
  });
}

function authorized(): StubbedCall | undefined {
  return calls.find((c) => c.url.endsWith("/authorize"));
}

function executed(): StubbedCall | undefined {
  return calls.find((c) => c.url.endsWith("/execute"));
}

const CAPABILITY = {
  token_id: "cap-abc",
  mission_id: MISSION,
  tool_name: "repo.push",
  nonce: null,
  args_digest: "d",
  expires_at: 9e12,
  signature: "sig"
};

beforeEach(() => {
  calls.length = 0;
  clearLocalLedger();
  setBackendUrl(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setBackendUrl(null);
});

describe("PROTECTED_TOOLS mirrors onitsir.custody", () => {
  it("contains exactly the eight server-protected tools", () => {
    expect([...PROTECTED_TOOLS].sort()).toEqual([
      "db.write",
      "email.send",
      "files.delete",
      "http.post",
      "payments.transfer",
      "repo.push",
      "secrets.read",
      "shell.exec"
    ]);
  });

  it("reports protected tools as protected", () => {
    expect(isProtected("payments.transfer")).toBe(true);
    expect(isProtected("shell.exec")).toBe(true);
  });

  it("reports unlisted tools as unprotected", () => {
    expect(isProtected("docs.read")).toBe(false);
    expect(isProtected("github.writeFile")).toBe(false);
  });
});

describe("offline mode does not downgrade enforcement", () => {
  it("refuses a protected tool when no backend is configured", async () => {
    const execute = vi.fn(async () => "ran");
    const error = await rejection<CustodyRefusedError>(
      guardedToolCall({ missionId: MISSION, toolName: "repo.push" }, execute)
    );
    expect(error).toBeInstanceOf(CustodyRefusedError);
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses a protected tool when there is a backend but no mission", async () => {
    setBackendUrl(BACKEND);
    const execute = vi.fn(async () => "ran");
    const error = await rejection<CustodyRefusedError>(
      guardedToolCall({ missionId: null, toolName: "email.send" }, execute)
    );
    expect(error).toBeInstanceOf(CustodyRefusedError);
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports the refusal as missing custody, not as a generic failure", async () => {
    const error = await rejection<CustodyRefusedError>(
      guardedToolCall({ missionId: null, toolName: "files.delete" }, async () => "ran")
    );
    expect(error).toBeInstanceOf(CustodyRefusedError);
    expect(error.reason).toBe("missing");
    expect(error.toolName).toBe("files.delete");
  });

  it("runs an unprotected tool and records it", async () => {
    const result = await guardedToolCall(
      { missionId: null, toolName: "docs.read", params: { path: "a" } },
      async (params) => "read:" + String(params.path)
    );
    expect(result).toBe("read:a");
    const ledger = readLedger();
    expect(ledger.length).toBe(1);
    expect(ledger[0].payload.event).toBe("TOOL_EXECUTED");
    expect(ledger[0].payload.tool_name).toBe("docs.read");
  });
});

describe("a refusal is thrown, never returned", () => {
  it("throws PolicyDeniedError on DENY and does not execute", async () => {
    setBackendUrl(BACKEND);
    routeFetch({
      authorize: () =>
        reply(200, {
          verdict: "DENY",
          reason: "budget exhausted",
          deny_reason: "budget_exhausted",
          protected: false,
          capability: null
        })
    });
    const execute = vi.fn(async () => "ran");
    const error = await rejection<PolicyDeniedError>(
      guardedToolCall({ missionId: MISSION, toolName: "github.writeFile" }, execute)
    );
    expect(error).toBeInstanceOf(PolicyDeniedError);
    expect(error.verdict).toBe("DENY");
    expect(error.denyReason).toBe("budget_exhausted");
    expect(error.reason).toBe("budget exhausted");
    expect(execute).not.toHaveBeenCalled();
  });

  it("throws HitlRequiredError on HITL and does not execute", async () => {
    setBackendUrl(BACKEND);
    routeFetch({
      authorize: () =>
        reply(200, {
          verdict: "HITL",
          reason: "operator review",
          deny_reason: "unspecified",
          protected: true,
          capability: null
        })
    });
    const execute = vi.fn(async () => "ran");
    const error = await rejection<HitlRequiredError>(
      guardedToolCall({ missionId: MISSION, toolName: "repo.push" }, execute)
    );
    expect(error).toBeInstanceOf(HitlRequiredError);
    expect(error.verdict).toBe("HITL");
    expect(execute).not.toHaveBeenCalled();
  });

  it("surfaces an authorization transport failure rather than running anyway", async () => {
    setBackendUrl(BACKEND);
    routeFetch({ authorize: () => reply(500, { detail: "boom" }) });
    const execute = vi.fn(async () => "ran");
    const error = await rejection<Error>(
      guardedToolCall({ missionId: MISSION, toolName: "github.raw" }, execute)
    );
    expect(error.message).toContain("Authorization request failed");
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("ALLOW paths", () => {
  it("runs an unprotected tool locally without an execute round-trip", async () => {
    setBackendUrl(BACKEND);
    routeFetch({ authorize: () => allow(false) });
    const result = await guardedToolCall(
      { missionId: MISSION, toolName: "firecrawl.scrape", params: { url: "u" } },
      async () => "markdown"
    );
    expect(result).toBe("markdown");
    expect(executed()).toBeUndefined();
  });

  it("mediates a protected tool through execute before running it", async () => {
    setBackendUrl(BACKEND);
    routeFetch({
      authorize: () => allow(true, CAPABILITY),
      execute: () => reply(200, { ok: true, tool_name: "repo.push", result: null })
    });
    const execute = vi.fn(async () => "pushed");
    const result = await guardedToolCall(
      { missionId: MISSION, toolName: "repo.push", params: { ref: "main" } },
      execute
    );
    expect(result).toBe("pushed");
    expect(executed()?.body.capability_token).toBe("cap-abc");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("refuses when the server allows a protected tool but mints no capability", async () => {
    setBackendUrl(BACKEND);
    routeFetch({ authorize: () => allow(true, null) });
    const execute = vi.fn(async () => "pushed");
    const error = await rejection<CustodyRefusedError>(
      guardedToolCall({ missionId: MISSION, toolName: "repo.push" }, execute)
    );
    expect(error).toBeInstanceOf(CustodyRefusedError);
    expect(error.reason).toBe("missing");
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("custody refusal at execution time", () => {
  it("translates a 403 into CustodyRefusedError carrying the server's reason", async () => {
    setBackendUrl(BACKEND);
    routeFetch({
      authorize: () => allow(true, CAPABILITY),
      execute: () =>
        reply(403, {
          detail: {
            ok: false,
            tool_name: "repo.push",
            reason: "replayed",
            detail: "capability already spent"
          }
        })
    });
    const execute = vi.fn(async () => "pushed");
    const error = await rejection<CustodyRefusedError>(
      guardedToolCall({ missionId: MISSION, toolName: "repo.push" }, execute)
    );
    expect(error).toBeInstanceOf(CustodyRefusedError);
    expect(error.reason).toBe("replayed");
    expect(error.message).toContain("capability already spent");
    expect(execute).not.toHaveBeenCalled();
  });

  it("falls back to an unknown reason when the refusal body is unstructured", async () => {
    setBackendUrl(BACKEND);
    routeFetch({
      authorize: () => allow(true, CAPABILITY),
      execute: () => reply(403, { detail: "Forbidden" })
    });
    const error = await rejection<CustodyRefusedError>(
      guardedToolCall({ missionId: MISSION, toolName: "repo.push" }, async () => "pushed")
    );
    expect(error).toBeInstanceOf(CustodyRefusedError);
    expect(error.reason).toBe("unknown");
  });

  it("surfaces a non-403 execution failure without running the local call", async () => {
    setBackendUrl(BACKEND);
    routeFetch({
      authorize: () => allow(true, CAPABILITY),
      execute: () => reply(500, { detail: "boom" })
    });
    const execute = vi.fn(async () => "pushed");
    const error = await rejection<Error>(
      guardedToolCall({ missionId: MISSION, toolName: "repo.push" }, execute)
    );
    expect(error.message).toContain("Execution failed");
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("argument and nonce binding", () => {
  it("sends the caller's nonce to both legs unchanged", async () => {
    setBackendUrl(BACKEND);
    routeFetch({
      authorize: () => allow(true, CAPABILITY),
      execute: () => reply(200, { ok: true, result: null })
    });
    await guardedToolCall(
      { missionId: MISSION, toolName: "repo.push", nonce: "fixed-nonce" },
      async () => "pushed"
    );
    expect(authorized()?.body.nonce).toBe("fixed-nonce");
    expect(executed()?.body.nonce).toBe("fixed-nonce");
  });

  it("generates a nonce when none is supplied and reuses it for execution", async () => {
    setBackendUrl(BACKEND);
    routeFetch({
      authorize: () => allow(true, CAPABILITY),
      execute: () => reply(200, { ok: true, result: null })
    });
    await guardedToolCall({ missionId: MISSION, toolName: "repo.push" }, async () => "pushed");
    expect(typeof authorized()?.body.nonce).toBe("string");
    expect(executed()?.body.nonce).toBe(authorized()?.body.nonce);
  });

  it("does not reuse a generated nonce across two calls", async () => {
    setBackendUrl(BACKEND);
    routeFetch({ authorize: () => allow(false) });
    await guardedToolCall({ missionId: MISSION, toolName: "docs.read" }, async () => 1);
    await guardedToolCall({ missionId: MISSION, toolName: "docs.read" }, async () => 2);
    const nonces = calls.filter((c) => c.url.endsWith("/authorize")).map((c) => c.body.nonce);
    expect(nonces.length).toBe(2);
    expect(nonces[0]).not.toBe(nonces[1]);
  });

  it("presents the same params to authorization and to execution", async () => {
    setBackendUrl(BACKEND);
    routeFetch({
      authorize: () => allow(true, CAPABILITY),
      execute: () => reply(200, { ok: true, result: null })
    });
    const params = { owner: "Fame510", repo: "ONITSIR-WORKFORCE", ref: "main" };
    await guardedToolCall(
      { missionId: MISSION, toolName: "repo.push", params },
      async () => "pushed"
    );
    expect(authorized()?.body.params).toEqual(params);
    expect(executed()?.body.params).toEqual(params);
  });

  it("forwards cost and tags so the budget and ethics layers see them", async () => {
    setBackendUrl(BACKEND);
    routeFetch({ authorize: () => allow(false) });
    await guardedToolCall(
      {
        missionId: MISSION,
        toolName: "firecrawl.search",
        costUsd: 0.25,
        tags: ["network", "third_party"]
      },
      async () => "results"
    );
    expect(authorized()?.body.cost_usd).toBe(0.25);
    expect(authorized()?.body.tags).toEqual(["network", "third_party"]);
  });

  it("defaults cost to zero and tags to empty rather than omitting them", async () => {
    setBackendUrl(BACKEND);
    routeFetch({ authorize: () => allow(false) });
    await guardedToolCall({ missionId: MISSION, toolName: "docs.read" }, async () => "x");
    expect(authorized()?.body.cost_usd).toBe(0);
    expect(authorized()?.body.tags).toEqual([]);
  });
});

describe("_executeDirect records outcomes", () => {
  it("records a success and returns the value", async () => {
    const result = await _executeDirect("docs.read", {}, async () => 42);
    expect(result).toBe(42);
    const ledger = readLedger();
    expect(ledger[0].payload.event).toBe("TOOL_EXECUTED");
    expect(ledger[0].payload.passed).toBe(true);
  });

  it("records a failure and rethrows rather than swallowing it", async () => {
    const error = await rejection<Error>(
      _executeDirect("docs.read", {}, async () => {
        throw new Error("upstream exploded");
      })
    );
    expect(error.message).toBe("upstream exploded");
    const ledger = readLedger();
    expect(ledger[0].payload.event).toBe("TOOL_FAILED");
    expect(ledger[0].payload.passed).toBe(false);
    expect(String(ledger[0].payload.detail)).toContain("upstream exploded");
  });

  it("does not record a refusal as an execution", async () => {
    await rejection<CustodyRefusedError>(
      guardedToolCall({ missionId: null, toolName: "repo.push" }, async () => "ran")
    );
    expect(readLedger().length).toBe(0);
  });
});
