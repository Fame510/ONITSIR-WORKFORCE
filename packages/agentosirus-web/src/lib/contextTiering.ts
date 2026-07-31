/**
 * contextTiering.ts — SYNERGY #14: HOT/WARM/COLD context tiering for
 * agentosirus's chat/swarm conversation history.
 *
 * Ported concept from SINGULARITY's singularity-python/singularity/core's
 * `Tier` enum + tier-aware eviction (see core/eviction.py::LRUEvictionPolicy,
 * core/blocks.py::Tier) -- there, HOT/WARM/COLD tiers KV-cache blocks by
 * recency to protect the working set under a byte budget. Here the same
 * three-tier idea cuts token costs on long MasterAgentHub conversations:
 *
 *   - HOT:  the most recent N turns, always sent in full.
 *   - WARM: the next M turns, summarized (truncated) to save tokens.
 *   - COLD: everything older, available on demand only (not sent by default).
 *
 * `llm.ts`'s message-building step calls `tierHistory()` to build the
 * `history` array actually sent to providers, and can report token savings
 * (via `estimateSavings`) for display in SettingsPanel.
 */
import type { Message } from "../types";

export enum Tier {
  HOT = "hot",
  WARM = "warm",
  COLD = "cold"
}

export interface TieredMessage extends Message {
  tier: Tier;
}

export interface TieringOptions {
  hotTurns?: number; // most recent N turns sent in full
  warmTurns?: number; // next M turns, summarized
  warmSummaryChars?: number; // truncation length for WARM turns
}

const DEFAULTS: Required<TieringOptions> = {
  hotTurns: 6,
  warmTurns: 10,
  warmSummaryChars: 240
};

/**
 * SYNERGY #14: assign a Tier to every message in `history`, most recent
 * last (matches agentosirus's existing history ordering).
 */
export function assignTiers(history: Message[], options: TieringOptions = {}): TieredMessage[] {
  const opts = { ...DEFAULTS, ...options };
  const n = history.length;
  return history.map((msg, i) => {
    const fromEnd = n - 1 - i; // 0 = most recent
    let tier: Tier;
    if (fromEnd < opts.hotTurns) tier = Tier.HOT;
    else if (fromEnd < opts.hotTurns + opts.warmTurns) tier = Tier.WARM;
    else tier = Tier.COLD;
    return { ...msg, tier };
  });
}

function summarize(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trimEnd() + "\u2026 [truncated by context tiering]";
}

/**
 * Build the actual `history` array to send to a provider: HOT turns sent in
 * full, WARM turns summarized/truncated, COLD turns dropped entirely (a
 * caller can still fetch them on demand for a "show full history" view).
 */
export function tierHistory(history: Message[], options: TieringOptions = {}): Message[] {
  const opts = { ...DEFAULTS, ...options };
  const tiered = assignTiers(history, opts);
  return tiered
    .filter((m) => m.tier !== Tier.COLD)
    .map((m) => (m.tier === Tier.WARM ? { role: m.role, text: summarize(m.text, opts.warmSummaryChars) } : { role: m.role, text: m.text }));
}

export interface SavingsEstimate {
  originalChars: number;
  tieredChars: number;
  savedChars: number;
  savedPct: number;
}

/** SYNERGY #14: token/char savings estimate, for SettingsPanel display. */
export function estimateSavings(history: Message[], options: TieringOptions = {}): SavingsEstimate {
  const original = history.reduce((sum, m) => sum + m.text.length, 0);
  const tiered = tierHistory(history, options).reduce((sum, m) => sum + m.text.length, 0);
  const saved = Math.max(0, original - tiered);
  return {
    originalChars: original,
    tieredChars: tiered,
    savedChars: saved,
    savedPct: original > 0 ? Math.round((saved / original) * 1000) / 10 : 0
  };
}
