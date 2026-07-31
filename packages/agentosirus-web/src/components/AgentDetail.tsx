import { useState } from "react";
import { Agent } from "../types.ts";
import { ArrowLeft, Copy, Check, Download, BookOpen, Terminal, Code } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface AgentDetailProps {
  agent: Agent;
  categoryEmoji: string;
  categoryName: string;
  onBack: () => void;
  onChat: () => void;
}

export function AgentDetail({ agent, categoryEmoji, categoryName, onBack, onChat }: AgentDetailProps) {
  const [activeTab, setActiveTab] = useState<"doc" | "prompt">("doc");
  const [copied, setCopied] = useState(false);

  const handleCopyPrompt = () => {
    if (agent.content) {
      navigator.clipboard.writeText(agent.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!agent.content) return;
    const element = document.createElement("a");
    const file = new Blob([agent.content], { type: "text/markdown;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `${agent.id}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div id={`agent-detail-${agent.id}`} className="bg-slate-900/90 border border-cyan-500/20 shadow-2xl rounded-2xl overflow-hidden animate-fade-in text-slate-200">
      {/* Header Splash */}
      <div className="p-8 bg-slate-950 border-b border-slate-800/80 relative">
        <button
          onClick={onBack}
          className="absolute top-6 left-6 flex items-center gap-1.5 text-xs font-bold font-mono uppercase tracking-widest text-cyan-400 hover:text-cyan-300 bg-slate-900 border border-cyan-500/20 py-2 px-4 rounded-xl transition-all shadow-md"
        >
          <ArrowLeft size={14} />
          <span>Back to Grid</span>
        </button>

        <div className="flex flex-col items-center text-center mt-8">
          <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-4xl shadow-inner mb-4">
            {agent.emoji || "🤖"}
          </div>
          
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 font-mono">
              {categoryEmoji} {categoryName}
            </span>
          </div>

          <h1 className="font-display font-bold text-2xl md:text-3xl text-slate-100 uppercase tracking-wider glow-text-cyan">
            {agent.name}
          </h1>
          <p className="font-mono text-xs text-cyan-500/70 mt-1 uppercase tracking-widest">// UNIT-{agent.id}</p>

          {agent.vibe && (
            <p className="max-w-xl text-xs md:text-sm font-medium text-slate-400 italic mt-4 border-l border-cyan-500/40 pl-3 leading-relaxed">
              "{agent.vibe}"
            </p>
          )}

          <p className="max-w-2xl text-slate-400 mt-3 text-xs md:text-sm leading-relaxed uppercase font-mono text-[11px]">
            {agent.description}
          </p>

          <div className="flex items-center gap-3 mt-8">
            <button
              onClick={onChat}
              className="flex items-center gap-1.5 py-2.5 px-6 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-400/50 text-cyan-400 font-mono font-bold text-xs tracking-widest uppercase transition-all shadow-[0_0_15px_rgba(0,243,255,0.15)]"
            >
              <Terminal size={15} />
              <span>Deploy to Chat</span>
            </button>

            <button
              onClick={handleCopyPrompt}
              className="flex items-center gap-1.5 py-2.5 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-mono font-bold text-xs tracking-widest uppercase transition-all"
            >
              {copied ? (
                <>
                  <Check size={15} className="text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={15} />
                  <span>Copy Prompt</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownload}
              className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-all"
              title="Download Agent MD File"
            >
              <Download size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-slate-800/80 bg-slate-950 px-6">
        <button
          onClick={() => setActiveTab("doc")}
          className={`flex items-center gap-2 py-4 px-4 font-bold font-mono uppercase tracking-widest text-xs border-b-2 transition-all ${
            activeTab === "doc"
              ? "border-cyan-400 text-cyan-400 glow-text-cyan"
              : "border-transparent text-slate-500 hover:text-cyan-400"
          }`}
        >
          <BookOpen size={14} />
          <span>Interactive Preview</span>
        </button>

        <button
          onClick={() => setActiveTab("prompt")}
          className={`flex items-center gap-2 py-4 px-4 font-bold font-mono uppercase tracking-widest text-xs border-b-2 transition-all ${
            activeTab === "prompt"
              ? "border-cyan-400 text-cyan-400 glow-text-cyan"
              : "border-transparent text-slate-500 hover:text-cyan-400"
          }`}
        >
          <Code size={14} />
          <span>Raw Markdown Source</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div className="p-8">
        {activeTab === "doc" ? (
          <div className="max-w-4xl mx-auto">
            {agent.content ? (
              <div className="markdown-body text-slate-300">
                <ReactMarkdown>{agent.content}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex flex-col items-center py-12 text-cyan-400">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mb-4 shadow-[0_0_15px_#00f3ff]"></div>
                <span className="font-mono text-xs uppercase tracking-widest animate-pulse">Syncing agent core files...</span>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-4 bg-slate-950 text-slate-500 text-[10px] py-2.5 px-4 rounded-t-xl font-mono uppercase border border-slate-800 border-b-0 tracking-widest">
              <span>{agent.id}.md</span>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-1 hover:text-cyan-400 transition-colors"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                <span>{copied ? "Copied" : "Copy Raw"}</span>
              </button>
            </div>
            <pre className="bg-slate-950 text-slate-300 p-6 rounded-b-xl overflow-auto text-xs font-mono max-h-[600px] leading-relaxed border border-slate-800">
              <code>{agent.content || "# No content synced."}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
