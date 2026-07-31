/**
 * Provider registry.
 *
 * Every entry describes how to talk to one AI platform from the browser.
 * Most platforms expose an OpenAI-compatible /chat/completions endpoint, so
 * they share the "openai" protocol. Gemini and Anthropic use their own shapes.
 *
 * `freeModels` lists models that are free (or free-tier) on that platform.
 * When "Prefer free models" is enabled, routing tries those first.
 */
export type Protocol = "openai" | "gemini" | "anthropic" | "ollama";

export interface ProviderDef {
  id: string;
  label: string;
  protocol: Protocol;
  endpoint: string;
  /** Docs/console page where the user creates a key. */
  keyUrl: string;
  /** True when the provider needs no API key (local runtimes). */
  keyless?: boolean;
  /** Models known to be free or free-tier on this platform. */
  freeModels: string[];
  /** Strong paid/default models, tried when free routing is off or exhausted. */
  models: string[];
  /** Extra headers required by the platform. */
  headers?: Record<string, string>;
  /** Shown in the settings card. */
  hint: string;
  /** Browsers may block this origin; surfaced as a warning in the UI. */
  corsRisk?: boolean;
  accent: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "siliconflow",
    label: "SiliconFlow",
    protocol: "openai",
    endpoint: "https://api.siliconflow.cn/v1/chat/completions",
    keyUrl: "https://cloud.siliconflow.cn/account/ak",
    freeModels: [
      "Qwen/Qwen2.5-7B-Instruct",
      "THUDM/glm-4-9b-chat",
      "internlm/internlm2_5-7b-chat"
    ],
    models: [
      "Qwen/Qwen2.5-72B-Instruct",
      "deepseek-ai/DeepSeek-V3",
      "Qwen/Qwen2.5-Coder-32B-Instruct"
    ],
    hint: "Hosts Qwen, DeepSeek and GLM with a generous free tier.",
    accent: "sky"
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    protocol: "openai",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    keyUrl: "https://openrouter.ai/keys",
    freeModels: [
      "deepseek/deepseek-chat:free",
      "deepseek/deepseek-r1:free",
      "qwen/qwen-2.5-72b-instruct:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "google/gemma-2-9b-it:free"
    ],
    models: ["deepseek/deepseek-chat", "anthropic/claude-3.5-sonnet", "openai/gpt-4o-mini"],
    headers: { "X-Title": "AgentOsirus" },
    hint: "One key, hundreds of models, and a large catalogue of :free variants.",
    accent: "violet"
  },
  {
    id: "openai",
    label: "OpenAI",
    protocol: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    keyUrl: "https://platform.openai.com/api-keys",
    freeModels: [],
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
    hint: "GPT-4o family. No free tier, so paid models are used directly.",
    accent: "emerald"
  },
  {
    id: "anthropic",
    label: "Anthropic",
    protocol: "anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    keyUrl: "https://console.anthropic.com/settings/keys",
    freeModels: [],
    models: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-sonnet-4-20250514"],
    headers: { "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    hint: "Claude models. Direct browser calls are explicitly opted in.",
    accent: "orange"
  },
  {
    id: "gemini",
    label: "Google Gemini",
    protocol: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    keyUrl: "https://aistudio.google.com/apikey",
    freeModels: ["gemini-2.0-flash", "gemini-2.5-flash"],
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    hint: "AI Studio keys include a free tier on the Flash models.",
    accent: "blue"
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    protocol: "openai",
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    keyUrl: "https://platform.deepseek.com/api_keys",
    freeModels: [],
    models: ["deepseek-chat", "deepseek-reasoner"],
    hint: "Very low cost reasoning and chat models, direct from DeepSeek.",
    accent: "indigo"
  },
  {
    id: "qwen",
    label: "Qwen (DashScope)",
    protocol: "openai",
    endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    keyUrl: "https://bailian.console.alibabacloud.com/",
    freeModels: ["qwen-turbo", "qwen2.5-7b-instruct"],
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
    hint: "Alibaba DashScope. Turbo tier includes a free quota.",
    accent: "cyan"
  },
  {
    id: "kimi",
    label: "Kimi (Moonshot)",
    protocol: "openai",
    endpoint: "https://api.moonshot.ai/v1/chat/completions",
    keyUrl: "https://platform.moonshot.ai/console/api-keys",
    freeModels: [],
    models: ["kimi-k2-0905-preview", "moonshot-v1-8k", "moonshot-v1-128k"],
    hint: "Long-context Kimi models from Moonshot AI.",
    accent: "rose"
  },
  {
    id: "minimax",
    label: "MiniMax",
    protocol: "openai",
    endpoint: "https://api.minimax.io/v1/text/chatcompletion_v2",
    keyUrl: "https://www.minimax.io/platform/user-center/basic-information",
    freeModels: [],
    models: ["MiniMax-Text-01", "abab6.5s-chat"],
    hint: "MiniMax text models on an OpenAI-compatible route.",
    accent: "pink"
  },
  {
    id: "zai",
    label: "Z.ai (GLM)",
    protocol: "openai",
    endpoint: "https://api.z.ai/api/paas/v4/chat/completions",
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
    freeModels: ["glm-4-flash", "glm-4.5-flash"],
    models: ["glm-4.6", "glm-4.5-air", "glm-4-flash"],
    hint: "Zhipu GLM family. The Flash models are free to call.",
    accent: "teal"
  },
  {
    id: "stepfun",
    label: "StepFun",
    protocol: "openai",
    endpoint: "https://api.stepfun.com/v1/chat/completions",
    keyUrl: "https://platform.stepfun.com/interface-key",
    freeModels: ["step-1-flash"],
    models: ["step-2-16k", "step-1-8k", "step-1-flash"],
    hint: "StepFun Step-1 and Step-2 models.",
    accent: "amber"
  },
  {
    id: "groq",
    label: "Groq",
    protocol: "openai",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    keyUrl: "https://console.groq.com/keys",
    freeModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"],
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    hint: "Extremely fast inference with a free developer tier.",
    accent: "lime"
  },
  {
    id: "mistral",
    label: "Mistral",
    protocol: "openai",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    keyUrl: "https://console.mistral.ai/api-keys",
    freeModels: ["open-mistral-nemo", "mistral-small-latest"],
    models: ["mistral-large-latest", "mistral-small-latest"],
    hint: "Mistral models, including free open-weight endpoints.",
    accent: "fuchsia"
  },
  {
    id: "ollama",
    label: "Ollama (local, no key)",
    protocol: "ollama",
    endpoint: "http://localhost:11434/v1/chat/completions",
    keyUrl: "https://ollama.com/download",
    keyless: true,
    freeModels: ["llama3.2", "qwen2.5", "deepseek-r1", "mistral"],
    models: ["llama3.2", "qwen2.5"],
    hint: "Runs models on your own machine. Free forever, no API key needed.",
    accent: "slate"
  }
];

export const PROVIDER_MAP: Record<string, ProviderDef> =
  PROVIDERS.reduce((acc, p) => { acc[p.id] = p; return acc; }, {} as Record<string, ProviderDef>);

/** Media generation providers (image/video), kept separate from chat routing. */
export interface MediaProviderDef {
  id: string;
  label: string;
  keyUrl: string;
  hint: string;
}

export const MEDIA_PROVIDERS: MediaProviderDef[] = [
  {
    id: "klingai",
    label: "KlingAI",
    keyUrl: "https://app.klingai.com/global/dev/document-api",
    hint: "Image and video generation. Used by agents that produce visual media."
  }
];
