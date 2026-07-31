import { useEffect, useMemo, useState } from "react";
import { subscribeGraph, MindGraph, MindNode, NodeState } from "../lib/activityBus";
import { Activity, Sparkles } from "lucide-react";

/**
 * Live mind map.
 *
 * Renders the current agent workflow as an animated radial graph: the task sits
 * at the centre and each specialist orbits it, lighting up as it thinks,
 * streams, finishes, or fails. Pure SVG so it stays smooth and dependency-free.
 */

const STATE_STYLE: Record<NodeState, { fill: string; ring: string; glow: string; label: string }> = {
  idle:      { fill: "#e2e8f0", ring: "#94a3b8", glow: "rgba(148,163,184,0.35)", label: "Queued" },
  thinking:  { fill: "#fde68a", ring: "#f59e0b", glow: "rgba(245,158,11,0.55)", label: "Thinking" },
  streaming: { fill: "#a7f3d0", ring: "#10b981", glow: "rgba(16,185,129,0.55)", label: "Working" },
  done:      { fill: "#bfdbfe", ring: "#3b82f6", glow: "rgba(59,130,246,0.5)",  label: "Complete" },
  error:     { fill: "#fecdd3", ring: "#f43f5e", glow: "rgba(244,63,94,0.5)",   label: "Failed" }
};

interface Positioned extends MindNode {
  x: number;
  y: number;
}

const W = 720;
const H = 460;
const CX = W / 2;
const CY = H / 2;

export function MindMap() {
  const [graph, setGraph] = useState<MindGraph>({ title: "Idle", nodes: [], edges: [], running: false });
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeGraph(setGraph), []);

  // Drives the pulse/dash animations.
  useEffect(() => {
    if (!graph.running) return;
    const id = setInterval(() => setTick((t) => t + 1), 90);
    return () => clearInterval(id);
  }, [graph.running]);

  const positioned = useMemo<Positioned[]>(() => {
    const count = graph.nodes.length;
    if (count === 0) return [];
    const radius = count <= 3 ? 150 : count <= 6 ? 175 : 195;
    return graph.nodes.map((node, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      return { ...node, x: CX + Math.cos(angle) * radius, y: CY + Math.sin(angle) * radius };
    });
  }, [graph.nodes]);

  const byId = useMemo(() => {
    const map: Record<string, Positioned> = {};
    positioned.forEach((n) => { map[n.id] = n; });
    return map;
  }, [positioned]);

  const activeCount = graph.nodes.filter((n) => n.state === "thinking" || n.state === "streaming").length;
  const doneCount = graph.nodes.filter((n) => n.state === "done").length;

  if (graph.nodes.length === 0) {
    return (
      <div className="rounded-3xl border border-white/70 bg-white/70 p-10 text-center shadow-[0_18px_45px_-24px_rgba(79,70,229,0.45)] backdrop-blur">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 via-fuchsia-400 to-amber-300 text-white shadow-lg">
          <Sparkles size={26} />
        </div>
        <p className="font-display text-lg font-bold text-slate-800">Mind map standing by</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Send a task to the swarm and every specialist will appear here, lighting up live as it works.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/70 bg-gradient-to-br from-white/90 via-indigo-50/70 to-fuchsia-50/60 shadow-[0_22px_60px_-28px_rgba(79,70,229,0.5)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/70 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className={"flex h-8 w-8 items-center justify-center rounded-xl text-white shadow " +
            (graph.running ? "bg-gradient-to-br from-emerald-400 to-teal-500" : "bg-gradient-to-br from-indigo-400 to-fuchsia-500")}>
            <Activity size={16} className={graph.running ? "animate-pulse" : ""} />
          </span>
          <div>
            <p className="font-display text-sm font-bold uppercase tracking-wide text-slate-800">Live Mind Map</p>
            <p className="max-w-md truncate text-xs text-slate-500">{graph.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">{activeCount} active</span>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">{doneCount} done</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{graph.nodes.length} agents</span>
        </div>
      </div>

      <svg viewBox={"0 0 " + W + " " + H} className="h-[460px] w-full">
        <defs>
          <radialGradient id="mm-core" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="60%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#4338ca" />
          </radialGradient>
          <linearGradient id="mm-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#a5b4fc" />
            <stop offset="100%" stopColor="#f0abfc" />
          </linearGradient>
          <pattern id="mm-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0 L0 0 0 28" fill="none" stroke="rgba(99,102,241,0.07)" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width={W} height={H} fill="url(#mm-grid)" />

        {/* Spokes from the task core to each specialist */}
        {positioned.map((node) => {
          const active = node.state === "thinking" || node.state === "streaming";
          return (
            <line
              key={"spoke-" + node.id}
              x1={CX}
              y1={CY}
              x2={node.x}
              y2={node.y}
              stroke={active ? "#10b981" : "#cbd5e1"}
              strokeWidth={active ? 2.4 : 1.4}
              strokeDasharray={active ? "7 6" : "0"}
              strokeDashoffset={active ? -tick * 2 : 0}
              opacity={active ? 0.95 : 0.55}
            />
          );
        })}

        {/* Handoff edges between specialists */}
        {graph.edges.map((edge, i) => {
          const a = byId[edge.from];
          const b = byId[edge.to];
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2 - 42;
          return (
            <path
              key={"edge-" + i}
              d={"M " + a.x + " " + a.y + " Q " + mx + " " + my + " " + b.x + " " + b.y}
              fill="none"
              stroke="url(#mm-edge)"
              strokeWidth="2.6"
              strokeDasharray="9 7"
              strokeDashoffset={-tick * 3}
              opacity="0.75"
            />
          );
        })}

        {/* Task core */}
        <circle cx={CX} cy={CY} r={graph.running ? 46 + Math.sin(tick / 5) * 3 : 46} fill="url(#mm-core)" opacity="0.18" />
        <circle cx={CX} cy={CY} r="34" fill="url(#mm-core)" />
        <text x={CX} y={CY + 5} textAnchor="middle" className="fill-white" fontSize="15" fontWeight="700">
          TASK
        </text>

        {/* Specialist nodes */}
        {positioned.map((node) => {
          const style = STATE_STYLE[node.state];
          const active = node.state === "thinking" || node.state === "streaming";
          const pulse = active ? 3 + Math.sin(tick / 4) * 2.5 : 0;
          const seconds = node.endedAt
            ? Math.max(0, Math.round((node.endedAt - node.startedAt) / 100) / 10)
            : Math.max(0, Math.round((Date.now() - node.startedAt) / 100) / 10);

          return (
            <g key={node.id} className="cursor-default">
              {active && (
                <circle cx={node.x} cy={node.y} r={30 + pulse} fill={style.glow} opacity="0.5" />
              )}
              <circle
                cx={node.x}
                cy={node.y}
                r="26"
                fill={style.fill}
                stroke={style.ring}
                strokeWidth="3"
              />
              <text x={node.x} y={node.y + 7} textAnchor="middle" fontSize="20">
                {node.emoji || "\u{1F916}"}
              </text>

              <text
                x={node.x}
                y={node.y + 45}
                textAnchor="middle"
                fontSize="11.5"
                fontWeight="700"
                className="fill-slate-700"
              >
                {node.label.length > 22 ? node.label.slice(0, 21) + "\u2026" : node.label}
              </text>
              <text x={node.x} y={node.y + 60} textAnchor="middle" fontSize="10" className="fill-slate-500">
                {style.label}
                {node.model ? " \u00b7 " + node.model.split("/").pop() : ""}
              </text>
              <text x={node.x} y={node.y + 74} textAnchor="middle" fontSize="9.5" className="fill-slate-400">
                {seconds}s
              </text>
            </g>
          );
        })}
      </svg>

      {/* Step detail rail */}
      <div className="flex gap-2 overflow-x-auto border-t border-white/70 px-4 py-3">
        {graph.nodes.map((node) => {
          const style = STATE_STYLE[node.state];
          return (
            <div
              key={"rail-" + node.id}
              className="min-w-[190px] flex-1 rounded-2xl border border-white/80 bg-white/80 p-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              style={{ borderLeft: "4px solid " + style.ring }}
            >
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <span>{node.emoji || "\u{1F916}"}</span>
                <span className="truncate">{node.label}</span>
              </p>
              <p className="mt-1 text-[11px] font-semibold" style={{ color: style.ring }}>
                {style.label}
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{node.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
