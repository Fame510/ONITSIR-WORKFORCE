/**
 * AuditLedgerView.tsx — SYNERGY #9 / #24: renders the hash-chain + signature
 * verification status of a mission's Shackle audit ledger, fetched from
 * GET /api/audit/:mission_id and GET /api/audit/:mission_id/verify.
 */
import { useEffect, useState } from "react";
import { Link2, ShieldCheck, ShieldAlert } from "lucide-react";
import { getBackendUrl } from "../lib/onitsirClient";
import { VERDICT_COLORS } from "../lib/shackle";
import type { Verdict } from "../types";

interface LedgerEntry {
  index: number;
  at: number;
  tool_name: string;
  verdict: Verdict;
  reason: string;
  entry_hash: string;
  signed: boolean;
}

interface AuditLedgerViewProps {
  missionId: string;
}

export function AuditLedgerView({ missionId }: AuditLedgerViewProps) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [intact, setIntact] = useState<boolean | null>(null);

  useEffect(() => {
    const backend = getBackendUrl();
    if (!backend) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const [ledgerRes, verifyRes] = await Promise.all([
          fetch(backend + "/api/audit/" + missionId).then((r) => r.json()),
          fetch(backend + "/api/audit/" + missionId + "/verify").then((r) => r.json())
        ]);
        if (!cancelled) {
          setEntries(ledgerRes.entries || []);
          setIntact(Boolean(verifyRes.intact));
        }
      } catch {
        // best-effort polling
      }
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [missionId]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-400">
          <Link2 size={14} /> Shackle Audit Ledger
        </span>
        {intact !== null && (
          <span
            className={
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase " +
              (intact ? "bg-emerald-950/40 text-emerald-400" : "bg-red-950/40 text-red-400")
            }
          >
            {intact ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
            {intact ? "chain intact" : "TAMPERED"}
          </span>
        )}
      </div>
      <div className="max-h-56 overflow-y-auto space-y-1 font-mono text-[11px] text-slate-400">
        {entries.map((e) => (
          <div key={e.index} className="flex items-center gap-2">
            <span style={{ color: VERDICT_COLORS[e.verdict] }} className="w-12 shrink-0 font-bold">
              {e.verdict}
            </span>
            <span className="truncate">{e.tool_name}</span>
            <span className="ml-auto text-slate-600">{e.entry_hash.slice(0, 10)}</span>
            {e.signed && <ShieldCheck size={10} className="text-cyan-500" />}
          </div>
        ))}
        {entries.length === 0 && <div className="text-slate-600">No ledger entries yet.</div>}
      </div>
    </div>
  );
}
