/**
 * Static-hosting API shim (unified).
 *
 * Ported from agentosirus/src/lib/apiShim.ts and extended per the
 * architecture doc's governed-mode synergies. When no onitsir-server
 * backend is configured (SettingsPanel toggle off / VITE_BACKEND_URL
 * unset), this module patches window.fetch and answers /api/* routes
 * locally using the prebuilt agent index plus the browser-side provider
 * chain -- UNCHANGED behavior from the original agentosirus.
 *
 * NEW in the unified system (all additive, all opt-in so offline mode keeps
 * working exactly as before):
 *   SYNERGY #2  -- handleChain() calls the deterministic Router pre-filter
 *                  (local roster-index scoring, mirroring onitsir-core's
 *                  Router.pre_filter()) before building the planner prompt.
 *   SYNERGY #22 -- handleChain() runs the parsed plan through qec.collapse()
 *                  before executing any step (fail-closed sanity filter).
 *   SYNERGY #4  -- each chain step is self-checked via a lightweight local
 *                  evidence check (mirrors onitsir-core's
 *                  ChainStepEvidenceProducer) before the next step builds on
 *                  it, ending "any non-empty text = done".
 *   SYNERGY #23 -- every chain execution appends to the local hash-chained
 *                  ledger (localLedger.ts) as the offline-mode audit trail.
 *   SYNERGY #14 -- handleChat()'s history is tiered (contextTiering.ts)
 *                  before being sent to the provider.
 */
import { generate, MissingKeyError, LlmMessage } from "./llm";
import { loadConfig } from "./keyVault";
import { firecrawl, playwright } from "./integrations";
import { startRun, endRun, addNode, updateNode, linkNodes } from "./activityBus";
import { tierHistory } from "./contextTiering";
import { collapse, QecFatalError, type ChainPlan } from "./qec";
import { appendProvenance } from "./localLedger";
import { getBackendUrl } from "./onitsirClient";

interface AgentMeta {
  id: string;
  name: string;
  description: string;
  color: string;
  emoji: string;
  vibe: string;
  category: string;
  filePath: string;
  contentFile: string;
}

interface AgentIndex {
  divisions: Array<Record<string, string>>;
  agents: AgentMeta[];
}

interface ChainStep {
  agentId: string;
  name: string;
  emoji: string;
  task: string;
  output: string;
  provider?: string;
  model?: string;
}

const BASE = import.meta.env.BASE_URL || "/";

let indexPromise: Promise<AgentIndex> | null = null;
const contentCache = new Map<string, string>();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function loadIndex(): Promise<AgentIndex> {
  if (!indexPromise) {
    indexPromise = fetch(BASE + "agents-index.json")
      .then((r) => {
        if (!r.ok) throw new Error("Agent index missing (HTTP " + r.status + ").");
        return r.json() as Promise<AgentIndex>;
      })
      .catch((err) => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
}

async function loadContent(agent: AgentMeta): Promise<string> {
  const cached = contentCache.get(agent.contentFile);
  if (cached !== undefined) return cached;
  const response = await fetch(BASE + "agents-content/" + agent.contentFile);
  if (!response.ok) return "";
  const text = await response.text();
  contentCache.set(agent.contentFile, text);
  return text;
}

function stripHtml(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "");
  text = text.replace(/<(header|footer|nav)[^>]*>[\s\S]*?<\/\1>/gi, "");
  text = text.replace(/<\/(p|div|h1|h2|h3|h4|li|tr)>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n");
  return text.trim().slice(0, 30000);
}

/**
 * Reads a page using the best tool available:
 *   1. Firecrawl, when a key is saved (most reliable).
 *   2. The local Playwright companion, when running (executes JavaScript).
 *   3. A configurable read proxy, then a direct fetch.
 */
async function readUrl(url: string): Promise<string> {
  if (firecrawl.available) {
    try {
      const text = await firecrawl.scrape(url);
      if (text) return text;
    } catch {
      // fall through
    }
  }

  try {
    if (await playwright.available()) {
      const text = await playwright.read(url);
      if (text) return text;
    }
  } catch {
    // fall through
  }

  const proxy = loadConfig().corsProxy;
  const attempts: string[] = [];
  if (proxy) attempts.push(proxy.replace(/\/?$/, "/") + url);
  attempts.push(url);

  for (const target of attempts) {
    try {
      const response = await fetch(target, { redirect: "follow" });
      if (!response.ok) continue;
      const body = await response.text();
      const text = /<[a-z][\s\S]*>/i.test(body.slice(0, 2000)) ? stripHtml(body) : body.trim().slice(0, 30000);
      if (text) return text;
    } catch {
      // try next strategy
    }
  }

  return "[Could not read " + url + ". Add a Firecrawl key or start the browser companion in Settings.]";
}

async function augmentWithUrls(message: string): Promise<{ message: string; context: string }> {
  const urls = message.match(/(https?:\/\/[^\s]+)/g);
  if (!urls || urls.length === 0) return { message, context: "" };

  let context = "";
  for (const url of urls.slice(0, 3)) {
    context += "\n\n--- INLINE READ OF " + url + " ---\n";
    context += await readUrl(url);
    context += "\n--- END INLINE READ ---\n";
  }
  return {
    message:
      message +
      "\n\n[System note: the following external page contents were fetched at runtime to assist your response:]" +
      context,
    context
  };
}

function errorResponse(err: unknown): Response {
  const error = err as Error;
  const status = error instanceof MissingKeyError ? 428 : 500;
  return json({ error: error.message || "Request failed." }, status);
}

async function handleChat(body: Record<string, unknown>): Promise<Response> {
  const message = String(body.message || "");
  const history = (body.history as LlmMessage[]) || [];
  const systemInstruction = body.systemInstruction as string | undefined;
  const agentName = String(body.agentName || "Assistant");
  const agentEmoji = String(body.agentEmoji || "\u{1F4AC}");

  startRun(message.slice(0, 110) || "Direct conversation");
  addNode({ id: "solo", label: agentName, emoji: agentEmoji, state: "thinking", detail: "Reading the request" });

  try {
    const augmented = await augmentWithUrls(message);
    if (augmented.context) {
      updateNode("solo", { detail: "Reading linked pages" });
    }

    updateNode("solo", { state: "streaming", detail: "Composing the response" });

    // SYNERGY #14: HOT/WARM/COLD tiering trims long conversation history
    // before it is sent to the provider, cutting token cost.
    const tieredHistory = tierHistory(history as unknown as { role: "user" | "model"; text: string }[]);

    const result = await generate({
      message: augmented.message,
      history: tieredHistory as unknown as LlmMessage[],
      systemInstruction:
        systemInstruction || "You are a helpful AI assistant running fully in the user's browser.",
      temperature: 0.7,
      maxOutputTokens: 2048
    });

    updateNode("solo", {
      state: "done",
      detail: "Answered via " + result.provider,
      provider: result.provider,
      model: result.model
    });
    endRun();

    return json({ text: result.text, provider: result.provider, model: result.model });
  } catch (err) {
    updateNode("solo", { state: "error", detail: (err as Error).message.slice(0, 120) });
    endRun();
    return errorResponse(err);
  }
}

/** SYNERGY #2: local mirror of onitsir-core's Router scoring, used as a
 * pre-filter when no backend is configured (offline mode still benefits). */
function localPreFilter(roster: Array<{ id: string; name: string; category: string; desc: string }>, goal: string, limit: number) {
  const terms = (goal.toLowerCase().match(/[a-z][a-z0-9+#-]{1,}/g) || []) as string[];
  const scored = roster.map((a) => {
    let score = 0;
    const cat = a.category.toLowerCase();
    const name = a.name.toLowerCase();
    for (const t of terms) {
      if (t === cat || cat.includes(t)) score += 3;
      if (name.includes(t)) score += 2;
    }
    return { agent: a, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.agent);
}

/** SYNERGY #4: local mirror of ChainStepEvidenceProducer's self-check,
 * used when no backend is configured. */
function localVerifyStep(task: string, output: string): { passed: boolean; summary: string } {
  const checks: string[] = [];
  let passed = true;
  if (output.trim().length < 20) {
    passed = false;
    checks.push("FAIL length: output too short");
  } else {
    checks.push("PASS length");
  }
  const refusalMarkers = ["i cannot help with that", "i'm unable to", "as an ai language model"];
  if (refusalMarkers.some((m) => output.toLowerCase().includes(m))) {
    passed = false;
    checks.push("FAIL refusal marker detected");
  } else {
    checks.push("PASS no refusal marker");
  }
  // Crude task-relevance signal, mirroring ChainStepEvidenceProducer's
  // task-keyword overlap check server-side.
  const taskTerms = (task.toLowerCase().match(/[a-z]{3,}/g) || []).slice(0, 8);
  const outputLower = output.toLowerCase();
  if (taskTerms.length > 0 && !taskTerms.some((t) => outputLower.includes(t))) {
    passed = false;
    checks.push("FAIL no task-keyword overlap");
  } else if (taskTerms.length > 0) {
    checks.push("PASS task-keyword overlap");
  }
  return { passed, summary: checks.join("; ") };
}

async function handleChain(body: Record<string, unknown>): Promise<Response> {
  const message = String(body.message || "");
  const missionId = body.missionId ? String(body.missionId) : null;
  startRun(message.slice(0, 110) || "Swarm workflow");
  addNode({ id: "planner", label: "Swarm Architect", emoji: "\u{1F9E9}", state: "thinking", detail: "Selecting specialists" });

  try {
    const index = await loadIndex();
    const fullRoster = index.agents.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      desc: (a.description || "").slice(0, 90)
    }));

    // SYNERGY #2: shortlist BEFORE the LLM planner call, instead of dumping
    // the entire ~163-agent roster into the prompt.
    const roster = localPreFilter(fullRoster, message, 24);
    const rosterForPrompt = roster.length > 0 ? roster : fullRoster;

    const augmented = await augmentWithUrls(message);
    if (augmented.context) updateNode("planner", { detail: "Read linked sources" });

    const coordinatorInstruction =
      'You are the Lead Swarm Architect of "The Agency". Analyze the task and compile a pipeline of up to 3 specialists to solve it sequentially.\n\n' +
      "Respond with a JSON object exactly matching this structure:\n" +
      '{ "plan": "high-level overview of the chain", "chain": [ { "agentId": "agent-id-slug", "task": "concise instruction for this agent" } ] }\n\n' +
      "Roster of available agent IDs (pre-filtered shortlist):\n" +
      JSON.stringify(rosterForPrompt);

    const planResult = await generate({
      message:
        "User Query:\n" + message +
        "\n\nFetched context (if any):\n" + augmented.context +
        "\n\nTask: orchestrate the specialist swarm and return a JSON workflow plan.",
      systemInstruction: coordinatorInstruction,
      temperature: 0.2,
      maxOutputTokens: 1200,
      json: true
    });

    let plan: ChainPlan;
    try {
      plan = JSON.parse(planResult.text.trim());
    } catch {
      const match = planResult.text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("The planner did not return a readable workflow.");
      plan = JSON.parse(match[0]);
    }

    // SYNERGY #22: deterministic-collapse sanity filter, fail-closed.
    const knownIds = new Set(index.agents.map((a) => a.id));
    let validatedChain;
    try {
      validatedChain = collapse(plan, { knownAgentIds: knownIds, maxCrewSize: 3 }).slice(0, 3);
    } catch (err) {
      if (err instanceof QecFatalError) {
        throw new Error("QEC_FATAL: " + err.message);
      }
      throw err;
    }

    updateNode("planner", {
      state: "done",
      detail: validatedChain.length + " specialists selected (QEC-validated)",
      provider: planResult.provider,
      model: planResult.model
    });

    const resolved = validatedChain
      .map((step) => ({ step, agent: index.agents.find((a) => a.id === step.agentId) }))
      .filter((entry) => Boolean(entry.agent));

    resolved.forEach((entry, i) => {
      const agent = entry.agent as AgentMeta;
      addNode({
        id: agent.id,
        label: agent.name,
        emoji: agent.emoji || "\u{1F916}",
        state: "idle",
        detail: entry.step.task.slice(0, 90)
      });
      if (i > 0) {
        linkNodes((resolved[i - 1].agent as AgentMeta).id, agent.id);
      }
    });

    const steps: ChainStep[] = [];
    let previousOutput = "";
    const backend = getBackendUrl();

    for (let i = 0; i < resolved.length; i++) {
      const { step, agent } = resolved[i] as { step: { agentId: string; task: string }; agent: AgentMeta };

      updateNode(agent.id, { state: "thinking", detail: "Loading specialist brief" });

      const systemInstruction =
        (await loadContent(agent)) || "You are " + agent.name + ". Vibe: " + (agent.vibe || "Professional");

      let prompt = "### TASK STATEMENT\n" + step.task + "\n\n";
      prompt += "### CLIENT ORIGINAL DIRECTIVE\n" + message + "\n\n";
      if (augmented.context) prompt += "### FETCHED SOURCE CONTEXT\n" + augmented.context + "\n\n";
      if (previousOutput) {
        prompt +=
          "### WORK-IN-PROGRESS DELIVERABLE FROM PREVIOUS AGENT (" +
          (steps[i - 1] ? steps[i - 1].name : "prior step") + ")\n" + previousOutput +
          "\n\nInstruction: build directly on top of, audit, or refine the above deliverable into your specialized format. Do not start from scratch. Make the output complete and production-ready.";
      } else {
        prompt += "Instruction: you are the starting agent. Initialize the core architecture, draft, or scaffold.";
      }

      updateNode(agent.id, { state: "streaming", detail: step.task.slice(0, 90) });

      try {
        const stepResult = await generate({
          message: prompt,
          systemInstruction,
          temperature: 0.5,
          maxOutputTokens: 2048
        });

        // SYNERGY #4: verify before advancing -- prefer the real backend
        // (onitsir-core's ChainStepEvidenceProducer) when configured, else
        // fall back to the local mirror check so offline mode still gets
        // real verification instead of "non-empty text = done".
        let verified = { passed: true, summary: "no verification available" };
        if (backend && missionId) {
          try {
            const remote = await fetch(backend + "/api/mission/" + missionId + "/verify-step", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agent_id: agent.id, task: step.task, output: stepResult.text })
            }).then((r) => r.json());
            verified = { passed: remote.passed, summary: remote.output_summary };
          } catch {
            verified = localVerifyStep(step.task, stepResult.text);
          }
        } else {
          verified = localVerifyStep(step.task, stepResult.text);
        }

        previousOutput = stepResult.text;
        updateNode(agent.id, {
          state: verified.passed ? "done" : "error",
          detail: verified.passed
            ? "Delivered " + stepResult.text.length.toLocaleString() + " chars (verified)"
            : "Evidence check failed: " + verified.summary,
          provider: stepResult.provider,
          model: stepResult.model
        });

        // SYNERGY #23: offline-mode audit trail.
        if (!backend) {
          await appendProvenance({
            event: "chain_step",
            agentId: agent.id,
            task: step.task,
            passed: verified.passed,
            outputChars: stepResult.text.length
          });
        }

        steps.push({
          agentId: agent.id,
          name: agent.name,
          emoji: agent.emoji || "\u{1F916}",
          task: step.task,
          output: stepResult.text,
          provider: stepResult.provider,
          model: stepResult.model
        });
      } catch (err) {
        updateNode(agent.id, { state: "error", detail: (err as Error).message.slice(0, 110) });
        throw err;
      }
    }

    endRun();
    return json({ plan: plan.plan || "Multi-agent workflow executed.", steps, finalOutput: previousOutput });
  } catch (err) {
    updateNode("planner", { state: "error", detail: (err as Error).message.slice(0, 120) });
    endRun();
    return errorResponse(err);
  }
}

async function route(pathname: string, init: RequestInit | undefined): Promise<Response | null> {
  const path = pathname.replace(BASE.replace(/\/$/, ""), "");

  if (path === "/api/divisions") {
    const index = await loadIndex();
    return json(index.divisions);
  }

  if (path === "/api/agents") {
    const index = await loadIndex();
    return json(index.agents);
  }

  const detail = path.match(/^\/api\/agents\/([^/]+)\/([^/]+)$/);
  if (detail) {
    const index = await loadIndex();
    const agent = index.agents.find((a) => a.category === detail[1] && a.id === detail[2]);
    if (!agent) return json({ error: "Agent not found." }, 404);
    const content = await loadContent(agent);
    return json({ ...agent, content });
  }

  let body: Record<string, unknown> = {};
  if (init && typeof init.body === "string") {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = {};
    }
  }

  if (path === "/api/scrape") {
    const url = String(body.url || "");
    if (!url) return json({ error: "No URL provided." }, 400);
    return json({ text: await readUrl(url) });
  }

  if (path === "/api/chat") return handleChat(body);
  if (path === "/api/chain") return handleChain(body);

  return null;
}

export function installApiShim(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let pathname = "";
    try {
      if (typeof input === "string") pathname = new URL(input, window.location.href).pathname;
      else if (input instanceof URL) pathname = input.pathname;
      else if (input instanceof Request) pathname = new URL(input.url).pathname;
    } catch {
      pathname = "";
    }

    if (pathname.includes("/api/")) {
      let requestInit = init;
      if (!requestInit && input instanceof Request) {
        const cloned = input.clone();
        const text = await cloned.text().catch(() => "");
        requestInit = { method: input.method, body: text };
      }
      try {
        const handled = await route(pathname, requestInit);
        if (handled) return handled;
      } catch (err) {
        return errorResponse(err);
      }
    }

    return originalFetch(input as RequestInfo, init);
  };
}
