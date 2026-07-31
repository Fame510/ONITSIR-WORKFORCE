/**
 * TeamBuilder.tsx (unified) -- ported from agentosirus/src/components/TeamBuilder.tsx.
 *
 * SYNERGY #8 (Surface ONITSIR's crew/confidence scoring directly in
 * agentosirus's TeamBuilder UI): adds a free-text "Suggest a team" goal box
 * that calls onitsir-core's Router.route() via POST /api/router/route
 * (onitsirClient.ts::suggestTeam()), giving users a data-driven,
 * confidence-scored crew suggestion (high/medium/low, per
 * Assignment.confidence) for ARBITRARY goals -- not just the 4 preset
 * scenarios hardcoded below.
 */
import { useState } from "react";
import { Agent, TeamScenario } from "../types.ts";
import { Trash2, Users, Clipboard, Check, Play, Sparkles, Download, HelpCircle, Wand2, Loader2 } from "lucide-react";
import { suggestTeam, getBackendUrl } from "../lib/onitsirClient";

interface TeamBuilderProps {
  team: Agent[];
  allAgents: Agent[];
  onRemoveAgent: (agent: Agent) => void;
  onSelectAgent: (agent: Agent) => void;
  onChatAgent: (agent: Agent) => void;
  onLoadTeam: (agents: Agent[]) => void;
}

export function TeamBuilder({
  team,
  allAgents,
  onRemoveAgent,
  onSelectAgent,
  onChatAgent,
  onLoadTeam,
}: TeamBuilderProps) {
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // SYNERGY #8: free-text goal -> Router.route() confidence-scored crew.
  const [suggestGoal, setSuggestGoal] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<
    { id: string; name: string; category: string; description: string; score: number; confidence: "high" | "medium" | "low" }[]
  >([]);

  const handleSuggestTeam = async () => {
    if (!suggestGoal.trim()) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      const result = await suggestTeam(suggestGoal, 5);
      setSuggestions(result);
    } catch (err) {
      setSuggestError((err as Error).message || "Could not reach the ONITSIR router.");
    } finally {
      setSuggesting(false);
    }
  };

  const handleLoadSuggestions = () => {
    const selected: Agent[] = [];
    suggestions.forEach((s) => {
      const match = allAgents.find((a) => a.id === s.id);
      if (match) selected.push(match);
    });
    onLoadTeam(selected);
  };

  const confidenceColor = (c: "high" | "medium" | "low") =>
    c === "high" ? "text-emerald-400 border-emerald-500/30 bg-emerald-950/30" : c === "medium" ? "text-amber-400 border-amber-500/30 bg-amber-950/30" : "text-slate-400 border-slate-700 bg-slate-900";

  // Suggested team scenarios matching README.md exactly
  const scenarios: TeamScenario[] = [
    {
      id: "startup-mvp",
      name: "🚀 Building a Startup MVP",
      description: "Fast-track your validation, product prototyping, and implementation.",
      recommendedAgents: [
        "engineering-frontend-developer",
        "engineering-backend-architect",
        "marketing-growth-hacker",
        "engineering-rapid-prototyper",
        "testing-reality-checker",
      ],
    },
    {
      id: "marketing-campaign",
      name: "📢 Marketing Campaign Launch",
      description: "Coordinated social campaign with deep platform-specific specialties.",
      recommendedAgents: [
        "marketing-content-creator",
        "marketing-twitter-engager",
        "marketing-instagram-curator",
        "marketing-reddit-community-builder",
        "support-analytics-reporter",
      ],
    },
    {
      id: "enterprise-feature",
      name: "🏢 Enterprise Feature Delivery",
      description: "Secure, reliable features with quality gates and strict process.",
      recommendedAgents: [
        "project-management-project-manager-senior",
        "engineering-engineering-senior-developer",
        "design-design-ui-designer",
        "project-management-project-management-experiment-tracker",
        "testing-testing-evidence-collector",
        "testing-testing-reality-checker",
      ],
    },
    {
      id: "paid-media-takeover",
      name: "💰 Paid Media Account Takeover",
      description: "Audit tracking, eliminate query waste, optimize bidding and creative.",
      recommendedAgents: [
        "paid-media-paid-media-auditor",
        "paid-media-paid-media-tracking-specialist",
        "paid-media-paid-media-ppc-strategist",
        "paid-media-paid-media-search-query-analyst",
        "paid-media-paid-media-creative-strategist",
      ],
    },
  ];

  const handleLoadScenario = (scenario: TeamScenario) => {
    const selected: Agent[] = [];
    scenario.recommendedAgents.forEach((slug) => {
      const match = allAgents.find((a) => a.id === slug);
      if (match) selected.push(match);
    });
    onLoadTeam(selected);
  };

  // Compile a unified team prompt
  const generateTeamOrchestratorPrompt = (): string => {
    if (team.length === 0) return "";
    let prompt = `# Multi-Agent Team Orchestration\n\n`;
    prompt += `You are an AI swarm consisting of the following specialized team members working in parallel. Under each task, delegates answer in their distinct voices and conform to their strict guidelines.\n\n`;
    prompt += `## Active Team Roster:\n\n`;
    
    team.forEach((agent) => {
      prompt += `### 🎭 Agent: ${agent.name} (Slug: @${agent.id})\n`;
      prompt += `- **Core Mission**: ${agent.description}\n`;
      if (agent.vibe) {
        prompt += `- **Personality Vibe**: ${agent.vibe}\n`;
      }
      prompt += `\n`;
    });

    prompt += `## Instructions for execution:\n`;
    prompt += `When given an objective, outline how the team will tackle it. Different agents should provide direct, concrete technical deliverables (such as complete code snippets, strategy drafts, audit logs) from their perspective. Ensure each section is clearly signed by the respective agent (e.g. "**Frontend Developer**: [Response]").\n`;
    return prompt;
  };

  const handleCopyUnifiedPrompt = () => {
    const prompt = generateTeamOrchestratorPrompt();
    if (prompt) {
      navigator.clipboard.writeText(prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const handleDownloadConfig = () => {
    const configData = {
      teamName: "Custom AI Specialist Swarm",
      exportedAt: new Date().toISOString(),
      agents: team.map((a) => ({
        id: a.id,
        name: a.name,
        category: a.category,
        emoji: a.emoji,
      })),
      masterPrompt: generateTeamOrchestratorPrompt(),
    };

    const element = document.createElement("a");
    const file = new Blob([JSON.stringify(configData, null, 2)], {
      type: "application/json",
    });
    element.href = URL.createObjectURL(file);
    element.download = "agency-team-config.json";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div id="team-builder-panel" className="grid grid-cols-1 lg:grid-cols-3 gap-8 font-sans text-slate-200">
      {/* Left Columns: Scenarios Templates */}
      <div className="lg:col-span-1 flex flex-col gap-5">
        <div className="bg-slate-900/80 p-6 rounded-2xl border border-cyan-500/20 shadow-xl">
          <div className="flex items-center gap-1.5 mb-4 text-cyan-400 font-bold text-xs uppercase tracking-widest font-mono">
            <Sparkles size={14} className="animate-pulse" />
            <span>Preset Specialist Teams</span>
          </div>
          <h2 className="font-display font-bold text-base text-slate-100 uppercase tracking-wider mb-2">
            Load Swarm Templates
          </h2>
          <p className="text-xs text-slate-400 font-mono uppercase mb-6 leading-relaxed">
            Instantly deploy coordinated teams of battle-tested specialists to handle complex workflows and deliverables.
          </p>

          <div className="flex flex-col gap-4">
            {scenarios.map((sc) => (
              <div
                key={sc.id}
                className="p-4 bg-slate-950/60 hover:bg-cyan-950/20 border border-slate-800/80 hover:border-cyan-500/30 rounded-xl transition-all flex flex-col justify-between group cursor-pointer"
                onClick={() => handleLoadScenario(sc)}
              >
                <div>
                  <h3 className="font-display font-bold text-xs text-slate-200 uppercase tracking-wider group-hover:text-cyan-400 transition-colors">
                    {sc.name}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1 mb-3 leading-relaxed uppercase font-mono">
                    {sc.description}
                  </p>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div className="flex -space-x-1.5 overflow-hidden">
                    {sc.recommendedAgents.map((slug) => {
                      const match = allAgents.find((a) => a.id === slug);
                      return match ? (
                        <div
                          key={slug}
                          className="inline-block h-6 w-6 rounded-full ring-2 ring-slate-950 bg-slate-900 border border-slate-800 text-xs flex items-center justify-center"
                          title={match.name}
                        >
                          {match.emoji}
                        </div>
                      ) : null;
                    })}
                  </div>
                  <button
                    className="flex items-center gap-1 py-1 px-2.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-400/40 text-cyan-400 text-[10px] font-bold font-mono tracking-widest uppercase transition-all"
                  >
                    <Play size={10} fill="currentColor" />
                    <span>LOAD</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SYNERGY #8: free-text "Suggest a team" box, calling ONITSIR's
            Router.route() for a confidence-scored crew on ANY goal, not
            just the 4 presets above. */}
        <div className="bg-slate-900/80 p-6 rounded-2xl border border-indigo-500/20 shadow-xl">
          <div className="flex items-center gap-1.5 mb-4 text-indigo-400 font-bold text-xs uppercase tracking-widest font-mono">
            <Wand2 size={14} />
            <span>ONITSIR Router: Suggest a Team</span>
          </div>
          <p className="text-xs text-slate-400 font-mono uppercase mb-4 leading-relaxed">
            Describe any goal. The deterministic Router scores the full roster and returns a confidence-ranked crew.
          </p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={suggestGoal}
              onChange={(e) => setSuggestGoal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSuggestTeam()}
              placeholder="e.g. launch a mobile game on iOS and Android"
              className="flex-1 bg-slate-950 text-indigo-300 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono placeholder:text-slate-600 focus:outline-hidden focus:border-indigo-400"
              disabled={!getBackendUrl()}
            />
            <button
              onClick={handleSuggestTeam}
              disabled={suggesting || !getBackendUrl() || !suggestGoal.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-2 text-xs font-bold uppercase text-white"
            >
              {suggesting ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              Suggest
            </button>
          </div>
          {!getBackendUrl() && (
            <p className="text-[10px] text-amber-500/80 font-mono uppercase">Connect an ONITSIR backend in Settings to enable live routing.</p>
          )}
          {suggestError && <p className="text-[10px] text-red-400 font-mono">{suggestError}</p>}
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {suggestions.map((s) => (
                <div key={s.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-mono ${confidenceColor(s.confidence)}`}>
                  <div>
                    <span className="font-bold">{s.name}</span>
                    <span className="ml-2 text-[10px] opacity-70">{s.category}</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase">{s.confidence} ({s.score})</span>
                </div>
              ))}
              <button
                onClick={handleLoadSuggestions}
                className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/30 py-2 text-xs font-bold uppercase text-indigo-300"
              >
                <Play size={12} fill="currentColor" /> Load suggested crew
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Active Team Swarm */}
      <div className="lg:col-span-2 flex flex-col gap-5">
        <div className="bg-slate-900/80 p-6 rounded-2xl border border-cyan-500/20 shadow-xl flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 text-cyan-400 flex items-center justify-center">
                <Users size={20} />
              </div>
              <div>
                <h2 className="font-display font-bold text-slate-100 uppercase tracking-wider">
                  Your Custom Swarm
                </h2>
                <p className="text-[10px] text-cyan-500/60 font-mono mt-0.5 uppercase tracking-widest">
                  // {team.length} {team.length === 1 ? "Specialist" : "Specialists"} deployed
                </p>
              </div>
            </div>

            {team.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyUnifiedPrompt}
                  className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-400/50 text-cyan-400 font-mono text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  {copiedPrompt ? (
                    <>
                      <Check size={14} className="text-emerald-400" />
                      <span className="text-emerald-400">Prompt Copied</span>
                    </>
                  ) : (
                    <>
                      <Clipboard size={14} />
                      <span>Copy Team Prompt</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownloadConfig}
                  className="p-1.5 rounded-xl border border-slate-800 text-slate-400 bg-slate-950 hover:bg-slate-900"
                  title="Download Team Configuration"
                >
                  <Download size={14} />
                </button>
              </div>
            )}
          </div>

          {team.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center text-2xl text-slate-500 mb-4 animate-pulse">
                👥
              </div>
              <h3 className="font-display font-bold text-slate-300 uppercase tracking-widest mb-1">
                Swarm is currently empty
              </h3>
              <p className="text-xs font-mono text-slate-500 max-w-sm mb-6 uppercase leading-relaxed">
                Add agents to your custom swarm by browsing the roster grid and clicking the plus icon on their cards, or load a preset template from the side panel!
              </p>
              <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 font-bold font-mono bg-cyan-950/40 py-1.5 px-3 rounded-full border border-cyan-500/30">
                <HelpCircle size={14} />
                <span>Need 3-5 agents for cross-checks</span>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {team.map((agent) => (
                  <div
                    key={agent.id}
                    className="p-3 border border-slate-800 rounded-xl hover:border-cyan-500/30 transition-all flex items-center justify-between group bg-slate-950/60"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xl shadow-inner">
                        {agent.emoji}
                      </div>
                      <div className="text-left">
                        <h4
                          onClick={() => onSelectAgent(agent)}
                          className="font-display font-bold text-xs text-slate-200 hover:text-cyan-400 transition-colors cursor-pointer uppercase tracking-wider"
                        >
                          {agent.name}
                        </h4>
                        <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">
                          // UNIT-{agent.id}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onChatAgent(agent)}
                        className="py-1 px-2.5 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-400/40 text-cyan-400 text-[10px] font-bold font-mono uppercase tracking-widest transition-all"
                      >
                        Chat
                      </button>
                      <button
                        onClick={() => onRemoveAgent(agent)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-all"
                        title="Dismiss Specialist"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Master Prompt Display Preview */}
              <div className="bg-slate-950 text-slate-100 p-5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between text-[10px] font-bold text-cyan-400 uppercase tracking-widest font-mono mb-2">
                  <span>🚀 Unified Team Orchestrator Prompt Preview</span>
                  <span>({team.length} agents combined)</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed uppercase mb-4 font-mono">
                  Copy this combined system directive and paste it into any agentic platform (like Cursor, Aider, Claude Code, or Gemini CLI) to configure a cohesive, multi-specialist cooperative session!
                </p>
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800/80 font-mono text-[10px] text-slate-300 max-h-36 overflow-y-auto leading-normal">
                  <pre>{generateTeamOrchestratorPrompt()}</pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
