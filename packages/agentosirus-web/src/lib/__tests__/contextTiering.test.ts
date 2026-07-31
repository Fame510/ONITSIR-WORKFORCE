/**
 * contextTiering.test.ts — SYNERGY #13 applied to SYNERGY #14's HOT/WARM/COLD
 * context tiering.
 */
import { describe, it, expect } from "vitest";
import { assignTiers, tierHistory, estimateSavings, Tier } from "../contextTiering";
import type { Message } from "../../types";

function makeHistory(n: number): Message[] {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "model",
    text: `Turn ${i}: ` + "x".repeat(50)
  })) as Message[];
}

describe("contextTiering (SYNERGY #14)", () => {
  it("assigns the most recent turns to HOT", () => {
    const history = makeHistory(20);
    const tiered = assignTiers(history, { hotTurns: 4, warmTurns: 4 });
    const lastFour = tiered.slice(-4);
    expect(lastFour.every((m) => m.tier === Tier.HOT)).toBe(true);
  });

  it("assigns mid-range turns to WARM and old turns to COLD", () => {
    const history = makeHistory(20);
    const tiered = assignTiers(history, { hotTurns: 4, warmTurns: 4 });
    expect(tiered.slice(0, 12).every((m) => m.tier === Tier.COLD)).toBe(true);
    expect(tiered.slice(12, 16).every((m) => m.tier === Tier.WARM)).toBe(true);
  });

  it("tierHistory drops COLD turns and truncates WARM turns", () => {
    const history = makeHistory(20);
    const result = tierHistory(history, { hotTurns: 2, warmTurns: 2, warmSummaryChars: 10 });
    expect(result.length).toBe(4); // 2 hot + 2 warm, cold dropped
    const warmMsg = result[0];
    expect(warmMsg.text.length).toBeLessThan(60);
  });

  it("estimateSavings reports a non-negative reduction", () => {
    const history = makeHistory(30);
    const savings = estimateSavings(history);
    expect(savings.savedChars).toBeGreaterThanOrEqual(0);
    expect(savings.tieredChars).toBeLessThanOrEqual(savings.originalChars);
  });

  it("never drops anything when history is shorter than hot+warm", () => {
    const history = makeHistory(3);
    const result = tierHistory(history, { hotTurns: 6, warmTurns: 10 });
    expect(result.length).toBe(3);
  });
});
