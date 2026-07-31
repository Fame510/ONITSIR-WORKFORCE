/**
 * MissionConsole.tsx — SYNERGY #24: displays ONITSIR's phase log + Governor
 * verdicts for a governed mission, subscribing to WS /ws/mission/:id via
 * onitsirClient.ts's `subscribeMission()`.
 *
 * This is real telemetry (see MissionTelemetry.tsx / CockpitFlourish.tsx
 * split for SYNERGY #25) -- every line here traces back to an actual
 * Governor ruling or Iron Law check on the server, never a decorative
 * animation.
 */
import { useEffect, useRef, useState } from "react";
import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { subscribeMission } from "../lib/onitsirClient";
import { VERDICT_COLORS } from "../lib/shackle";
import type { MissionEvent, Verdict } from "../types";

interface MissionConsoleProps {
  missionId: string;
}

function iconFor(verdict: Verdict) {
  if (verdict === "ALLOW") return <ShieldCheck size={14} />;
  if (verdict === "DENY") return <ShieldAlert size={14} />;
  return <ShieldQuestion size={14} />;
}

export function MissionConsole({ missionId }: MissionConsoleProps) {
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = subscribeMission(missionId, (ev) => {
      setEvents((prev) => [...prev, ev]);
    });
    return unsubscribe;
  }, [missionId]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 font-mono text-xs text-slate-300">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold uppercase tracking-widest text-cyan-400">Mission Console</span>
        <span className="text-slate-500">{missionId.slice(0, 8)}</span>
      </div>
      <div ref={logRef} className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
        {events.length === 0 && <div className="text-slate-600">Waiting for mission events&hellip;</div>}
        {events.map((ev, i) => (
          <div key={i} className="flex items-start gap-2">
            {typeof ev.verdict === "string" ? (
              <span style={{ color: VERDICT_COLORS[ev.verdict as Verdict] }}>{iconFor(ev.verdict as Verdict)}</span>
            ) : (
              <span className="text-slate-500">&bull;</span>
            )}
            <span className="text-slate-500">[{ev.type}]</span>
            <span>{JSON.stringify(ev).slice(0, 160)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
