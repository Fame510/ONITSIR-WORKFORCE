/**
 * MasterAgentHub.tsx (unified) -- ported from agentosirus/src/components/MasterAgentHub.tsx.
 *
 * SYNERGY #25 (Use SINGULARITY's "never fabricate numbers" discipline to
 * separate real telemetry from decorative UI): the original component mixed
 * "mock HUD telemetry that oscillates for visual realism" (arc reactor
 * power, core temp, grid throughput) directly alongside real data
 * (provider/model used, chain step status) in the SAME telemetry panel with
 * no visual/code distinction. That decorative state now lives ONLY in
 * <CockpitFlourish/> (explicitly namespaced, non-authoritative); real
 * governance/mission data renders via <MissionTelemetry/>, sourced from the
 * activityBus/WS mission stream -- never mixed into the same component
 * state again.
 *
 * SYNERGY #9 (specialist-count drift fix): the hardcoded "144 specialized AI
 * nodes" welcome text and "144 ACTIVE NODES" telemetry line are removed;
 * this component no longer asserts a specialist count at all (App.tsx's
 * header already shows the live count from GET /api/divisions).
 */
import { useState, useRef, useEffect } from "react";
import { Send, RefreshCw, AlertTriangle, ShieldAlert, Layers, Check, Copy, Volume2, VolumeX, Globe, Mic, MicOff, Terminal, Cpu, Activity, Compass } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { LiveSandbox } from "./LiveSandbox.tsx";
import { CockpitFlourish } from "./CockpitFlourish.tsx";
import { MissionTelemetry } from "./MissionTelemetry.tsx";

interface Step {
  agentId: string;
  name: string;
  emoji: string;
  task: string;
  output: string;
}

export function MasterAgentHub() {
  const [messages, setMessages] = useState<any[]>([
    {
      role: "model",
      // SYNERGY #9: no hardcoded specialist count -- the live count is
      // shown in App.tsx's header (sourced from GET /api/divisions).
      text: "SYSTEM INITIALIZED: J.A.R.V.I.S. ONLINE.\n\n\"Welcome back, Sir. I have scanned the workspace and synchronized our full specialist roster. Core systems are running at optimum capacity.\"\n\n*   **Voice Control Protocol**: Click the glowing microphone icon below to activate hands-free vocal inputs.\n*   **Automatic Vocal Feedback**: Toggle the Audio-Vibe switch at the side to enable automatic voice synthesis feedback.\n*   **Swarm Sequencing Protocol**: Instruct me to compose multi-specialist pipelines to formulate and execute complex software workflows automatically.",
      isMaster: true
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cockpit States
  const [mode, setMode] = useState<"chat" | "swarm">("swarm");
  const [enableSearch, setEnableSearch] = useState(true);
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeFeedback, setScrapeFeedback] = useState<string | null>(null);

  // Speech Synthesis & Recognition States
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [jarvisVoiceEnabled, setJarvisVoiceEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const [handsFreeEnabled, setHandsFreeEnabled] = useState(false);
  const [wakeState, setWakeState] = useState<"idle" | "listening" | "processing">("idle");
  const [wakeFeedback, setWakeFeedback] = useState<string | null>(null);
  const handsFreeRecRef = useRef<any>(null);
  const wakeTimeoutRef = useRef<any>(null);

  // SYNERGY #25: decorative telemetry state REMOVED from this component --
  // it now lives exclusively in <CockpitFlourish/>, explicitly namespaced
  // as non-authoritative. Real telemetry renders via <MissionTelemetry/>.

  // Chained Swarm execution states
  const [currentChainStep, setCurrentChainStep] = useState<number>(0);
  const [chainLogs, setChainLogs] = useState<string[]>([]);
  const [activeStepTab, setActiveStepTab] = useState<number>(-1);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Set up HTML5 Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";

      rec.onstart = () => {
        setIsListening(true);
        setRecognitionError(null);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputValue(prev => {
            const separator = prev.trim() ? " " : "";
            return prev + separator + transcript;
          });
        }
      };

      rec.onerror = (event: any) => {
        console.error("Speech Recognition Error", event);
        setRecognitionError(`Voice sync lost: ${event.error}`);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }

    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Toggle voice recognition
  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Holographic Voice input is not supported in this browser engine. Please use Google Chrome or Safari.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.warn("Speech recognition already running", e);
      }
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, chainLogs]);

  // J.A.R.V.I.S. specialized Speech synthesis function with English British accent config
  const handleTTS = (text: string, index: number, autoTrigger = false) => {
    if (!('speechSynthesis' in window)) {
      return;
    }

    // If already speaking this, cancel it
    if (speakingIndex === index && !autoTrigger) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }

    window.speechSynthesis.cancel();

    // Clean markdown notation, raw code blocks and urls to keep voice reading smooth
    const sanitizedText = text
      .replace(/```[\s\S]*?```/g, "[Code script generated in sandbox]")
      .replace(/[*#`_\-]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .slice(0, 450); // read a pleasant summary block

    const utterance = new SpeechSynthesisUtterance(sanitizedText);
    
    // Attempt to locate a high-quality UK British Male Voice to mimic J.A.R.V.I.S.
    const voices = window.speechSynthesis.getVoices();
    const jarvisVoice = voices.find(v => v.lang.startsWith("en-GB") && v.name.toLowerCase().includes("male")) ||
                        voices.find(v => v.lang.startsWith("en-GB")) ||
                        voices.find(v => v.name.toLowerCase().includes("david")) ||
                        voices.find(v => v.lang.startsWith("en"));
                        
    if (jarvisVoice) {
      utterance.voice = jarvisVoice;
    }
    utterance.rate = 1.05; // slightly faster and precise
    utterance.pitch = 0.95; // slightly deeper baritone charisma

    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);

    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  // Copy helper
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const handleCopyText = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Crawl webpage
  const handleManualScrape = async () => {
    if (!scrapeUrl.trim() || isScraping) return;
    setIsScraping(true);
    setScrapeFeedback(null);
    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: scrapeUrl })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Scraping failed.");

      setInputValue(prev => `${prev}\n\n[Referenced URL Data from ${scrapeUrl}]:\n${data.text.slice(0, 1500)}...\n`);
      setScrapeFeedback("Scraped URL content loaded into your message context successfully!");
      setScrapeUrl("");
    } catch (err: any) {
      setScrapeFeedback(`Failed to scrape: ${err.message}`);
    } finally {
      setIsScraping(false);
    }
  };

  // Primary request runner
  const handleSendRequest = async (overridePrompt?: string) => {
    const prompt = overridePrompt || inputValue.trim();
    if (!prompt || loading) return;

    if (!overridePrompt) {
      setInputValue("");
    }
    setError(null);
    setScrapeFeedback(null);

    // Cancel existing speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
    }

    const userMessage = { role: "user", text: prompt };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    if (mode === "chat") {
      try {
        const history = messages.slice(1).map(m => ({ role: m.role, text: m.text }));
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: prompt,
            history,
            enableSearch,
            systemInstruction: "You are J.A.R.V.I.S., Tony Stark's brilliant, incredibly helpful AI operating cockpit supervisor. Respond directly, with an refined, polite British tone, calling the user 'Sir'. Keep instructions technical but elegant."
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Request failed.");

        const nextIndex = messages.length + 1;
        setMessages(prev => [...prev, { role: "model", text: data.text }]);

        // Automatically vocalize response if J.A.R.V.I.S voice is enabled
        if (jarvisVoiceEnabled) {
          setTimeout(() => handleTTS(data.text, nextIndex, true), 300);
        }
      } catch (err: any) {
        setError(err.message || "Failed to contact proxy.");
      } finally {
        setLoading(false);
      }
    } else {
      setCurrentChainStep(1);
      setChainLogs(["Decrypting task parameters...", "Simulating agent combinations on Stark holographic table...", "Orchestrating specialist roster..."]);
      
      try {
        const response = await fetch("/api/chain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: prompt })
        });

        setChainLogs(prev => [...prev, "Compiling multi-agent workflow chain...", "Step 1 specialist executing logic...", "Step 2 specialist validating outputs..."]);

        const data: any = await response.json();
        if (!response.ok) throw new Error(data.error || "Swarm execution failed.");

        setChainLogs(prev => [...prev, "Performing diagnostic and security review...", "Deploying sandbox deliverable modules..."]);

        const nextIndex = messages.length + 1;
        setMessages(prev => [...prev, {
          role: "model",
          isSwarm: true,
          plan: data.plan,
          steps: data.steps,
          text: data.finalOutput
        }]);

        if (jarvisVoiceEnabled) {
          setTimeout(() => handleTTS(data.finalOutput, nextIndex, true), 300);
        }

      } catch (err: any) {
        setError(err.message || "Failed to compile workflow chain.");
      } finally {
        setLoading(false);
        setCurrentChainStep(0);
        setChainLogs([]);
      }
    }
  };

  // Helper to play synthesized chimes via web audio context
  const playJarvisChime = (type: "wake" | "success" | "listening") => {
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      if (type === "wake") {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc1.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15); // A6
        
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(1109, ctx.currentTime); // C#6
        osc2.frequency.exponentialRampToValueAtTime(2218, ctx.currentTime + 0.15); // C#7
        
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        
        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 0.3);
        osc2.stop(ctx.currentTime + 0.3);
      } else if (type === "listening") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === "success") {
        const freqs = [1046.5, 1318.5, 1568]; // C6, E6, G6
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
          gain.gain.setValueAtTime(0.06, ctx.currentTime + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.08);
          osc.stop(ctx.currentTime + idx * 0.08 + 0.25);
        });
      }
    } catch (e) {
      console.warn("Audio Context chime failed:", e);
    }
  };

  // Set up hands-free background listener
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (handsFreeEnabled) {
      if (isListening && recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }

      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => {
        setWakeState("idle");
        setWakeFeedback("HANDS-FREE ENGINE ARMED. SAY 'JARVIS' OR 'HEY JARVIS' TO ACTIVATE.");
        setRecognitionError(null);
      };

      rec.onresult = (event: any) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }

        const lowerTranscript = transcript.toLowerCase();
        const hasWakeWord = /jarvis|travis|javis|hey jarvis|hi jarvis/i.test(lowerTranscript);

        if (hasWakeWord) {
          setWakeState(current => {
            if (current === "idle") {
              playJarvisChime("wake");
              setWakeFeedback("JARVIS AWAKE. CAPTURING SIR'S VERBAL COMMANDS...");
              return "listening";
            }
            return current;
          });

          // Extract whatever the user spoke after the wake word
          const splitRegex = /jarvis|travis|javis/i;
          const parts = transcript.split(splitRegex);
          if (parts.length > 1) {
            const command = parts.slice(1).join(" ").trim();
            if (command) {
              setInputValue(command);

              if (wakeTimeoutRef.current) {
                clearTimeout(wakeTimeoutRef.current);
              }
              wakeTimeoutRef.current = setTimeout(() => {
                setWakeState(curr => {
                  if (curr === "listening") {
                    setWakeFeedback("TRANSMITTING INSTRUCTION TO COGNITIVE CORE...");
                    handleSendRequest(command);
                    playJarvisChime("success");
                    return "processing";
                  }
                  return curr;
                });
              }, 1600); // Wait for 1.6s of silence to execute
            }
          }
        }
      };

      rec.onerror = (event: any) => {
        console.error("Hands-Free Error", event);
        if (event.error === "no-speech") return;
        setRecognitionError(`Hands-free lost: ${event.error}`);
        setWakeState("idle");
      };

      rec.onend = () => {
        if (handsFreeEnabled) {
          setTimeout(() => {
            if (handsFreeRecRef.current) {
              try { handsFreeRecRef.current.start(); } catch (e) {}
            }
          }, 300);
        }
      };

      handsFreeRecRef.current = rec;
      try {
        rec.start();
      } catch (e) {
        console.error("Failed to start hands-free:", e);
      }
    } else {
      if (handsFreeRecRef.current) {
        try {
          handsFreeRecRef.current.onend = null;
          handsFreeRecRef.current.stop();
        } catch (e) {}
        handsFreeRecRef.current = null;
      }
      setWakeState("idle");
      setWakeFeedback(null);
    }

    return () => {
      if (handsFreeRecRef.current) {
        try {
          handsFreeRecRef.current.onend = null;
          handsFreeRecRef.current.stop();
        } catch (e) {}
      }
      if (wakeTimeoutRef.current) {
        clearTimeout(wakeTimeoutRef.current);
      }
    };
  }, [handsFreeEnabled]);

  const isKeyMissingError = error?.includes("GEMINI_API_KEY") || error?.toLowerCase().includes("api key");

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 font-sans bg-slate-950 p-1 md:p-4 rounded-3xl glow-border-cyan hologram-grid text-slate-200">
      
      {/* Left controls rail: HUD Hologram controls */}
      <div className="xl:col-span-1 flex flex-col gap-6">
        
        {/* Animated J.A.R.V.I.S. Core Brain / Arc Reactor Module */}
        <div className="bg-slate-900/80 border border-cyan-500/20 rounded-2xl p-6 shadow-2xl relative overflow-hidden flex flex-col items-center">
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full animate-ping inline-block ${handsFreeEnabled ? "bg-amber-400" : "bg-cyan-400"}`} />
            <span className={`font-mono text-[9px] font-bold uppercase tracking-widest ${handsFreeEnabled ? "text-amber-400 glow-text-orange" : "text-cyan-400 glow-text-cyan"}`}>
              {handsFreeEnabled ? `WAKE: ${wakeState}` : "CORE ONLINE"}
            </span>
          </div>

          <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 font-display mb-4">
            J.A.R.V.I.S. Consciousness Reactor
          </div>

          {/* Core Orb Visualization */}
          <div className="relative w-36 h-36 flex items-center justify-center my-2">
            {/* Outer revolving holographic ring */}
            <div className={`absolute inset-0 rounded-full border-2 border-dashed border-cyan-500/30 ${
              loading ? "animate-spin" : "animate-[spin_20s_linear_infinite]"
            }`} style={{ animationDuration: loading ? "2s" : "20s" }} />

            {/* Middle counter-rotating ring */}
            <div className={`absolute inset-3 rounded-full border border-double border-cyan-400/20 ${
              isListening ? "border-amber-400/60 animate-pulse" : "animate-[spin_10s_linear_infinite_reverse]"
            }`} />

            {/* Inner pulsing energy source */}
            <div className={`relative w-20 h-20 rounded-full bg-cyan-950/40 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_30px_rgba(0,243,255,0.2)] ${
              isListening ? "border-amber-400 bg-amber-950/30" : ""
            }`}>
              {/* Dynamic Soundwave / Voice bar container inside reactor */}
              {isListening ? (
                <div className="flex gap-1 items-center justify-center">
                  <span className="w-1 h-8 bg-amber-400 rounded animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-5 bg-amber-400 rounded animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 h-9 bg-amber-400 rounded animate-bounce" style={{ animationDelay: "300ms" }} />
                  <span className="w-1 h-6 bg-amber-400 rounded animate-bounce" style={{ animationDelay: "450ms" }} />
                </div>
              ) : speakingIndex !== null ? (
                <div className="flex gap-1 items-center justify-center">
                  <span className="w-1 h-6 bg-cyan-400 rounded animate-pulse" />
                  <span className="w-1 h-8 bg-cyan-400 rounded animate-pulse" style={{ animationDelay: "200ms" }} />
                  <span className="w-1 h-5 bg-cyan-400 rounded animate-pulse" style={{ animationDelay: "400ms" }} />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-cyan-500/10 border-2 border-cyan-400/80 animate-ping" />
              )}
              {/* Center shining core node */}
              <div className={`absolute w-4 h-4 rounded-full ${
                isListening ? "bg-amber-400 shadow-[0_0_15px_#ff9d00]" : "bg-cyan-400 shadow-[0_0_15px_#00f3ff]"
              }`} />
            </div>
          </div>

          <p className="text-[11px] text-slate-400 text-center font-mono mt-3 leading-relaxed">
            {isListening ? (
              <span className="text-amber-400 font-bold glow-text-orange animate-pulse">JARVIS IS LISTENING... SIR</span>
            ) : speakingIndex !== null ? (
              <span className="text-cyan-400 font-bold glow-text-cyan">SPEAKING INTEL OVER VOICE</span>
            ) : (
              <span className="text-slate-400 font-medium">COGNITIVE LEVEL: STABLE</span>
            )}
          </p>
        </div>

        {/* HUD Real-Time Telemetry parameters */}
        <div className="bg-slate-900/80 border border-cyan-500/20 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs uppercase tracking-wider font-display mb-3">
            <Activity size={14} className="animate-pulse" />
            <span>Telemetry Diagnostics</span>
          </div>

          <div className="space-y-3 font-mono text-[11px] text-slate-300">
            <div className="flex justify-between items-center py-1.5 border-b border-cyan-500/10">
              <span className="text-slate-500">AI COGNITIVE LOAD</span>
              <span className="text-cyan-400 font-bold">{loading ? "BUSY" : "IDLE"}</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-slate-500">VOICE DICTION STATUS</span>
              <span className="text-emerald-400 font-bold">ONLINE</span>
            </div>
          </div>

          {/* SYNERGY #25: real telemetry (activityBus/WS-derived) and
              decorative flourish are rendered side by side but from
              COMPLETELY separate components/state -- never conflated. */}
          <div className="mt-4 flex flex-col gap-3">
            <MissionTelemetry />
            <CockpitFlourish />
          </div>
        </div>

        {/* Cockpit Mode Configurator */}
        <div className="bg-slate-900/80 border border-cyan-500/20 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center gap-2 mb-3 text-cyan-400 font-bold text-xs uppercase tracking-wider font-display">
            <Cpu size={14} />
            <span>Execution Protocol</span>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => setMode("swarm")}
              className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                mode === "swarm"
                  ? "bg-cyan-950/40 border-cyan-400 shadow-[0_0_10px_rgba(0,243,255,0.2)]"
                  : "bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <Layers size={14} className={mode === "swarm" ? "text-cyan-400" : "text-slate-500"} />
                <span className="font-display font-bold text-xs">Dynamic Swarm Sequence</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 leading-normal font-mono">
                Decide, cascade, and coordinate up to 3 specialist agents sequentially.
              </span>
            </button>

            <button
              onClick={() => setMode("chat")}
              className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                mode === "chat"
                  ? "bg-cyan-950/40 border-cyan-400 shadow-[0_0_10px_rgba(0,243,255,0.2)]"
                  : "bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <Globe size={14} className={mode === "chat" ? "text-cyan-400" : "text-slate-500"} />
                <span className="font-display font-bold text-xs">Direct Grounded Chat</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 leading-normal font-mono">
                Refined direct conversation with live web-grounding and search filters.
              </span>
            </button>
          </div>

          {/* Automatic speech feedback switch toggle */}
          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Volume2 size={13} className="text-cyan-400" />
              <span className="text-[11px] font-semibold text-slate-300 font-mono">J.A.R.V.I.S. Speech Feedback</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer font-sans select-none">
              <input
                type="checkbox"
                checked={jarvisVoiceEnabled}
                onChange={(e) => setJarvisVoiceEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-4.5 bg-slate-800 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-cyan-500"></div>
            </label>
          </div>

          {/* Hands-Free Wake Trigger option */}
          <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Mic size={13} className={handsFreeEnabled ? "text-amber-400 animate-pulse" : "text-cyan-400"} />
              <span className="text-[11px] font-semibold text-slate-300 font-mono">Hands-Free [Say "Jarvis"]</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer font-sans select-none">
              <input
                type="checkbox"
                checked={handsFreeEnabled}
                onChange={(e) => setHandsFreeEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-4.5 bg-slate-800 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-500 animate-pulse"></div>
            </label>
          </div>

          {mode === "chat" && (
            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Globe size={13} className="text-cyan-400" />
                <span className="text-[11px] font-semibold text-slate-300 font-mono">Google Web Grounding</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableSearch}
                  onChange={(e) => setEnableSearch(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4.5 bg-slate-800 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-cyan-500"></div>
              </label>
            </div>
          )}
        </div>

        {/* Interactive Webpage Scraper overlay */}
        <div className="bg-slate-900/80 border border-cyan-500/20 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs uppercase tracking-wider font-display mb-1.5">
            <Compass size={14} className="animate-spin" style={{ animationDuration: "12s" }} />
            <span>Holographic Web Scraper</span>
          </div>
          <p className="text-[10px] text-slate-500 font-mono leading-relaxed mb-3">
            Sir, input a URL to parse and project full article content into context immediately.
          </p>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={scrapeUrl}
              onChange={(e) => setScrapeUrl(e.target.value)}
              placeholder="https://example.com/api-doc"
              className="bg-slate-950 border border-slate-800 text-cyan-400 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-cyan-400 transition-all font-mono"
            />
            <button
              onClick={handleManualScrape}
              disabled={isScraping || !scrapeUrl.trim()}
              className="w-full py-2 bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-400/40 disabled:opacity-40 text-cyan-400 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 font-display"
            >
              {isScraping ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  <span>FEEDING ENERGY...</span>
                </>
              ) : (
                <>
                  <span>COMPILE WEBPAGE CONTEXT</span>
                </>
              )}
            </button>
            {scrapeFeedback && (
              <p className="text-[10px] text-cyan-400 font-mono leading-normal mt-1 text-center bg-cyan-950/20 p-2 rounded-lg border border-cyan-500/20">
                {scrapeFeedback}
              </p>
            )}
          </div>
        </div>

      </div>

      {/* Main chat output pane: The Stark Interactive Terminal */}
      <div className="xl:col-span-3 bg-slate-900/90 rounded-2xl border border-cyan-500/20 shadow-2xl flex flex-col h-[750px] overflow-hidden relative">
        
        {/* Hologram Glass Grid decoration overlay */}
        <div className="absolute inset-0 hologram-grid pointer-events-none opacity-20" />

        {/* Interactive Stark suit status header */}
        <div className="bg-slate-950/80 border-b border-cyan-500/10 px-6 py-4 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-400/50 flex items-center justify-center text-xl font-display font-black text-cyan-400 shadow-[0_0_15px_rgba(0,243,255,0.2)]">
              J
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="font-display font-bold text-sm tracking-wider text-cyan-400 glow-text-cyan">JARVIS_CENTRAL_CORE</h2>
                <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold font-mono uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  {mode === "swarm" ? "SWARM_MODE" : "STANDALONE"}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                COGNITIVE ENGINE: GEMINI 3.5 FLASH COCKPIT &bull; READY FOR COMMANDS
              </p>
            </div>
          </div>

          {messages.length > 1 && (
            <button
              onClick={() => {
                if (window.confirm("Perform hard system reboot?")) {
                  setMessages([
                    {
                      role: "model",
                      text: "SYSTEM REBOOT COMPLETE. Welcome back, Sir. All specialists aligned on the holographic table.",
                      isMaster: true
                    }
                  ]);
                  setError(null);
                }
              }}
              className="text-xs text-cyan-400/80 hover:text-cyan-400 hover:bg-cyan-500/10 px-2.5 py-1.5 rounded-lg border border-cyan-500/30 transition-all font-mono"
            >
              REBOOT COGNITION
            </button>
          )}
        </div>

        {/* Telemetry/Scrolling terminal stream logs */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col space-y-6 relative z-10">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div className={`max-w-[90%] rounded-2xl p-5 shadow-lg relative ${
                msg.role === "user"
                  ? "bg-slate-950 text-cyan-400 border border-cyan-400/30 rounded-br-none"
                  : "bg-slate-900/60 text-slate-200 border border-slate-800 rounded-bl-none"
              }`}>
                {/* Header label */}
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2.5 font-mono flex items-center gap-1">
                  <Terminal size={10} className="text-cyan-400" />
                  <span>{msg.role === "user" ? "STARK_INPUT_TERMINAL" : "JARVIS_COGNITIVE_FEED"}</span>
                </div>

                {/* Read aloud & Copy panel */}
                {msg.role === "model" && (
                  <div className="absolute top-4 right-4 flex items-center gap-1.5">
                    <button
                      onClick={() => handleTTS(msg.text, idx)}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        speakingIndex === idx
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-400 shadow-[0_0_10px_rgba(0,243,255,0.2)]"
                          : "bg-slate-950/80 border-slate-800 text-slate-500 hover:text-cyan-400 hover:border-cyan-400/30"
                      }`}
                      title={speakingIndex === idx ? "HALT SPEECH FEED" : "PLAY RESPONSE ALOUD"}
                    >
                      {speakingIndex === idx ? <VolumeX size={12} /> : <Volume2 size={12} />}
                    </button>
                    <button
                      onClick={() => handleCopyText(msg.text, idx)}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        copiedIndex === idx
                          ? "bg-emerald-500/20 border-emerald-400 text-emerald-400"
                          : "bg-slate-950/80 border-slate-800 text-slate-500 hover:text-cyan-400 hover:border-cyan-400/30"
                      }`}
                      title="COPY RAW CODE / TEXT"
                    >
                      {copiedIndex === idx ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                )}

                {/* Body Content */}
                <div className={msg.role === "model" ? "markdown-body text-sm" : "text-sm font-mono whitespace-pre-wrap leading-relaxed"}>
                  {msg.role === "model" ? (
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  ) : (
                    msg.text
                  )}
                </div>

                {/* Live Sandboxed dynamic live frame wrapper */}
                {msg.role === "model" && <LiveSandbox content={msg.text} />}

                {/* Special swarm visualization timeline map */}
                {msg.isSwarm && msg.steps && (
                  <div className="mt-6 pt-5 border-t border-slate-800">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/30 text-cyan-400 font-bold text-[10px] uppercase font-mono">
                        SEQUENTIAL CHAIN COMPLETED:
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">({msg.steps.length} SPECIALISTS SYNCHRONIZED)</span>
                    </div>

                    {/* Step Tabs headers */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      <button
                        onClick={() => setActiveStepTab(-1)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all font-mono ${
                          activeStepTab === -1
                            ? "bg-cyan-500/20 text-cyan-400 border-cyan-400 shadow-[0_0_10px_rgba(0,243,255,0.15)]"
                            : "bg-slate-950/80 text-slate-400 border-slate-800 hover:text-slate-200"
                        }`}
                      >
                        📋 BLUEPRINT PLAN
                      </button>

                      {msg.steps.map((step: Step, sIdx: number) => (
                        <button
                          key={sIdx}
                          onClick={() => setActiveStepTab(sIdx)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1 font-mono ${
                            activeStepTab === sIdx
                              ? "bg-cyan-500/20 text-cyan-400 border-cyan-400 shadow-[0_0_10px_rgba(0,243,255,0.15)]"
                              : "bg-slate-950/80 text-slate-400 border-slate-800 hover:text-slate-200"
                          }`}
                        >
                          <span>{step.emoji}</span>
                          <span>{step.name.toUpperCase()}</span>
                        </button>
                      ))}
                    </div>

                    {/* Active tab contents info panel */}
                    <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 leading-relaxed text-sm">
                      {activeStepTab === -1 ? (
                        <div>
                          <div className="font-bold text-[10px] text-cyan-400 uppercase tracking-widest font-mono mb-1.5">
                            STARK COCKPIT PIPELINE PROTOCOL
                          </div>
                          <p className="text-slate-300 text-xs italic leading-relaxed">
                            "{msg.plan}"
                          </p>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                            <div>
                              <div className="font-bold text-[10px] text-cyan-400 uppercase tracking-widest font-mono">
                                COMPILER DELIVERABLE OUTPUT
                              </div>
                              <h4 className="font-display font-extrabold text-sm text-white mt-0.5">
                                {msg.steps[activeStepTab].emoji} {msg.steps[activeStepTab].name}
                              </h4>
                            </div>
                            
                            <button
                              onClick={() => handleCopyText(msg.steps[activeStepTab].output, activeStepTab + 100)}
                              className="text-[10px] font-bold text-cyan-400 hover:underline flex items-center gap-1 font-mono"
                            >
                              {copiedIndex === activeStepTab + 100 ? (
                                <>
                                  <Check size={10} />
                                  <span>COPIED</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={10} />
                                  <span>COPY DELIVERABLE</span>
                                </>
                              )}
                            </button>
                          </div>
                          
                          <p className="text-[11px] font-semibold text-slate-400 font-mono mb-3 bg-slate-950 p-2.5 rounded border border-slate-800/80">
                            SPECIALIST INSTRUCTION: {msg.steps[activeStepTab].task}
                          </p>

                          <div className="markdown-body text-xs text-slate-300">
                            <ReactMarkdown>{msg.steps[activeStepTab].output}</ReactMarkdown>
                          </div>

                          <LiveSandbox content={msg.steps[activeStepTab].output} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Holographic animated chainer logs */}
          {loading && currentChainStep > 0 && (
            <div className="flex justify-start relative z-10">
              <div className="bg-slate-950 text-slate-200 border border-cyan-500/20 rounded-2xl rounded-bl-none p-5 shadow-2xl max-w-[85%] w-full animate-fade-in">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-400/40 flex items-center justify-center animate-spin">
                    <RefreshCw size={14} className="text-cyan-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-display glow-text-cyan">
                      JARVIS SWARM RUNNER ACTIVE
                    </h4>
                    <p className="text-[10px] text-slate-500 font-mono">
                      Sequential specialist execution matrix compilation
                    </p>
                  </div>
                </div>

                <div className="space-y-2 mt-2 bg-slate-900 p-4 rounded-xl border border-slate-800 text-xs font-mono">
                  {chainLogs.map((log, lIdx) => (
                    <div key={lIdx} className="flex items-center gap-2 text-cyan-400">
                      <span className="text-cyan-400 font-bold animate-pulse">&gt;&gt;</span>
                      <span>{log.toUpperCase()}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-amber-400 animate-pulse">
                    <span>⚡</span>
                    <span>CHANNELING ENERGY TO COGNITIVE CORE...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Standalone request loading diagnostic log */}
          {loading && currentChainStep === 0 && (
            <div className="flex justify-start relative z-10">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl rounded-bl-none px-5 py-3.5 shadow-xl flex items-center gap-3">
                <div className="flex space-x-1.5 items-center">
                  <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-xs text-slate-400 font-medium font-mono uppercase tracking-wider">
                  JARVIS SEARCH DICTION GATEWAY ACTIVE...
                </span>
              </div>
            </div>
          )}

          {/* Error notifications formatted like Stark Suit alarms */}
          {error && (
            <div className="p-4 bg-rose-950/40 border border-rose-500/40 text-rose-300 rounded-xl flex items-start gap-3 relative z-10">
              {isKeyMissingError ? (
                <ShieldAlert className="text-rose-400 flex-shrink-0 mt-0.5" size={18} />
              ) : (
                <AlertTriangle className="text-rose-400 flex-shrink-0 mt-0.5" size={18} />
              )}
              <div className="flex-1">
                <div className="font-semibold text-xs uppercase tracking-wider text-rose-400 font-mono">
                  {isKeyMissingError ? "ALARM: ARC REQUISITE MISSING" : "COGNITIVE SYNAPSE SHUTDOWN"}
                </div>
                <p className="text-xs mt-1 leading-relaxed text-rose-300 font-mono">
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

          {/* Voice input transcription feedback banner */}
          {recognitionError && (
            <div className="p-3 bg-amber-950/20 border border-amber-500/30 text-amber-400 rounded-xl text-xs font-mono text-center animate-fade-in relative z-10">
              ⚠️ {recognitionError.toUpperCase()}
            </div>
          )}

          {/* Hands-Free Vocal Active Status banner */}
          {handsFreeEnabled && wakeFeedback && (
            <div className="p-3 bg-cyan-950/30 border border-cyan-500/20 text-cyan-400 rounded-xl text-xs font-mono text-center animate-pulse relative z-10">
              💬 {wakeFeedback}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Terminal bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 relative z-10">
          <div className="flex items-center gap-3">
            <div className="text-xs font-mono text-cyan-400 select-none hidden md:block">
              STARK_HUD:~$
            </div>

            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendRequest();
                }
              }}
              placeholder={
                isListening
                  ? "Vocalizing commands... speak clearly now"
                  : mode === "swarm"
                  ? "Instruct J.A.R.V.I.S to sequence a multi-agent workflow chain..."
                  : "Type a prompt for direct cockpit chat..."
              }
              rows={1}
              disabled={loading}
              className="flex-1 bg-slate-900 text-cyan-400 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono placeholder:text-slate-600 focus:outline-hidden focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500/20 resize-none max-h-16"
            />

            {/* Glowing Vocal Input activation switch */}
            <button
              onClick={toggleListening}
              disabled={loading}
              className={`p-3 rounded-xl transition-all border flex-shrink-0 relative ${
                isListening
                  ? "bg-amber-500/20 border-amber-400 text-amber-400 shadow-[0_0_15px_#ff9d00]"
                  : "bg-slate-900 border-slate-800 text-slate-500 hover:text-cyan-400 hover:border-cyan-400/30"
              }`}
              title={isListening ? "DEACTIVATE VOICE MIC" : "ACTIVATE HOLOGRAM VOICE CONTROL"}
            >
              {isListening ? (
                <>
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  <MicOff size={16} />
                </>
              ) : (
                <Mic size={16} />
              )}
            </button>

            <button
              onClick={() => handleSendRequest()}
              disabled={loading || !inputValue.trim()}
              className="p-3 bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-400/50 disabled:opacity-40 text-cyan-400 rounded-xl transition-all shadow-[0_0_10px_rgba(0,243,255,0.15)] flex-shrink-0"
              title="EXECUTE COCKPIT GRID"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

