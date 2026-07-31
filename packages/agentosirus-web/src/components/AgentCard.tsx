import { Agent } from "../types.ts";
import { MessageSquare, Eye, Plus, Check } from "lucide-react";

export function getColorClasses(color: string) {
  const map: Record<string, { bg: string; text: string; border: string; accent: string; ring: string }> = {
    sky: { bg: "bg-sky-950/40", text: "text-sky-400 glow-text-sky", border: "border-sky-500/30", accent: "bg-sky-400", ring: "focus:ring-sky-500" },
    pink: { bg: "bg-pink-950/40", text: "text-pink-400 glow-text-pink", border: "border-pink-500/30", accent: "bg-pink-400", ring: "focus:ring-pink-500" },
    emerald: { bg: "bg-emerald-950/40", text: "text-emerald-400 glow-text-emerald", border: "border-emerald-500/30", accent: "bg-emerald-400", ring: "focus:ring-emerald-500" },
    indigo: { bg: "bg-indigo-950/40", text: "text-indigo-400 glow-text-indigo", border: "border-indigo-500/30", accent: "bg-indigo-400", ring: "focus:ring-indigo-500" },
    orange: { bg: "bg-orange-950/40", text: "text-orange-400 glow-text-orange", border: "border-orange-500/30", accent: "bg-orange-400", ring: "focus:ring-orange-500" },
    purple: { bg: "bg-purple-950/40", text: "text-purple-400 glow-text-purple", border: "border-purple-500/30", accent: "bg-purple-400", ring: "focus:ring-purple-500" },
    cyan: { bg: "bg-cyan-950/40", text: "text-cyan-400 glow-text-cyan", border: "border-cyan-500/30", accent: "bg-cyan-400", ring: "focus:ring-cyan-500" },
    red: { bg: "bg-red-950/40", text: "text-red-400 glow-text-red", border: "border-red-500/30", accent: "bg-red-400", ring: "focus:ring-red-500" },
    teal: { bg: "bg-teal-950/40", text: "text-teal-400 glow-text-teal", border: "border-teal-500/30", accent: "bg-teal-400", ring: "focus:ring-teal-500" },
    violet: { bg: "bg-violet-950/40", text: "text-violet-400 glow-text-violet", border: "border-violet-500/30", accent: "bg-violet-400", ring: "focus:ring-violet-500" },
    yellow: { bg: "bg-yellow-950/40", text: "text-yellow-400 glow-text-yellow", border: "border-yellow-500/30", accent: "bg-yellow-400", ring: "focus:ring-yellow-500" },
    rose: { bg: "bg-rose-950/40", text: "text-rose-400 glow-text-rose", border: "border-rose-500/30", accent: "bg-rose-400", ring: "focus:ring-rose-500" },
  };
  return map[color] || { bg: "bg-slate-900/40", text: "text-slate-400", border: "border-slate-800", accent: "bg-slate-400", ring: "focus:ring-slate-500" };
}

interface AgentCardProps {
  agent: Agent;
  categoryEmoji: string;
  categoryName: string;
  onSelect: (agent: Agent) => void;
  onChat: (agent: Agent) => void;
  isInTeam: boolean;
  onToggleTeam: (agent: Agent) => void;
}

export function AgentCard({
  agent,
  categoryEmoji,
  categoryName,
  onSelect,
  onChat,
  isInTeam,
  onToggleTeam,
}: AgentCardProps) {
  const colors = getColorClasses(agent.color);

  return (
    <div
      id={`agent-card-${agent.id}`}
      className="flex flex-col h-full bg-slate-900/80 rounded-2xl border border-cyan-500/20 hover:border-cyan-400/50 shadow-lg hover:shadow-[0_0_20px_rgba(0,243,255,0.15)] transition-all duration-300 overflow-hidden group relative"
    >
      {/* Glow ribbon at the top */}
      <div className={`h-1 w-full opacity-60 group-hover:opacity-100 transition-opacity duration-300 ${colors.accent}`} />

      {/* Card Body */}
      <div className="p-5 flex-1 flex flex-col">
        {/* Category & Badge */}
        <div className="flex items-center justify-between mb-3 text-[11px] font-mono">
          <span className="flex items-center gap-1.5 text-slate-400 font-medium">
            <span>{categoryEmoji}</span>
            <span className="uppercase tracking-widest text-[10px]">{categoryName}</span>
          </span>
          {agent.vibe && (
            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold tracking-widest uppercase ${colors.bg} ${colors.text} border ${colors.border}`}>
              SYNCED
            </span>
          )}
        </div>

        {/* Identity Row */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-2xl shadow-inner group-hover:scale-105 transition-transform duration-200">
            {agent.emoji || "🤖"}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-slate-100 group-hover:text-cyan-400 transition-colors line-clamp-1 text-sm md:text-base uppercase tracking-wider">
              {agent.name}
            </h3>
            <p className="text-[10px] font-mono text-cyan-500/60 mt-0.5 uppercase">
              // UNIT-{agent.id}
            </p>
          </div>
        </div>

        {/* Vibe Phrase (Personality signature) */}
        {agent.vibe && (
          <p className="text-[11px] font-medium text-slate-400 italic mb-3 line-clamp-1 border-l border-cyan-500/40 pl-2">
            "{agent.vibe}"
          </p>
        )}

        {/* Description */}
        <p className="text-xs text-slate-400 line-clamp-2 mb-4 flex-1 leading-relaxed">
          {agent.description}
        </p>

        {/* Action Tray */}
        <div className="flex items-center gap-2 pt-3 border-t border-slate-800">
          <button
            onClick={() => onChat(agent)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-400/30 hover:border-cyan-400/60 text-cyan-400 font-mono text-[10px] font-bold uppercase tracking-wider transition-all"
            title="Start Chat with Agent"
          >
            <MessageSquare size={13} />
            <span>Chat</span>
          </button>

          <button
            onClick={() => onSelect(agent)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 font-mono text-[10px] font-bold uppercase tracking-wider transition-all"
            title="View Details & Prompt"
          >
            <Eye size={13} />
            <span>Prompt</span>
          </button>

          <button
            onClick={() => onToggleTeam(agent)}
            className={`p-2 rounded-xl border transition-all duration-200 ${
              isInTeam
                ? "bg-amber-950/40 text-amber-400 border-amber-500/40 hover:bg-amber-900/40 shadow-[0_0_10px_rgba(245,158,11,0.2)] animate-pulse"
                : "bg-slate-950 text-slate-600 border-slate-800 hover:text-slate-400 hover:bg-slate-900"
            }`}
            title={isInTeam ? "Remove from Team" : "Add to Team"}
          >
            {isInTeam ? <Check size={13} /> : <Plus size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}
