/**
 * Local configuration vault (v2).
 *
 * Everything the app needs to talk to the outside world lives here, in this
 * browser only: AI provider keys, a GitHub personal access token, Firecrawl,
 * KlingAI, and the local Playwright companion URL.
 *
 * Nothing is uploaded, committed, or proxied through any Twin/GitHub service.
 * Values are written to localStorage on this device and sent only to the
 * service they belong to.
 */
import { PROVIDERS, PROVIDER_MAP } from "./providers";

export interface ProviderSettings {
  /** API key. Empty for keyless runtimes such as Ollama. */
  key: string;
  /** Enabled providers participate in routing. */
  enabled: boolean;
  /** Overridable endpoint, so a changed platform URL needs no rebuild. */
  endpoint: string;
  /** Comma-separated model list. Empty falls back to the registry defaults. */
  models: string;
  /** Routing order. Lower runs first. */
  priority: number;
}

export interface IntegrationSettings {
  githubToken: string;
  githubOwner: string;
  firecrawlKey: string;
  klingAccessKey: string;
  klingSecretKey: string;
  playwrightUrl: string;
}

export interface VaultConfig {
  providers: Record<string, ProviderSettings>;
  integrations: IntegrationSettings;
  /** Try each provider's free models before its paid models. */
  preferFree: boolean;
  /** Fallback read proxy for cross-origin page fetches. */
  corsProxy: string;
}

const STORAGE_KEY = "agentosirus.vault.v2";
const LEGACY_KEY = "agentosirus.keyvault.v1";

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

export function defaultConfig(): VaultConfig {
  const providers: Record<string, ProviderSettings> = {};
  PROVIDERS.forEach((p, index) => {
    providers[p.id] = {
      key: "",
      enabled: Boolean(p.keyless),
      endpoint: p.endpoint,
      models: "",
      priority: index
    };
  });
  return {
    providers,
    integrations: {
      githubToken: "",
      githubOwner: "",
      firecrawlKey: "",
      klingAccessKey: "",
      klingSecretKey: "",
      playwrightUrl: "http://localhost:8787"
    },
    preferFree: true,
    corsProxy: "https://r.jina.ai/"
  };
}

/** Carries v1 keys forward so an existing setup is not lost. */
function migrateLegacy(base: VaultConfig): VaultConfig {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return base;
    const old = JSON.parse(raw) as Record<string, string>;
    const pairs: Array<[string, string, string]> = [
      ["siliconflow", "siliconflowKey", "siliconflowModel"],
      ["openrouter", "openrouterKey", "openrouterModel"],
      ["gemini", "geminiKey", "geminiModel"]
    ];
    for (const [id, keyField, modelField] of pairs) {
      const key = clean(old[keyField]);
      if (!key) continue;
      base.providers[id].key = key;
      base.providers[id].enabled = true;
      const model = clean(old[modelField]);
      if (model) base.providers[id].models = model;
    }
    if (typeof old.corsProxy === "string") base.corsProxy = old.corsProxy.trim();
  } catch {
    // ignore malformed legacy data
  }
  return base;
}

export function loadConfig(): VaultConfig {
  const base = defaultConfig();
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return base;
  }
  if (!raw) return migrateLegacy(base);

  try {
    const parsed = JSON.parse(raw) as Partial<VaultConfig>;
    if (parsed.providers) {
      for (const id of Object.keys(base.providers)) {
        const saved = parsed.providers[id];
        if (!saved) continue;
        base.providers[id] = {
          key: clean(saved.key),
          enabled: Boolean(saved.enabled),
          endpoint: clean(saved.endpoint) || PROVIDER_MAP[id].endpoint,
          models: typeof saved.models === "string" ? saved.models : "",
          priority: typeof saved.priority === "number" ? saved.priority : base.providers[id].priority
        };
      }
    }
    if (parsed.integrations) {
      base.integrations = {
        githubToken: clean(parsed.integrations.githubToken),
        githubOwner: clean(parsed.integrations.githubOwner),
        firecrawlKey: clean(parsed.integrations.firecrawlKey),
        klingAccessKey: clean(parsed.integrations.klingAccessKey),
        klingSecretKey: clean(parsed.integrations.klingSecretKey),
        playwrightUrl: clean(parsed.integrations.playwrightUrl) || base.integrations.playwrightUrl
      };
    }
    if (typeof parsed.preferFree === "boolean") base.preferFree = parsed.preferFree;
    if (typeof parsed.corsProxy === "string") base.corsProxy = parsed.corsProxy.trim();
    return base;
  } catch {
    return base;
  }
}

export function saveConfig(config: VaultConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent("agentosirus:config-changed"));
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_KEY);
  window.dispatchEvent(new CustomEvent("agentosirus:config-changed"));
}

/** Providers that are enabled and usable, in routing order. */
export function routableProviders(config: VaultConfig = loadConfig()): string[] {
  return Object.keys(config.providers)
    .filter((id) => {
      const settings = config.providers[id];
      if (!settings.enabled) return false;
      return Boolean(settings.key) || Boolean(PROVIDER_MAP[id].keyless);
    })
    .sort((a, b) => config.providers[a].priority - config.providers[b].priority);
}

export function hasAnyProvider(config: VaultConfig = loadConfig()): boolean {
  return routableProviders(config).length > 0;
}

/** Resolved model list for a provider, honouring the free-first preference. */
export function modelsFor(id: string, config: VaultConfig): string[] {
  const def = PROVIDER_MAP[id];
  const settings = config.providers[id];
  const custom = (settings.models || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const ordered = config.preferFree
    ? [...def.freeModels, ...def.models]
    : [...def.models, ...def.freeModels];

  return Array.from(new Set([...custom, ...ordered]));
}
