/**
 * localLedger.ts — SYNERGY #23: local hash-chained ledger for offline mode.
 *
 * Adapted from morphic-kernel's src/runtime/provenanceLedger.js
 * (`appendProvenance`/`readLedger`/`verifyLedger`, file-backed in Node)
 * to a browser-storage backend (`localStorage`, under a versioned key
 * matching keyVault.ts's pattern) instead of a fresh port of ONITSIR's
 * Python AuditLedger.
 *
 * When agentosirus runs in pure static/offline mode (no onitsir-server
 * backend configured, SettingsPanel's "Use ONITSIR backend" toggle is off),
 * it still needs SOME audit trail for chain executions. `apiShim.ts`'s
 * `handleChain()` appends to this ledger as the fallback when no backend is
 * configured, keeping the "no fake success, tamper-evident record" ethos
 * alive even offline.
 */
const LEDGER_KEY = "agentosirus.local_ledger.v1";

export interface LedgerRecord {
  event: string;
  [key: string]: unknown;
}

export interface LedgerEntry {
  hash: string;
  payload: LedgerRecord & { prevHash: string | null; ts: number };
}

function loadRaw(): LedgerEntry[] {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LedgerEntry[];
  } catch {
    return [];
  }
}

function saveRaw(entries: LedgerEntry[]): void {
  localStorage.setItem(LEDGER_KEY, JSON.stringify(entries));
}

async function sha256Hex(text: string): Promise<string> {
  // Uses the browser's native SubtleCrypto -- no dependency needed, and it
  // mirrors morphic-kernel's Node `crypto.createHash('sha256')` semantics.
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function lastHash(): Promise<string | null> {
  const entries = loadRaw();
  if (entries.length === 0) return null;
  return entries[entries.length - 1].hash;
}

/** Append one record to the local ledger. Returns the new entry's hash. */
export async function appendProvenance(record: LedgerRecord): Promise<{ ok: true; hash: string }> {
  const prev = await lastHash();
  const payload = { ...record, prevHash: prev, ts: Date.now() };
  const line = JSON.stringify(payload);
  const hash = await sha256Hex(line);
  const entries = loadRaw();
  entries.push({ hash, payload });
  saveRaw(entries);
  return { ok: true, hash };
}

export function readLedger(): LedgerEntry[] {
  return loadRaw();
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  at?: string;
  length?: number;
}

/** Recompute every hash in the chain and confirm no post-hoc mutation. */
export async function verifyLedger(): Promise<VerifyResult> {
  const entries = loadRaw();
  let prev: string | null = null;
  for (const e of entries) {
    const recomputed = await sha256Hex(JSON.stringify(e.payload));
    if (recomputed !== e.hash) return { ok: false, reason: "HashMismatch", at: e.hash };
    if (e.payload.prevHash !== prev) return { ok: false, reason: "ChainBreak", at: e.hash };
    prev = e.hash;
  }
  return { ok: true, length: entries.length };
}

export function clearLocalLedger(): void {
  localStorage.removeItem(LEDGER_KEY);
}
