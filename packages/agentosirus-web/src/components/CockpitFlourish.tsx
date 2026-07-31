/**
 * CockpitFlourish.tsx — SYNERGY #25: isolated, clearly-namespaced DECORATIVE
 * telemetry, extracted out of MasterAgentHub.tsx.
 *
 * MasterAgentHub.tsx previously mixed "mock HUD telemetry that oscillates
 * for visual realism" (arc reactor power, core temp, grid throughput)
 * directly alongside real data (provider/model used, chain step status).
 * SINGULARITY's "never fabricate numbers" discipline (its `TeleportReport`
 * explicitly documents "nothing here fabricates performance numbers") means
 * that ambiguity has to end: this component is EXPLICITLY non-authoritative.
 *
 * Nothing rendered here is derived from a real Governor/ledger/mission
 * event. It exists purely for visual atmosphere ("JARVIS HUD" vibe) and
 * every value is locally generated pseudo-randomness with NO backend
 * round-trip. Real governance/audit data lives in MissionTelemetry.tsx,
 * sourced from /ws/mission/:id -- never mix the two files' state.
 */
import { useEffect, useState } from "react";
import { Cpu, Zap, Activity } from "lucide-react";

interface FlourishState {
  arcReactorPower: number; // 0-100, DECORATIVE ONLY
  coreTempC: number; // DECORATIVE ONLY
  gridThroughputMbps: number; // DECORATIVE ONLY
}

function randomWalk(value: number, min: number, max: number, jitter: number): number {
  const next = value + (Math.random() - 0.5) * jitter;
  return Math.min(max, Math.max(min, next));
}

export function CockpitFlourish() {
  const [state, setState] = useState<FlourishState>({
    arcReactorPower: 92,
    coreTempC: 38,
    gridThroughputMbps: 640
  });

  useEffect(() => {
    const id = setInterval(() => {
      setState((s) => ({
        arcReactorPower: randomWalk(s.arcReactorPower, 80, 100, 4),
        coreTempC: randomWalk(s.coreTempC, 32, 44, 1.5),
        gridThroughputMbps: randomWalk(s.gridThroughputMbps, 400, 900, 40)
      }));
    }, 1500);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-3 opacity-90"
      data-authoritative="false"
      title="Decorative cockpit telemetry -- not derived from real mission/governance data. See MissionTelemetry.tsx for real data."
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <Zap size={14} className="text-amber-400" />
        <span className="font-mono text-sm font-bold text-amber-300">{state.arcReactorPower.toFixed(0)}%</span>
        <span className="text-[9px] uppercase tracking-widest text-slate-600">Arc Reactor (decorative)</span>
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <Cpu size={14} className="text-cyan-400" />
        <span className="font-mono text-sm font-bold text-cyan-300">{state.coreTempC.toFixed(1)}&deg;C</span>
        <span className="text-[9px] uppercase tracking-widest text-slate-600">Core Temp (decorative)</span>
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <Activity size={14} className="text-fuchsia-400" />
        <span className="font-mono text-sm font-bold text-fuchsia-300">{state.gridThroughputMbps.toFixed(0)} Mbps</span>
        <span className="text-[9px] uppercase tracking-widest text-slate-600">Grid Throughput (decorative)</span>
      </div>
    </div>
  );
}
