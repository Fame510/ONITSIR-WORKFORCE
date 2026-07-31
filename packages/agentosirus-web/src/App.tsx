/**
 * App.tsx (unified) -- ported from agentosirus/src/App.tsx.
 *
 * SYNERGY #9 (Fix the "144 vs 163 vs 164" specialist-count drift): every
 * specialist-count string here is now sourced LIVE from `agents.length` /
 * `divisions.length` (which themselves come from GET /api/agents and
 * GET /api/divisions -- backed by the unified roster's live
 * `roster.category_counts()`), never a hardcoded "144". While the fetch is
 * in flight, an ellipsis is shown instead of guessing a fixed number.
 */
import { useState, useEffect } from "react";
import { Agent, Division } from "./types.ts";
import { AgentCard } from "./components/AgentCard.tsx";
import { AgentDetail } from "./components/AgentDetail.tsx";
import { AgentChat } from "./components/AgentChat.tsx";
import { TeamBuilder } from "./components/TeamBuilder.tsx";
import { MasterAgentHub } from "./components/MasterAgentHub.tsx";
import { Search, Info, RefreshCw, Layers, Users, BookOpen, Sparkles } from "lucide-react";

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"master" | "roster" | "team">("master");

  // Interaction States
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);

  // Custom Team Swarm State
  const [team, setTeam] = useState<Agent[]>([]);

  // Fetch agents and divisions on load
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [divResponse, agentsResponse] = await Promise.all([
        fetch("/api/divisions"),
        fetch("/api/agents"),
      ]);

      if (!divResponse.ok || !agentsResponse.ok) {
        throw new Error("Failed to load directories from fullstack server.");
      }

      const divData = await divResponse.json();
      const agentsData = await agentsResponse.json();

      setDivisions(divData);
      setAgents(agentsData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while loading agents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Sync detailed agent content when selected
  const fetchAgentContent = async (agent: Agent) => {
    try {
      const response = await fetch(`/api/agents/${agent.category}/${agent.id}`);
      if (response.ok) {
        const fullAgent = await response.json();
        setAgents((prev) =>
          prev.map((a) => (a.id === agent.id ? { ...a, content: fullAgent.content } : a))
        );
        // If currently viewing, update the selectedAgent state
        if (selectedAgent && selectedAgent.id === agent.id) {
          setSelectedAgent((prev) => prev ? { ...prev, content: fullAgent.content } : null);
        }
        if (chatAgent && chatAgent.id === agent.id) {
          setChatAgent((prev) => prev ? { ...prev, content: fullAgent.content } : null);
        }
      }
    } catch (err) {
      console.error("Error fetching agent details:", err);
    }
  };

  const handleSelectAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setChatAgent(null);
    if (!agent.content) {
      fetchAgentContent(agent);
    }
  };

  const handleChatAgent = (agent: Agent) => {
    setChatAgent(agent);
    setSelectedAgent(null);
    if (!agent.content) {
      fetchAgentContent(agent);
    }
  };

  const handleToggleTeam = (agent: Agent) => {
    setTeam((prev) => {
      const exists = prev.some((a) => a.id === agent.id);
      if (exists) {
        return prev.filter((a) => a.id !== agent.id);
      } else {
        return [...prev, agent];
      }
    });
  };

  const handleRemoveAgentFromTeam = (agent: Agent) => {
    setTeam((prev) => prev.filter((a) => a.id !== agent.id));
  };

  const handleLoadTeam = (loadedAgents: Agent[]) => {
    setTeam(loadedAgents);
    // Fetch content for loaded agents if they don't have it
    loadedAgents.forEach((a) => {
      if (!a.content) {
        fetchAgentContent(a);
      }
    });
  };

  // Grid/Filtered Search List
  const filteredAgents = agents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDivision = selectedDivision ? agent.category === selectedDivision : true;

    return matchesSearch && matchesDivision;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col hologram-grid relative overflow-hidden">
      {/* Visual Identity Header Block */}
      <header className="bg-slate-950/85 backdrop-blur-md text-white border-b border-cyan-500/20 relative overflow-hidden shadow-[0_0_20px_rgba(0,243,255,0.08)]">
        {/* Abstract background decorative blobs */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-60 h-60 bg-amber-500/3 rounded-full blur-2xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 py-8 relative">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full font-mono">
                  {`\u{1F6E1}\uFE0F STARK OPERATIONS DIVISION: ${agents.length || "..."} COGNITIVE SPECIALISTS`}
                </span>
                <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f3ff]" />
              </div>
              <h1 className="font-display font-bold text-2xl md:text-3xl tracking-wider text-white flex items-center gap-2 uppercase glow-text-cyan">
                The Agency<span className="text-cyan-400 font-medium">// Tactical Roster</span>
              </h1>
              <p className="text-xs md:text-sm text-slate-400 mt-1.5 max-w-2xl font-mono leading-relaxed uppercase">
                Synchronized with Tony Stark's personal specialist network. Test integrations in our cockpit or compile multi-node team swarm blueprints.
              </p>
            </div>

            {/* Quick Stats Panel */}
            <div className="flex items-center gap-4 self-start md:self-auto bg-slate-900/90 border border-cyan-500/20 shadow-[0_0_15px_rgba(0,243,255,0.05)] p-3.5 rounded-xl">
              <div className="text-center px-3 border-r border-slate-800">
                <div className="font-display font-extrabold text-lg text-cyan-400 glow-text-cyan">{agents.length || "\u2026"}</div>
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">NODES ONLINE</div>
              </div>
              <div className="text-center px-3 border-r border-slate-800">
                <div className="font-display font-extrabold text-lg text-cyan-400 glow-text-cyan">{divisions.length || "\u2026"}</div>
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">DIVISIONS</div>
              </div>
              <div className="text-center px-3">
                <div className="font-display font-extrabold text-lg text-amber-400 glow-text-orange">{team.length}</div>
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">MY SWARM</div>
              </div>
            </div>
          </div>
        </div>

        {/* Global Nav Tabs */}
        <div className="max-w-7xl mx-auto px-6 border-t border-slate-900">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setActiveTab("master");
                setSelectedAgent(null);
                setChatAgent(null);
              }}
              className={`flex items-center gap-2 py-4 px-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-all font-mono ${
                activeTab === "master" && !selectedAgent && !chatAgent
                  ? "border-cyan-400 text-cyan-400 glow-text-cyan"
                  : "border-transparent text-slate-500 hover:text-cyan-400"
              }`}
            >
              <Sparkles size={14} />
              <span>Master AI Hub</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("roster");
                setSelectedAgent(null);
                setChatAgent(null);
              }}
              className={`flex items-center gap-2 py-4 px-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-all font-mono ${
                activeTab === "roster" && !selectedAgent && !chatAgent
                  ? "border-cyan-400 text-cyan-400 glow-text-cyan"
                  : "border-transparent text-slate-500 hover:text-cyan-400"
              }`}
            >
              <BookOpen size={14} />
              <span>Specialists Roster</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("team");
                setSelectedAgent(null);
                setChatAgent(null);
              }}
              className={`flex items-center gap-2 py-4 px-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-all font-mono ${
                activeTab === "team" && !selectedAgent && !chatAgent
                  ? "border-cyan-400 text-cyan-400 glow-text-cyan"
                  : "border-transparent text-slate-500 hover:text-cyan-400"
              }`}
            >
              <Users size={14} />
              <span>My Swarm</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body Layout */}
      <main className="max-w-7xl w-full mx-auto px-6 py-8 flex-1 flex flex-col">
        {/* Dynamic Warning if Key Missing */}
        {!loading && !error && !import.meta.env.VITE_GEMINI_API_KEY && (
          <div className="mb-6 p-4 bg-amber-950/30 border border-amber-500/20 text-amber-300 rounded-xl flex items-start gap-3 shadow-md">
            <Info className="text-amber-400 flex-shrink-0 mt-0.5 animate-pulse" size={18} />
            <div className="flex-1">
              <div className="font-bold text-xs uppercase tracking-widest font-mono">STARK TIP: UNLOCK LIVE COGNITIVE CONVERSATION</div>
              <p className="text-xs mt-1 leading-relaxed text-slate-400 font-mono uppercase">
                To converse with the specialists live using Gemini, set <code>VITE_GEMINI_API_KEY</code> in your environment, or add a provider key under the <strong>Settings (Key Icon)</strong> panel. The directory explorer, prompt copying, and team builder remain fully active!
              </p>
            </div>
          </div>
        )}

        {/* Global Loading State */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center py-24 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mb-4 shadow-[0_0_15px_rgba(0,243,255,0.4)]" />
            <h3 className="font-display font-bold text-cyan-400 uppercase tracking-widest glow-text-cyan">SCANNING WORKSPACE INFRASTRUCTURE...</h3>
            <p className="text-xs font-mono text-slate-500 mt-1 uppercase">Indexing active directories and compiling agent metadata.</p>
          </div>
        )}

        {/* Global Server Connection Error Fallback */}
        {error && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto bg-slate-900/60 p-8 border border-red-500/20 rounded-2xl shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-red-950 border border-red-500/30 flex items-center justify-center text-red-400 mb-4 text-2xl animate-pulse">
              ⚠️
            </div>
            <h3 className="font-display font-bold text-red-400 uppercase tracking-widest">COGNITIVE SYNAPSE ERROR</h3>
            <p className="text-xs font-mono text-slate-400 mt-2 mb-6 leading-relaxed uppercase">
              Could not communicate with our fullstack Express server to compile the files. Let's trigger a rebuild or retry!
            </p>
            <button
              onClick={fetchData}
              className="flex items-center gap-1.5 py-2.5 px-6 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-400/50 text-cyan-400 font-mono font-bold text-xs tracking-widest uppercase transition-all shadow-[0_0_15px_rgba(0,243,255,0.15)]"
            >
              <RefreshCw size={14} />
              <span>Retry Scan</span>
            </button>
          </div>
        )}

        {/* Dynamic Route Switching */}
        {!loading && !error && (
          <div className="flex-1 flex flex-col">
            {/* 1. AGENT DETAIL VIEW */}
            {selectedAgent && (
              <AgentDetail
                agent={selectedAgent}
                categoryEmoji={divisions.find((d) => d.id === selectedAgent.category)?.emoji || "📁"}
                categoryName={divisions.find((d) => d.id === selectedAgent.category)?.name || "Division"}
                onBack={() => setSelectedAgent(null)}
                onChat={() => handleChatAgent(selectedAgent)}
              />
            )}

            {/* 2. LIVE CHAT PLAYGROUND */}
            {chatAgent && (
              <div className="max-w-4xl mx-auto w-full">
                <button
                  onClick={() => {
                    setChatAgent(null);
                    // Open the detail view of that agent
                    setSelectedAgent(chatAgent);
                  }}
                  className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold font-mono uppercase tracking-widest text-cyan-400 hover:text-cyan-300 bg-slate-900/80 hover:bg-slate-900 py-2 px-4 rounded-xl border border-cyan-500/20 shadow-lg"
                >
                  &larr; Back to {chatAgent.name} Details
                </button>
                <AgentChat agent={chatAgent} onBack={() => setChatAgent(null)} />
              </div>
            )}

            {/* 3. MASTER COORDINATOR HUB */}
            {activeTab === "master" && !selectedAgent && !chatAgent && (
              <MasterAgentHub />
            )}

            {/* 4. ROSTER GRID TAB */}
            {activeTab === "roster" && !selectedAgent && !chatAgent && (
              <div className="flex flex-col gap-6">
                {/* Search / Filters Section */}
                <div className="bg-slate-900/80 border border-cyan-500/20 p-5 rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-xl">
                  {/* Search input */}
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-400" size={16} />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={`Search ${agents.length || "all"} agents by specialty, name, or keywords...`}
                      className="w-full bg-slate-950 text-cyan-400 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm font-mono placeholder:text-slate-600 focus:outline-hidden focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500/20 resize-none"
                    />
                  </div>

                  {/* Division / Folders filter */}
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-bold uppercase tracking-wider font-mono">
                    <Layers size={14} className="text-cyan-400" />
                    <span>Filter:</span>
                    <select
                      value={selectedDivision || ""}
                      onChange={(e) => setSelectedDivision(e.target.value || null)}
                      className="bg-slate-950 border border-slate-800 text-cyan-400 rounded-lg px-3 py-1.5 focus:outline-hidden focus:border-cyan-400 transition-all text-xs font-bold cursor-pointer"
                    >
                      <option value="">All {divisions.length} Divisions</option>
                      {divisions.map((div) => (
                        <option key={div.id} value={div.id}>
                          {div.emoji} {div.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Main grid wrapper */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold uppercase tracking-wider mb-4 font-mono pl-1">
                    <span>Matches:</span>
                    <span className="text-cyan-400 glow-text-cyan">{filteredAgents.length} Agents Found</span>
                  </div>

                  {filteredAgents.length === 0 ? (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl py-16 text-center shadow-lg">
                      <div className="text-4xl mb-3">🔍</div>
                      <h3 className="font-display font-bold text-slate-200 uppercase tracking-widest">NO COGNITIVE NODES FOUND</h3>
                      <p className="text-xs font-mono text-slate-500 max-w-sm mx-auto mt-2 leading-relaxed uppercase">
                        We couldn't find any specialist matching your current search parameters. Try clearing your filters or testing another query!
                      </p>
                      <button
                        onClick={() => {
                          setSearchTerm("");
                          setSelectedDivision(null);
                        }}
                        className="mt-4 text-xs font-bold font-mono tracking-widest text-cyan-400 hover:text-cyan-300 underline uppercase"
                      >
                        Reset All Filters
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredAgents.map((agent) => {
                        const div = divisions.find((d) => d.id === agent.category);
                        return (
                          <AgentCard
                            key={agent.id}
                            agent={agent}
                            categoryEmoji={div?.emoji || "📁"}
                            categoryName={div?.name || "Division"}
                            onSelect={handleSelectAgent}
                            onChat={handleChatAgent}
                            isInTeam={team.some((t) => t.id === agent.id)}
                            onToggleTeam={handleToggleTeam}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. TEAM BUILDER / SWARM TAB */}
            {activeTab === "team" && !selectedAgent && !chatAgent && (
              <TeamBuilder
                team={team}
                allAgents={agents}
                onRemoveAgent={handleRemoveAgentFromTeam}
                onSelectAgent={handleSelectAgent}
                onChatAgent={handleChatAgent}
                onLoadTeam={handleLoadTeam}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer Block */}
      <footer className="bg-slate-950/95 border-t border-slate-900 text-slate-600 text-[10px] py-6 mt-12 font-mono uppercase tracking-widest">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 font-bold font-display animate-pulse">&bull;</span>
            <span>STARK SYSTEM OPERATIONAL DIRECTORY</span>
          </div>
          <div className="text-slate-500">
            Open-source and fully compiled in AI Studio Build.
          </div>
        </div>
      </footer>
    </div>
  );
}
