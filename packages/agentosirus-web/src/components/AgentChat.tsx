import { useState, useRef, useEffect } from "react";
import { Agent, Message } from "../types.ts";
import { Send, ArrowLeft, RefreshCw, AlertTriangle, ShieldAlert, Sparkles, Terminal, Volume2, VolumeX, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { LiveSandbox } from "./LiveSandbox.tsx";

interface AgentChatProps {
  agent: Agent;
  onBack: () => void;
}

export function AgentChat({ agent, onBack }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      text: `Hello! I am your specialized **${agent.name}** agent. I've initialized with my full identity guidelines and critical rules.\n\nHow can I help you transform your workflow today?`,
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPromptBanner, setShowPromptBanner] = useState(false);
  
  // Audio & Copy State Managers
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleCopyText = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleTTS = (text: string, index: number) => {
    if (!('speechSynthesis' in window)) {
      alert("TTS read out loud is not supported by your browser environment.");
      return;
    }

    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
    } else {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*#`_\-]/g, '').slice(0, 600);
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.onend = () => setSpeakingIndex(null);
      utterance.onerror = () => setSpeakingIndex(null);
      setSpeakingIndex(index);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputValue.trim();
    if (!text || loading) return;

    if (!textToSend) {
      setInputValue("");
    }
    setError(null);

    const userMessage: Message = { role: "user", text };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      // Gather conversation history
      const history = messages.slice(1); // skip initial greeting to keep things lean

      // Build system instruction
      const systemInstruction = agent.content || `You are ${agent.name}. Vibe: ${agent.vibe}.`;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          systemInstruction,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate response.");
      }

      setMessages((prev) => [...prev, { role: "model", text: data.text }]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong. Please verify your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    if (window.confirm("Are you sure you want to reset this chat session?")) {
      setMessages([
        {
          role: "model",
          text: `Hello! I am your specialized **${agent.name}** agent. I've initialized with my full identity guidelines and critical rules.\n\nHow can I help you transform your workflow today?`,
        },
      ]);
      setError(null);
    }
  };

  // Agent-specific quick suggestion starter prompts
  const getSuggestionPrompts = (): string[] => {
    if (agent.id.includes("frontend")) {
      return [
        "Generate a performance-optimized React Virtualized Table component",
        "How do I optimize Core Web Vitals (LCP/CLS) for a static landing page?",
        "Write a Tailwind CSS component template for a bento-grid dashboard",
      ];
    }
    if (agent.id.includes("backend")) {
      return [
        "Design a secure, scalable REST API for an eCommerce checkout flow",
        "Generate an Express middleware for token rate-limiting and session validation",
        "Outline a migration plan from raw SQL queries to a clean database pool",
      ];
    }
    if (agent.id.includes("whimsy")) {
      return [
        "Suggest 3 micro-interactions to celebrate user milestone completions",
        "Write a playful, friendly error state message for a 404 landing page",
        "How can I inject subtle, delightful brand animations without harming performance?",
      ];
    }
    if (agent.id.includes("reality-checker") || agent.id.includes("reviewer")) {
      return [
        "Review this code snippet for architectural vulnerabilities and edge cases",
        "Provide a quality gate checklist for a major production deploy",
        "Check this specification for logical fallacies or unrealistic deadlines",
      ];
    }
    // Generic fallback
    return [
      `What are your critical rules as the ${agent.name}?`,
      `Show me a concrete example of a standard deliverable you produce.`,
      `How can we collaborate on a new project?`,
    ];
  };

  const isKeyMissingError = error?.includes("GEMINI_API_KEY") || error?.toLowerCase().includes("api key");

  return (
    <div id={`agent-chat-${agent.id}`} className="bg-slate-900/80 border border-cyan-500/20 shadow-2xl flex flex-col h-[650px] overflow-hidden rounded-2xl relative text-slate-200 font-sans">
      {/* Chat Header */}
      <div className="bg-slate-950 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-cyan-400 transition-all"
            title="Go Back"
          >
            <ArrowLeft size={18} />
          </button>
          
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-2xl border border-slate-800 shadow-inner">
            {agent.emoji}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-sm text-slate-100 uppercase tracking-wider leading-tight">
                {agent.name}
              </h2>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
            </div>
            <p className="text-[10px] text-cyan-500/60 font-mono mt-0.5 uppercase tracking-widest">
              // UNIT-{agent.id}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPromptBanner(!showPromptBanner)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/20 text-xs font-bold font-mono uppercase tracking-widest transition-all border border-slate-800"
            title="View System Prompt Core"
          >
            <Terminal size={13} />
            <span>Payload</span>
          </button>

          <button
            onClick={clearChat}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors border border-slate-800"
            title="Reset Conversation"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Embedded System Prompt Banner */}
      {showPromptBanner && (
        <div className="bg-slate-950 text-slate-400 border-b border-slate-800 p-4 max-h-48 overflow-y-auto text-[11px] font-mono leading-relaxed uppercase">
          <div className="flex items-center justify-between text-[10px] text-cyan-400 font-bold uppercase tracking-widest mb-2">
            <span>🛡️ SYSTEM CONTEXT PLAYLOAD ACTIVE</span>
            <span className="text-slate-600">({agent.content?.length || 0} CHR LOADED)</span>
          </div>
          {agent.content || "No custom prompt content loaded."}
        </div>
      )}

      {/* Main Messages Panel */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-950/40 flex flex-col space-y-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start animate-fade-in"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-5 py-3.5 shadow-md relative ${
                msg.role === "user"
                  ? "bg-cyan-950/40 text-slate-100 border border-cyan-400/30 rounded-br-none"
                  : "bg-slate-900/90 text-slate-200 border border-slate-800 rounded-bl-none"
              }`}
            >
              <div className="text-[10px] font-bold opacity-60 mb-2 flex items-center gap-1 font-mono uppercase tracking-widest">
                {msg.role === "user" ? "CLIENT PROTOCOL HOST" : `// UNIT-${agent.id}`}
              </div>

              {/* Action Buttons for Model Responses */}
              {msg.role === "model" && (
                <div className="absolute top-4 right-4 flex items-center gap-1.5">
                  <button
                    onClick={() => handleTTS(msg.text, index)}
                    className={`p-1.5 rounded-lg border transition-all ${
                      speakingIndex === index
                        ? "bg-amber-950/40 border-amber-500/30 text-amber-400"
                        : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
                    }`}
                    title={speakingIndex === index ? "Stop voice synthesis" : "Read response out loud"}
                  >
                    {speakingIndex === index ? <VolumeX size={12} /> : <Volume2 size={12} />}
                  </button>
                  <button
                    onClick={() => handleCopyText(msg.text, index)}
                    className={`p-1.5 rounded-lg border transition-all ${
                      copiedIndex === index
                        ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400"
                        : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
                    }`}
                    title="Copy to clipboard"
                  >
                    {copiedIndex === index ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              )}

              <div className={msg.role === "model" ? "markdown-body text-xs md:text-sm pr-16 text-slate-300" : "text-xs md:text-sm whitespace-pre-wrap leading-relaxed"}>
                {msg.role === "model" ? (
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                ) : (
                  msg.text
                )}
              </div>

              {/* Sandbox Container for Code Outputs */}
              {msg.role === "model" && <LiveSandbox content={msg.text} />}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl rounded-bl-none px-5 py-3.5 shadow-md flex items-center gap-3">
              <div className="flex space-x-1.5 items-center">
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-xs text-slate-500 font-bold font-mono uppercase tracking-widest">
                {agent.name} Is synthesizing...
              </span>
            </div>
          </div>
        )}

        {/* Custom API Key Alert Error */}
        {error && (
          <div className="p-4 bg-rose-950/40 border border-rose-500/40 text-rose-300 rounded-xl flex items-start gap-3">
            {isKeyMissingError ? (
              <ShieldAlert className="text-rose-400 flex-shrink-0 mt-0.5" size={18} />
            ) : (
              <AlertTriangle className="text-rose-400 flex-shrink-0 mt-0.5" size={18} />
            )}
            <div className="flex-1">
              <div className="font-semibold text-xs uppercase tracking-widest text-rose-400 font-mono">
                {isKeyMissingError ? "ALARM: ARC REQUISITE MISSING" : "API SYNAPSE FAILURE"}
              </div>
              <p className="text-xs mt-1 leading-relaxed text-rose-300 font-mono uppercase">
                {isKeyMissingError ? (
                  <>
                    Sir, I need a valid <strong>GEMINI_API_KEY</strong> environment secret registered on the database grid.
                    Please open <strong>Settings (Gear Icon on top menu) &gt; Secrets</strong>, declare variable name <code>GEMINI_API_KEY</code> with your token, and reissue.
                  </>
                ) : (
                  error
                )}
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Starter Questions (Shown when conversation is empty) */}
      {messages.length === 1 && !loading && (
        <div className="bg-slate-950 border-t border-slate-800/80 p-4">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 font-mono">
            <Sparkles size={12} className="text-cyan-400 animate-pulse" />
            <span>Suggested Action Items / Prompts</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {getSuggestionPrompts().map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSend(prompt)}
                className="text-left text-xs bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-cyan-500/30 py-2 px-3 rounded-xl text-slate-300 transition-all font-mono uppercase tracking-wide flex items-center justify-between"
              >
                <span>{prompt}</span>
                <span className="text-cyan-400 font-bold">&rarr;</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message Input Tray */}
      <div className="p-4 border-t border-slate-800 bg-slate-950">
        <div className="flex items-center gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={`Instruct @${agent.id} as their client supervisor...`}
            rows={1}
            disabled={loading}
            className="flex-1 bg-slate-900 text-slate-100 border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono placeholder:text-slate-600 focus:outline-hidden focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500/20 resize-none max-h-16"
          />

          <button
            onClick={() => handleSend()}
            disabled={loading || !inputValue.trim()}
            className="p-3 bg-cyan-950 hover:bg-cyan-900 border border-cyan-400/50 disabled:opacity-30 text-cyan-400 rounded-xl transition-all shadow-md"
            title="Send Message"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
