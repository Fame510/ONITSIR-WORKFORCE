/**
 * HitlPrompt.tsx — SYNERGY #10 / #16: operator APPROVE/REJECT/MODIFY UI.
 *
 * Rendered whenever a MissionEvent of type HITL_PROMPT arrives (see
 * onitsirClient.ts::subscribeMission). Resolves via
 * onitsirClient.ts::resolveHitl(), which POSTs to
 * /api/mission/:id/hitl -- the same bounded-timeout HITL contract used by
 * governed browser automation (SYNERGY #16) and Engine.run_async() (both on
 * the onitsir-core side; see onitsir/shackle.py::Governor.hitl_timeout()).
 *
 * If the operator does not respond before the server-side timeout
 * (`GovernorConfig.hitl_timeout_s`), the action resolves to safe DENY on its
 * own -- this component does not need to implement a countdown itself to be
 * safe, but shows one for clarity.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Check, X, Pencil } from "lucide-react";
import { resolveHitl } from "../lib/onitsirClient";

interface HitlPromptProps {
  missionId: string;
  toolName: string;
  reason: string;
  timeoutS?: number;
  onResolved?: (decision: "approve" | "reject" | "modify") => void;
}

export function HitlPrompt({ missionId, toolName, reason, timeoutS = 60, onResolved }: HitlPromptProps) {
  const [remaining, setRemaining] = useState(timeoutS);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<"approve" | "reject" | "modify" | null>(null);

  useEffect(() => {
    if (resolved) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [resolved]);

  const decide = async (decision: "approve" | "reject" | "modify") => {
    setResolving(true);
    try {
      await resolveHitl(missionId, decision);
      setResolved(decision);
      onResolved?.(decision);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-4 shadow-lg">
      <div className="mb-2 flex items-center gap-2 text-amber-400">
        <AlertTriangle size={16} />
        <span className="text-xs font-bold uppercase tracking-widest">Human review required</span>
        {!resolved && <span className="ml-auto font-mono text-[10px] text-amber-500/80">{remaining}s until safe auto-deny</span>}
      </div>
      <p className="mb-3 text-sm text-amber-100">
        <span className="font-mono text-amber-400">{toolName}</span>: {reason}
      </p>
      {resolved ? (
        <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Resolved: {resolved}</div>
      ) : (
        <div className="flex gap-2">
          <button
            disabled={resolving}
            onClick={() => decide("approve")}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold uppercase text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <Check size={13} /> Approve
          </button>
          <button
            disabled={resolving}
            onClick={() => decide("modify")}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold uppercase text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Pencil size={13} /> Modify
          </button>
          <button
            disabled={resolving}
            onClick={() => decide("reject")}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold uppercase text-white hover:bg-red-500 disabled:opacity-50"
          >
            <X size={13} /> Reject
          </button>
        </div>
      )}
    </div>
  );
}
