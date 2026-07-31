/**
 * MissionTelemetry.tsx — SYNERGY #25: REAL data only, sourced from
 * /ws/mission/:id (via onitsirClient.ts) or from the local activityBus
 * (provider/model used, chain step status). Nothing in this component is
 * fabricated for visual effect -- every number traces back to an actual
 * Governor verdict, Iron Law check, or LLM provider response.
 *
 * This is the authoritative counterpart to CockpitFlourish.tsx's explicitly
 * decorative telemetry; MasterAgentHub.tsx renders both, clearly labeled and
 * visually separated, so a user can never mistake atmosphere for fact.
 */
import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Gauge } from "lucide-react";
import { subscribeGraph } from "../lib/activityBus";
import type { MindGraph } from "../lib/activityBus";

export function MissionTelemetry() {
  const [graph, setGraph] = useState<MindGraph | null>(null);

  useEffect(() => subscribeGraph(setGraph), []);

  const doneCount = graph?.nodes.filter((n) => n.state === "done").length ?? 0;
  const errorCount = graph?.nodes.filter((n) => n.state === "error").length ?? 0;
  const totalCount = graph?.nodes.length ?? 0;
  const providers = new Set((graph?.nodes || []).map((n) => n.provider).filter(Boolean));

  return (
    <div
      className="grid grid-cols-3 gap-3 rounded-2xl border border-cyan-800/40 bg-cyan-950/10 p-3"
      data-authoritative="true"
      title="Real telemetry -- derived from actual mission/activityBus events, never fabricated."
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <Gauge size={14} className="text-cyan-400" />
        <span className="font-mono text-sm font-bold text-cyan-300">
          {doneCount}/{totalCount}
        </span>
        <span className="text-[9px] uppercase tracking-widest text-slate-500">Steps completed (real)</span>
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        {errorCount > 0 ? <ShieldAlert size={14} className="text-red-400" /> : <ShieldCheck size={14} className="text-emerald-400" />}
        <span className={"font-mono text-sm font-bold " + (errorCount > 0 ? "text-red-300" : "text-emerald-300")}>{errorCount}</span>
        <span className="text-[9px] uppercase tracking-widest text-slate-500">Failed evidence checks (real)</span>
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="font-mono text-sm font-bold text-slate-200">{providers.size}</span>
        <span className="text-[9px] uppercase tracking-widest text-slate-500">Distinct providers used (real)</span>
      </div>
    </div>
  );
}
