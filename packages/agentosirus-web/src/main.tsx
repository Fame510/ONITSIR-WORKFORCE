import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installApiShim } from "./lib/apiShim";
import { SettingsPanel } from "./components/SettingsPanel";
import { MindMap } from "./components/MindMap";
import { loadConfig, routableProviders } from "./lib/keyVault";
import { PROVIDER_MAP } from "./lib/providers";
import { integrationStatus } from "./lib/integrations";
import { subscribeGraph } from "./lib/activityBus";
import { setBackendUrl, getBackendUrl } from "./lib/onitsirClient";
import { KeyRound, Network, X, Github, Globe, Chrome, Clapperboard } from "lucide-react";

/**
 * SYNERGY #5 (Expose ONITSIR as a backend service that agentosirus's React
 * UI drives): a `VITE_BACKEND_URL` env var (or a value persisted by
 * SettingsPanel's "Use ONITSIR backend" toggle, stored under this same
 * localStorage key) switches agentosirus from "static/client-only" mode to
 * "ONITSIR-backed" mode. `installApiShim()` is simply NOT installed when a
 * real backend is configured -- zero component-level frontend changes
 * required, because apiShim.ts already mirrors the exact route shape a real
 * backend needs (architecture doc section 2.3 item 2).
 */
const BACKEND_URL_KEY = "agentosirus.backend_url";

function resolveBackendUrl(): string | null {
  const envUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined) || "";
  const stored = (() => {
    try {
      return localStorage.getItem(BACKEND_URL_KEY) || "";
    } catch {
      return "";
    }
  })();
  const url = stored || envUrl;
  return url ? url.trim() : null;
}

const backendUrl = resolveBackendUrl();
setBackendUrl(backendUrl);

if (!backendUrl) {
  // Answer /api/* inside the browser so the app runs on static hosting.
  installApiShim();
}
// else: agentosirus-web talks directly to onitsir-server's real /api/*
// implementation (see onitsir-server/app/main.py) -- apiShim.ts is bypassed
// entirely, matching the architecture's "zero frontend changes" guarantee.

function StatusPill({ ok, label, Icon }: { ok: boolean; label: string; Icon: typeof Github }) {
  return (
    <span
      title={label + (ok ? " connected" : " not configured")}
      className={
        "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase transition duration-200 hover:-translate-y-0.5 " +
        (ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400")
      }
    >
      <Icon size={11} /> {label}
    </span>
  );
}

function Shell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState(false);
  const [activeAgents, setActiveAgents] = useState(0);

  const syncConfig = () => {
    const config = loadConfig();
    setProviders(routableProviders(config).map((id) => PROVIDER_MAP[id].label));
    integrationStatus().then(setStatus);
  };

  useEffect(() => {
    syncConfig();
    window.addEventListener("agentosirus:config-changed", syncConfig);
    return () => window.removeEventListener("agentosirus:config-changed", syncConfig);
  }, []);

  // Auto-open the map when a swarm starts so work is visible as it happens.
  useEffect(() =>
    subscribeGraph((graph) => {
      setRunning(graph.running);
      setActiveAgents(graph.nodes.length);
      if (graph.running && graph.nodes.length > 0) setMapOpen(true);
    }), []);

  // Open the control room on a first visit with nothing configured.
  useEffect(() => {
    if (routableProviders(loadConfig()).length === 0) setSettingsOpen(true);
  }, []);

  const configured = providers.length > 0;

  return (
    <>
      <App />

      {/* Floating control dock */}
      <div className="fixed bottom-5 right-5 z-[90] flex flex-col items-end gap-2">
        <div className="flex flex-wrap justify-end gap-1.5 rounded-2xl border border-white/80 bg-white/85 px-2.5 py-2 shadow-lg backdrop-blur">
          <StatusPill ok={Boolean(status.github)} label="GitHub" Icon={Github} />
          <StatusPill ok={Boolean(status.firecrawl)} label="Firecrawl" Icon={Globe} />
          <StatusPill ok={Boolean(status.playwright)} label="Browser" Icon={Chrome} />
          <StatusPill ok={Boolean(status.kling)} label="Kling" Icon={Clapperboard} />
          {/* SYNERGY #5: shows whether the real onitsir-server backend is
              wired in (governed mode) or apiShim.ts is answering /api/*
              locally (static/offline mode). */}
          <StatusPill ok={Boolean(getBackendUrl())} label={getBackendUrl() ? "ONITSIR" : "Offline"} Icon={Network} />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setMapOpen((v) => !v)}
            title="Toggle the live mind map"
            className={
              "group flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-extrabold uppercase tracking-wide shadow-xl backdrop-blur transition duration-200 hover:-translate-y-1 hover:shadow-2xl " +
              (running
                ? "bg-gradient-to-r from-emerald-400 to-teal-500 text-white"
                : "border border-indigo-200 bg-white/90 text-indigo-600")
            }
          >
            <Network size={15} className={running ? "animate-pulse" : "transition group-hover:rotate-12"} />
            <span className="hidden sm:inline">{running ? "Live \u00b7 " + activeAgents + " agents" : "Mind map"}</span>
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            title={configured ? "Active: " + providers.join(", ") : "No provider configured yet"}
            className={
              "group flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-white shadow-xl transition duration-200 hover:-translate-y-1 hover:shadow-2xl " +
              (configured
                ? "bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-400"
                : "bg-gradient-to-r from-amber-400 to-orange-500 animate-pulse")
            }
          >
            <KeyRound size={15} className="transition group-hover:rotate-12" />
            <span className="hidden sm:inline">
              {configured ? providers.length + " provider" + (providers.length === 1 ? "" : "s") : "Add keys"}
            </span>
          </button>
        </div>
      </div>

      {/* Mind map drawer */}
      {mapOpen && (
        <div className="fixed inset-x-0 bottom-0 z-[95] p-4 sm:inset-x-auto sm:right-5 sm:w-[760px]">
          <div className="relative">
            <button
              onClick={() => setMapOpen(false)}
              className="absolute -top-2 right-2 z-10 rounded-full bg-white p-1.5 text-slate-400 shadow-lg transition hover:rotate-90 hover:text-indigo-500"
              aria-label="Close mind map"
            >
              <X size={14} />
            </button>
            <MindMap />
          </div>
        </div>
      )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Shell />
  </React.StrictMode>
);
