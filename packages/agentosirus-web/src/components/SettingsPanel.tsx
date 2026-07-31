import { useEffect, useState } from "react";
import {
  Key, X, Check, Loader2, Trash2, ShieldCheck, AlertTriangle, Eye, EyeOff,
  Github, Globe, Chrome, Clapperboard, Zap, Server, RefreshCw
} from "lucide-react";
import { VaultConfig, loadConfig, saveConfig, clearConfig, defaultConfig } from "../lib/keyVault";
import { testProvider, listOllamaModels } from "../lib/llm";
import { PROVIDERS } from "../lib/providers";
import { github, playwright } from "../lib/integrations";
import { setBackendUrl, getBackendUrl } from "../lib/onitsirClient";

// SYNERGY #5: localStorage key shared with main.tsx's resolveBackendUrl().
const BACKEND_URL_KEY = "agentosirus.backend_url";

type TestState = { status: "idle" | "testing" | "ok" | "fail"; detail?: string };
type Tab = "models" | "integrations";

interface Props {
  open: boolean;
  onClose: () => void;
}

const ACCENT: Record<string, string> = {
  sky: "from-sky-400 to-blue-500",
  violet: "from-violet-400 to-purple-500",
  emerald: "from-emerald-400 to-teal-500",
  orange: "from-orange-400 to-amber-500",
  blue: "from-blue-400 to-indigo-500",
  indigo: "from-indigo-400 to-violet-500",
  cyan: "from-cyan-400 to-sky-500",
  rose: "from-rose-400 to-pink-500",
  pink: "from-pink-400 to-fuchsia-500",
  teal: "from-teal-400 to-emerald-500",
  amber: "from-amber-400 to-yellow-500",
  lime: "from-lime-400 to-green-500",
  fuchsia: "from-fuchsia-400 to-purple-500",
  slate: "from-slate-400 to-slate-600"
};

export function SettingsPanel({ open, onClose }: Props) {
  // SYNERGY #5: "Use ONITSIR backend" toggle -- switches agentosirus from
  // static/client-only mode (apiShim.ts answers /api/*) to ONITSIR-backed
  // mode (onitsir-server answers /api/* for real, governed missions).
  const [backendUrl, setBackendUrlField] = useState(getBackendUrl() || "");

  const [tab, setTab] = useState<Tab>("models");
  const [config, setConfig] = useState<VaultConfig>(loadConfig());
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [ghState, setGhState] = useState<TestState>({ status: "idle" });
  const [pwState, setPwState] = useState<TestState>({ status: "idle" });
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setConfig(loadConfig());
      setSaved(false);
    }
  }, [open]);

  if (!open) return null;

  const persist = (next: VaultConfig) => {
    setConfig(next);
    setSaved(false);
  };

  const setProvider = (id: string, patch: Partial<VaultConfig["providers"][string]>) => {
    persist({ ...config, providers: { ...config.providers, [id]: { ...config.providers[id], ...patch } } });
  };

  const setIntegration = (patch: Partial<VaultConfig["integrations"]>) => {
    persist({ ...config, integrations: { ...config.integrations, ...patch } });
  };

  const save = () => {
    saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const runTest = async (id: string) => {
    saveConfig(config);
    setTests((prev) => ({ ...prev, [id]: { status: "testing" } }));
    try {
      const result = await testProvider(id, config);
      setTests((prev) => ({ ...prev, [id]: { status: "ok", detail: "Live on " + result.model } }));
      setProvider(id, { enabled: true });
    } catch (err) {
      setTests((prev) => ({ ...prev, [id]: { status: "fail", detail: (err as Error).message.slice(0, 150) } }));
    }
  };

  const testGithub = async () => {
    saveConfig(config);
    setGhState({ status: "testing" });
    try {
      const who = await github.whoami();
      setGhState({ status: "ok", detail: "Connected as " + who.login + " (" + who.scopes + ")" });
      if (!config.integrations.githubOwner) setIntegration({ githubOwner: who.login });
    } catch (err) {
      setGhState({ status: "fail", detail: (err as Error).message.slice(0, 150) });
    }
  };

  const testPlaywright = async () => {
    saveConfig(config);
    setPwState({ status: "testing" });
    try {
      const ok = await playwright.available();
      setPwState(ok
        ? { status: "ok", detail: "Browser companion is online" }
        : { status: "fail", detail: "Not reachable. Start it with: cd companion && npm install && npm start" });
    } catch (err) {
      setPwState({ status: "fail", detail: (err as Error).message.slice(0, 150) });
    }
  };

  const refreshOllama = async () => {
    try {
      const models = await listOllamaModels(config.providers.ollama.endpoint);
      setOllamaModels(models);
      if (models.length) setProvider("ollama", { models: models.slice(0, 4).join(", "), enabled: true });
    } catch (err) {
      setTests((prev) => ({ ...prev, ollama: { status: "fail", detail: (err as Error).message.slice(0, 150) } }));
    }
  };

  const wipe = () => {
    clearConfig();
    setConfig(defaultConfig());
    setTests({});
    setGhState({ status: "idle" });
    setPwState({ status: "idle" });
  };

  const activeCount = Object.keys(config.providers).filter((id) => {
    const s = config.providers[id];
    return s.enabled && (s.key || PROVIDERS.find((p) => p.id === id)?.keyless);
  }).length;

  const field =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="relative w-full max-w-3xl rounded-3xl border border-white/80 bg-gradient-to-br from-white via-indigo-50/40 to-fuchsia-50/40 p-6 shadow-[0_30px_80px_-30px_rgba(79,70,229,0.55)]">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 transition hover:rotate-90 hover:bg-white hover:text-indigo-500"
          aria-label="Close settings"
        >
          <X size={18} />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-amber-400 text-white shadow-lg">
            <Key size={20} />
          </div>
          <div>
            <h2 className="font-display text-xl font-extrabold text-slate-900">Control Room</h2>
            <p className="text-xs text-slate-500">
              {activeCount} provider{activeCount === 1 ? "" : "s"} ready. Everything stays in this browser.
            </p>
          </div>
        </div>

        <div className="mb-5 flex items-start gap-2 rounded-2xl border border-indigo-100 bg-white/80 p-3 text-xs text-slate-600">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-indigo-500" />
          <span>
            Keys and tokens are saved to this device only and sent straight to the service they belong to.
            Nothing is committed to your repository or routed through a third party.
          </span>
        </div>

        <div className="mb-5 flex gap-2">
          {([["models", "AI Models", Zap], ["integrations", "Integrations", Server]] as const).map(
            ([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={
                  "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition duration-200 hover:-translate-y-0.5 " +
                  (tab === id
                    ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-lg"
                    : "bg-white text-slate-500 hover:text-indigo-600 hover:shadow")
                }
              >
                <Icon size={14} /> {label}
              </button>
            )
          )}
        </div>

        {tab === "models" && (
          <>
            <label className="mb-4 flex cursor-pointer items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
              <span className="text-xs font-semibold text-emerald-900">
                Prefer free models
                <span className="ml-2 font-normal text-emerald-700">
                  Route to each platform&apos;s free tier before any paid model.
                </span>
              </span>
              <input
                type="checkbox"
                checked={config.preferFree}
                onChange={(e) => persist({ ...config, preferFree: e.target.checked })}
                className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-slate-300 transition checked:bg-emerald-500"
              />
            </label>

            <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
              {PROVIDERS.map((provider) => {
                const settings = config.providers[provider.id];
                const test = tests[provider.id] || { status: "idle" };
                const usable = Boolean(settings.key) || Boolean(provider.keyless);
                return (
                  <div
                    key={provider.id}
                    className={
                      "rounded-2xl border bg-white/90 p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg " +
                      (settings.enabled && usable ? "border-indigo-200 shadow-sm" : "border-slate-200")
                    }
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            "flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-bold text-white shadow " +
                            (ACCENT[provider.accent] || ACCENT.slate)
                          }
                        >
                          {provider.label.slice(0, 2)}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{provider.label}</p>
                          <p className="text-[11px] text-slate-500">{provider.hint}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {provider.freeModels.length > 0 && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                            {provider.freeModels.length} free
                          </span>
                        )}
                        <label className="flex cursor-pointer items-center gap-1 text-[10px] font-bold uppercase text-slate-500">
                          <input
                            type="checkbox"
                            checked={settings.enabled}
                            onChange={(e) => setProvider(provider.id, { enabled: e.target.checked })}
                            className="h-4 w-4 cursor-pointer rounded"
                          />
                          on
                        </label>
                      </div>
                    </div>

                    {provider.keyless ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={settings.endpoint}
                          onChange={(e) => setProvider(provider.id, { endpoint: e.target.value })}
                          className={field + " flex-1"}
                          placeholder="http://localhost:11434/v1/chat/completions"
                        />
                        <button
                          onClick={refreshOllama}
                          className="flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-2 text-[11px] font-bold uppercase text-white transition hover:-translate-y-0.5 hover:bg-slate-700"
                        >
                          <RefreshCw size={13} /> Detect
                        </button>
                        {ollamaModels.length > 0 && (
                          <p className="w-full text-[11px] text-emerald-600">
                            Found locally: {ollamaModels.slice(0, 6).join(", ")}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type={reveal[provider.id] ? "text" : "password"}
                            value={settings.key}
                            onChange={(e) => setProvider(provider.id, { key: e.target.value })}
                            placeholder="Paste API key"
                            autoComplete="off"
                            spellCheck={false}
                            className={field + " pr-9"}
                          />
                          <button
                            type="button"
                            onClick={() => setReveal((p) => ({ ...p, [provider.id]: !p[provider.id] }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500"
                            aria-label="Toggle visibility"
                          >
                            {reveal[provider.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                        <button
                          onClick={() => runTest(provider.id)}
                          disabled={!settings.key || test.status === "testing"}
                          className="flex w-20 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 py-2 text-[11px] font-bold uppercase text-white shadow transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {test.status === "testing" ? <Loader2 size={14} className="animate-spin" /> : "Test"}
                        </button>
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={settings.models}
                        onChange={(e) => setProvider(provider.id, { models: e.target.value })}
                        placeholder={"Optional model override, e.g. " + (provider.freeModels[0] || provider.models[0])}
                        spellCheck={false}
                        className={field + " flex-1 text-[11px]"}
                      />
                      <a
                        href={provider.keyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase text-slate-600 transition hover:bg-indigo-100 hover:text-indigo-700"
                      >
                        get key
                      </a>
                    </div>

                    {test.status === "ok" && (
                      <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                        <Check size={12} /> {test.detail}
                      </p>
                    )}
                    {test.status === "fail" && (
                      <p className="mt-2 flex items-start gap-1 text-[11px] text-rose-600">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {test.detail}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "integrations" && (
          <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            <div className="rounded-2xl border border-slate-800/10 bg-white/90 p-4 transition hover:shadow-lg">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <Github size={16} />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800">GitHub Personal Access Token</p>
                  <p className="text-[11px] text-slate-500">
                    Full repo access: read and write files, create repos and issues, inspect Actions.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={reveal.github ? "text" : "password"}
                    value={config.integrations.githubToken}
                    onChange={(e) => setIntegration({ githubToken: e.target.value })}
                    placeholder="ghp_... or github_pat_..."
                    autoComplete="off"
                    spellCheck={false}
                    className={field + " pr-9"}
                  />
                  <button
                    type="button"
                    onClick={() => setReveal((p) => ({ ...p, github: !p.github }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500"
                    aria-label="Toggle visibility"
                  >
                    {reveal.github ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button
                  onClick={testGithub}
                  disabled={!config.integrations.githubToken || ghState.status === "testing"}
                  className="flex w-24 items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-bold uppercase text-white transition hover:-translate-y-0.5 disabled:opacity-40"
                >
                  {ghState.status === "testing" ? <Loader2 size={14} className="animate-spin" /> : "Verify"}
                </button>
              </div>
              <input
                type="text"
                value={config.integrations.githubOwner}
                onChange={(e) => setIntegration({ githubOwner: e.target.value })}
                placeholder="Default owner/org for repo actions"
                className={field + " mt-2 text-[11px]"}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,workflow,read:org&description=AgentOsirus"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase text-slate-600 transition hover:bg-slate-900 hover:text-white"
                >
                  create token
                </a>
                <span className="text-[10px] text-slate-400">Recommended scopes: repo, workflow, read:org</span>
              </div>
              {ghState.status === "ok" && (
                <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                  <Check size={12} /> {ghState.detail}
                </p>
              )}
              {ghState.status === "fail" && (
                <p className="mt-2 flex items-start gap-1 text-[11px] text-rose-600">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {ghState.detail}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-orange-100 bg-white/90 p-4 transition hover:shadow-lg">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 text-white">
                  <Globe size={16} />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800">Firecrawl</p>
                  <p className="text-[11px] text-slate-500">
                    Reliable web reading and crawling. Used first whenever an agent needs a page.
                  </p>
                </div>
              </div>
              <div className="relative">
                <input
                  type={reveal.firecrawl ? "text" : "password"}
                  value={config.integrations.firecrawlKey}
                  onChange={(e) => setIntegration({ firecrawlKey: e.target.value })}
                  placeholder="fc-..."
                  autoComplete="off"
                  spellCheck={false}
                  className={field + " pr-9"}
                />
                <button
                  type="button"
                  onClick={() => setReveal((p) => ({ ...p, firecrawl: !p.firecrawl }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500"
                  aria-label="Toggle visibility"
                >
                  {reveal.firecrawl ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <a
                href="https://www.firecrawl.dev/app/api-keys"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block rounded-lg bg-orange-50 px-2.5 py-1.5 text-[10px] font-bold uppercase text-orange-700 transition hover:bg-orange-500 hover:text-white"
              >
                get key
              </a>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4 transition hover:shadow-lg">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white">
                  <Chrome size={16} />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800">Browser companion (Playwright)</p>
                  <p className="text-[11px] text-slate-500">
                    A real browser the agents open on demand to navigate, click, type, and screenshot.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.integrations.playwrightUrl}
                  onChange={(e) => setIntegration({ playwrightUrl: e.target.value })}
                  placeholder="http://localhost:8787"
                  className={field + " flex-1"}
                />
                <button
                  onClick={testPlaywright}
                  className="flex w-24 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2 text-[11px] font-bold uppercase text-white transition hover:-translate-y-0.5"
                >
                  {pwState.status === "testing" ? <Loader2 size={14} className="animate-spin" /> : "Connect"}
                </button>
              </div>
              <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 font-mono text-[10px] text-slate-500">
                cd companion &amp;&amp; npm install &amp;&amp; npm start
              </p>
              {pwState.status === "ok" && (
                <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                  <Check size={12} /> {pwState.detail}
                </p>
              )}
              {pwState.status === "fail" && (
                <p className="mt-2 flex items-start gap-1 text-[11px] text-rose-600">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {pwState.detail}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-fuchsia-100 bg-white/90 p-4 transition hover:shadow-lg">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-400 to-pink-500 text-white">
                  <Clapperboard size={16} />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800">KlingAI</p>
                  <p className="text-[11px] text-slate-500">
                    Image and video generation. Signed through the browser companion for safety.
                  </p>
                </div>
              </div>
              <input
                type="text"
                value={config.integrations.klingAccessKey}
                onChange={(e) => setIntegration({ klingAccessKey: e.target.value })}
                placeholder="Access key"
                spellCheck={false}
                className={field}
              />
              <input
                type="password"
                value={config.integrations.klingSecretKey}
                onChange={(e) => setIntegration({ klingSecretKey: e.target.value })}
                placeholder="Secret key"
                autoComplete="off"
                spellCheck={false}
                className={field + " mt-2"}
              />
              <a
                href="https://app.klingai.com/global/dev/document-api"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block rounded-lg bg-fuchsia-50 px-2.5 py-1.5 text-[10px] font-bold uppercase text-fuchsia-700 transition hover:bg-fuchsia-500 hover:text-white"
              >
                get keys
              </a>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
              <p className="text-sm font-bold text-slate-800">Fallback read proxy</p>
              <p className="mb-2 text-[11px] text-slate-500">
                Used only when Firecrawl and the browser companion are both unavailable.
              </p>
              <input
                type="text"
                value={config.corsProxy}
                onChange={(e) => persist({ ...config, corsProxy: e.target.value })}
                placeholder="https://r.jina.ai/"
                className={field}
              />
            </div>

            {/* SYNERGY #5: real backend toggle -- when set, apiShim.ts is
                bypassed entirely and agentosirus talks to onitsir-server's
                real governed /api/* implementation. */}
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
              <p className="text-sm font-bold text-indigo-900">ONITSIR backend (governed mode)</p>
              <p className="mb-2 text-[11px] text-indigo-700">
                Point at a running onitsir-server to enable real Governor gating, Iron Law verification, HITL prompts, and the audit ledger. Leave blank to keep running fully client-side.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={backendUrl}
                  onChange={(e) => setBackendUrlField(e.target.value)}
                  placeholder="http://localhost:8000"
                  className={field}
                />
                <button
                  onClick={() => {
                    const trimmed = backendUrl.trim();
                    try {
                      if (trimmed) localStorage.setItem(BACKEND_URL_KEY, trimmed);
                      else localStorage.removeItem(BACKEND_URL_KEY);
                    } catch {
                      // localStorage may be unavailable; setBackendUrl still applies in-memory.
                    }
                    setBackendUrl(trimmed || null);
                    window.location.reload();
                  }}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-indigo-500"
                >
                  Apply &amp; reload
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/80 pt-4">
          <button
            onClick={wipe}
            className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-[11px] font-bold uppercase text-rose-500 transition hover:-translate-y-0.5 hover:bg-rose-50"
          >
            <Trash2 size={14} /> Wipe everything
          </button>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs font-bold text-emerald-600">Saved</span>}
            <button
              onClick={save}
              className="rounded-xl bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-400 px-6 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-2xl"
            >
              Save all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
