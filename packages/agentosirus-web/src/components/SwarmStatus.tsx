/**
 * SwarmStatus.tsx — SYNERGY #17: fleet-wide view of active mission workers,
 * fetched from GET /api/swarm/status (onitsir-server/app/routes/swarm.py,
 * wrapping onitsir-core/onitsir/swarm/coordinator.py::SwarmCoordinator).
 */
import { useEffect, useState } from "react";
import { Users, Activity } from "lucide-react";
import { getBackendUrl } from "../lib/onitsirClient";

interface SwarmSummary {
  total_agents: number;
  by_status: { online: number; stale: number; down: number };
  active_assignments: number;
}

export function SwarmStatus() {
  const [summary, setSummary] = useState<SwarmSummary | null>(null);

  useEffect(() => {
    const backend = getBackendUrl();
    if (!backend) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await fetch(backend + "/api/swarm/status").then((r) => r.json());
        if (!cancelled) setSummary(data);
      } catch {
        // best-effort
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!getBackendUrl()) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-500">
        Swarm coordination requires an ONITSIR backend connection.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-400">
        <Users size={14} /> Swarm Coordinator
      </div>
      {summary ? (
        <div className="grid grid-cols-4 gap-3 text-center font-mono text-xs">
          <div>
            <div className="text-lg font-bold text-white">{summary.total_agents}</div>
            <div className="text-slate-500">workers</div>
          </div>
          <div>
            <div className="text-lg font-bold text-emerald-400">{summary.by_status.online}</div>
            <div className="text-slate-500">online</div>
          </div>
          <div>
            <div className="text-lg font-bold text-amber-400">{summary.by_status.stale}</div>
            <div className="text-slate-500">stale</div>
          </div>
          <div>
            <div className="text-lg font-bold text-red-400">{summary.by_status.down}</div>
            <div className="text-slate-500">down</div>
          </div>
          <div className="col-span-4 mt-1 flex items-center justify-center gap-1 text-slate-400">
            <Activity size={11} /> {summary.active_assignments} active mission assignment(s)
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-600">Loading fleet status&hellip;</div>
      )}
    </div>
  );
}
