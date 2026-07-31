/**
 * Multi-provider routing engine (browser-side).
 *
 * Walks every enabled provider in priority order, and within each provider
 * walks its model list. Free models come first when "Prefer free models" is on.
 * The first successful response wins; failures fall through to the next option.
 */
import { loadConfig, modelsFor, routableProviders, VaultConfig } from "./keyVault";
import { PROVIDER_MAP, ProviderDef } from "./providers";

export interface LlmMessage {
  role: "user" | "model" | "assistant" | "system";
  text: string;
}

export interface GenerateParams {
  message: string;
  history?: LlmMessage[];
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  json?: boolean;
}

export interface GenerateResult {
  text: string;
  provider: string;
  model: string;
}

const TIMEOUT_MS = 60000;

export class MissingKeyError extends Error {
  constructor() {
    super("No AI provider is enabled yet. Open Settings and add a key, or enable Ollama to run locally.");
    this.name = "MissingKeyError";
  }
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function chatMessages(params: GenerateParams): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];
  if (params.systemInstruction) out.push({ role: "system", content: params.systemInstruction });
  for (const entry of params.history || []) {
    if (!entry || !entry.text) continue;
    out.push({
      role: entry.role === "model" || entry.role === "assistant" ? "assistant" : "user",
      content: entry.text
    });
  }
  out.push({ role: "user", content: params.message });
  return out;
}

function isFatalAuth(status: number): boolean {
  return status === 401 || status === 403;
}

async function callOpenAiStyle(
  def: ProviderDef,
  endpoint: string,
  apiKey: string,
  model: string,
  params: GenerateParams
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages: chatMessages(params),
    temperature: params.temperature ?? 0.7,
    max_tokens: params.maxOutputTokens || 2048
  };
  if (params.json) body.response_format = { type: "json_object" };

  const headers: Record<string, string> = { "Content-Type": "application/json", ...(def.headers || {}) };
  if (apiKey) headers.Authorization = "Bearer " + apiKey;
  if (def.id === "openrouter") headers["HTTP-Referer"] = window.location.origin;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: timeoutSignal(TIMEOUT_MS)
  });

  if (!response.ok) {
    const detail = await response.text();
    const err = new Error(def.label + " " + response.status + ": " + detail.slice(0, 240));
    (err as Error & { fatal?: boolean }).fatal = isFatalAuth(response.status);
    throw err;
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function callGemini(
  def: ProviderDef,
  endpoint: string,
  apiKey: string,
  model: string,
  params: GenerateParams
): Promise<string> {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const entry of params.history || []) {
    if (!entry || !entry.text) continue;
    contents.push({
      role: entry.role === "model" || entry.role === "assistant" ? "model" : "user",
      parts: [{ text: entry.text }]
    });
  }
  contents.push({ role: "user", parts: [{ text: params.message }] });

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: params.temperature ?? 0.7,
      maxOutputTokens: params.maxOutputTokens || 2048,
      ...(params.json ? { responseMimeType: "application/json" } : {})
    }
  };
  if (params.systemInstruction) body.systemInstruction = { parts: [{ text: params.systemInstruction }] };

  const url = endpoint.replace(/\/$/, "") + "/" + encodeURIComponent(model) +
    ":generateContent?key=" + encodeURIComponent(apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: timeoutSignal(TIMEOUT_MS)
  });

  if (!response.ok) {
    const detail = await response.text();
    const err = new Error(def.label + " " + response.status + ": " + detail.slice(0, 240));
    (err as Error & { fatal?: boolean }).fatal =
      isFatalAuth(response.status) || /API key not valid/i.test(detail);
    throw err;
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p: { text?: string }) => p.text || "").join("").trim();
}

async function callAnthropic(
  def: ProviderDef,
  endpoint: string,
  apiKey: string,
  model: string,
  params: GenerateParams
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  for (const entry of params.history || []) {
    if (!entry || !entry.text) continue;
    messages.push({
      role: entry.role === "model" || entry.role === "assistant" ? "assistant" : "user",
      content: entry.text
    });
  }
  messages.push({ role: "user", content: params.message });

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: params.maxOutputTokens || 2048,
    temperature: params.temperature ?? 0.7
  };
  if (params.systemInstruction) body.system = params.systemInstruction;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...(def.headers || {})
    },
    body: JSON.stringify(body),
    signal: timeoutSignal(TIMEOUT_MS)
  });

  if (!response.ok) {
    const detail = await response.text();
    const err = new Error(def.label + " " + response.status + ": " + detail.slice(0, 240));
    (err as Error & { fatal?: boolean }).fatal = isFatalAuth(response.status);
    throw err;
  }

  const data = await response.json();
  const blocks = data?.content || [];
  return blocks.map((b: { text?: string }) => b.text || "").join("").trim();
}

async function callOne(
  def: ProviderDef,
  endpoint: string,
  apiKey: string,
  model: string,
  params: GenerateParams
): Promise<string> {
  if (def.protocol === "gemini") return callGemini(def, endpoint, apiKey, model, params);
  if (def.protocol === "anthropic") return callAnthropic(def, endpoint, apiKey, model, params);
  return callOpenAiStyle(def, endpoint, apiKey, model, params);
}

export async function generate(params: GenerateParams, override?: VaultConfig): Promise<GenerateResult> {
  const config = override || loadConfig();
  const order = routableProviders(config);
  if (order.length === 0) throw new MissingKeyError();

  const failures: string[] = [];

  for (const id of order) {
    const def = PROVIDER_MAP[id];
    const settings = config.providers[id];
    const models = modelsFor(id, config);

    for (const model of models) {
      try {
        const text = await callOne(def, settings.endpoint, settings.key, model, params);
        if (text && text.trim()) return { text, provider: def.label, model };
        failures.push(def.label + "/" + model + ": empty response");
      } catch (err) {
        const error = err as Error & { fatal?: boolean };
        failures.push(error.message);
        // A bad key will fail for every model, so skip the rest of this provider.
        if (error.fatal) break;
      }
    }
  }

  throw new Error("Every enabled provider failed. " + failures.slice(0, 4).join(" | "));
}

/** Single-provider probe used by the Settings "Test" buttons. */
export async function testProvider(id: string, config: VaultConfig): Promise<GenerateResult> {
  const def = PROVIDER_MAP[id];
  const settings = config.providers[id];
  const models = modelsFor(id, config);
  const probe: GenerateParams = {
    message: "Reply with the single word: READY",
    maxOutputTokens: 16,
    temperature: 0
  };

  let lastError: Error | null = null;
  for (const model of models.slice(0, 3)) {
    try {
      const text = await callOne(def, settings.endpoint, settings.key, model, probe);
      if (text && text.trim()) return { text: text.trim(), provider: def.label, model };
      lastError = new Error("Empty response from " + model);
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw lastError || new Error("No model responded.");
}

/** Lists locally installed Ollama models, for the Settings panel. */
export async function listOllamaModels(baseEndpoint: string): Promise<string[]> {
  const root = baseEndpoint.replace(/\/v1\/chat\/completions\/?$/, "");
  const response = await fetch(root.replace(/\/$/, "") + "/api/tags", {
    signal: timeoutSignal(8000)
  });
  if (!response.ok) throw new Error("Ollama not reachable (HTTP " + response.status + ").");
  const data = await response.json();
  return (data?.models || []).map((m: { name?: string }) => m.name || "").filter(Boolean);
}
