/**
 * qec.test.ts — SYNERGY #13 (ADROS's `--test` self-diagnostic mode as a CI
 * gate for agentosirus) applied to SYNERGY #22's deterministic-collapse
 * sanity filter.
 */
import { describe, it, expect } from "vitest";
import { collapse, tryCollapse, QecFatalError } from "../qec";

describe("qec.collapse (SYNERGY #22)", () => {
  const knownAgentIds = new Set(["design-brand-guardian", "engineering-frontend-developer", "marketing-growth-hacker"]);

  it("accepts a well-formed plan", () => {
    const plan = {
      plan: "do the thing",
      chain: [
        { agentId: "design-brand-guardian", task: "design a logo" },
        { agentId: "engineering-frontend-developer", task: "build the landing page" }
      ]
    };
    const result = collapse(plan, { knownAgentIds });
    expect(result.length).toBe(2);
  });

  it("fails closed on an unknown agent reference", () => {
    const plan = { chain: [{ agentId: "does-not-exist", task: "x" }] };
    expect(() => collapse(plan, { knownAgentIds })).toThrow(QecFatalError);
  });

  it("fails closed on an empty chain", () => {
    const plan = { chain: [] };
    expect(() => collapse(plan, { knownAgentIds })).toThrow(QecFatalError);
  });

  it("fails closed on a missing chain field", () => {
    const plan = {};
    expect(() => collapse(plan as any, { knownAgentIds })).toThrow(QecFatalError);
  });

  it("fails closed on crew size exceeding budget", () => {
    const plan = {
      chain: [
        { agentId: "design-brand-guardian", task: "a" },
        { agentId: "engineering-frontend-developer", task: "b" },
        { agentId: "marketing-growth-hacker", task: "c" }
      ]
    };
    expect(() => collapse(plan, { knownAgentIds, maxCrewSize: 2 })).toThrow(QecFatalError);
  });

  it("fails closed on a malformed (empty task) step", () => {
    const plan = { chain: [{ agentId: "design-brand-guardian", task: "  " }] };
    expect(() => collapse(plan, { knownAgentIds })).toThrow(QecFatalError);
  });

  it("fails closed on a circular back-to-back step", () => {
    const plan = {
      chain: [
        { agentId: "design-brand-guardian", task: "a" },
        { agentId: "design-brand-guardian", task: "b" }
      ]
    };
    expect(() => collapse(plan, { knownAgentIds })).toThrow(QecFatalError);
  });

  it("tryCollapse returns null instead of throwing", () => {
    const plan = { chain: [] };
    expect(tryCollapse(plan, { knownAgentIds })).toBeNull();
  });
});
