/**
 * localLedger.test.ts — SYNERGY #13 applied to SYNERGY #23's local
 * hash-chained ledger (adapted from morphic-kernel's provenanceLedger.js).
 *
 * Uses jsdom's localStorage + the Web Crypto API (both available under
 * vitest's jsdom environment) so this exercises the REAL sha256Hex path,
 * not a mock.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { appendProvenance, readLedger, verifyLedger, clearLocalLedger } from "../localLedger";

describe("localLedger (SYNERGY #23)", () => {
  beforeEach(() => {
    clearLocalLedger();
  });

  it("starts empty", () => {
    expect(readLedger()).toEqual([]);
  });

  it("appends a record and returns a hash", async () => {
    const result = await appendProvenance({ event: "chain_step", agentId: "x" });
    expect(result.ok).toBe(true);
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(readLedger().length).toBe(1);
  });

  it("chains multiple entries via prevHash", async () => {
    await appendProvenance({ event: "a" });
    await appendProvenance({ event: "b" });
    const entries = readLedger();
    expect(entries.length).toBe(2);
    expect(entries[1].payload.prevHash).toBe(entries[0].hash);
  });

  it("verifies a clean, untampered chain", async () => {
    await appendProvenance({ event: "a" });
    await appendProvenance({ event: "b" });
    await appendProvenance({ event: "c" });
    const result = await verifyLedger();
    expect(result.ok).toBe(true);
    expect(result.length).toBe(3);
  });

  it("detects tampering (hash mismatch)", async () => {
    await appendProvenance({ event: "a" });
    await appendProvenance({ event: "b" });
    const entries = readLedger();
    // Tamper with the first entry's payload directly in localStorage.
    entries[0].payload.event = "tampered";
    localStorage.setItem("agentosirus.local_ledger.v1", JSON.stringify(entries));

    const result = await verifyLedger();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("HashMismatch");
  });

  it("clearLocalLedger empties the ledger", async () => {
    await appendProvenance({ event: "a" });
    clearLocalLedger();
    expect(readLedger()).toEqual([]);
  });
});
