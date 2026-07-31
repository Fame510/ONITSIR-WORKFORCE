/**
 * Tool integrations available to the agents.
 *
 * Each one reads its credential from the local vault at call time, so a key
 * pasted in Settings is usable immediately.
 *
 *   GitHub      - full repo access via a personal access token
 *   Firecrawl   - reliable server-side crawling and scraping
 *   Playwright  - real browser control via the local companion service
 *   KlingAI     - image and video generation
 *
 * SYNERGY #7 (Evidence-wrap tool-integration side effects): `asEvidence()`
 * wraps a side-effecting call (GitHub writeFile/createIssue/createRepo, a
 * Firecrawl scrape, ...) so its outcome is recorded as onitsir-core
 * `Evidence` (command = the API call signature, output = the response,
 * passed = HTTP 2xx / no thrown error) and POSTed to
 * `/api/mission/:id/evidence`. `Workflow.complete_current()` on the Python
 * side consumes it directly -- this applies the Iron Law beyond LLM text
 * generation to real side-effecting actions.
 */
import { loadConfig } from "./keyVault";
import { getBackendUrl } from "./onitsirClient";

/**
 * SYNERGY #7: run `fn()`, capture success/failure as Evidence-shaped JSON,
 * and (when a backend is configured) POST it to
 * `/api/mission/:id/evidence`. Always returns/rethrows fn()'s own result/
 * error so callers behave exactly as before -- this is a pure side-channel.
 */
export async function asEvidence<T>(
  missionId: string | null,
  toolName: string,
  callSignature: string,
  fn: () => Promise<T>
): Promise<T> {
  let output = "";
  let passed = false;
  try {
    const result = await fn();
    output = typeof result === "string" ? result : JSON.stringify(result).slice(0, 2000);
    passed = true;
    return result;
  } catch (err) {
    output = "ERROR: " + (err as Error).message;
    passed = false;
    throw err;
  } finally {
    const backend = getBackendUrl();
    if (backend && missionId) {
      try {
        await fetch(backend + "/api/mission/" + missionId + "/evidence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool_name: toolName, command: callSignature, output, passed })
        });
      } catch {
        // Evidence posting is best-effort; never let it break the tool call.
      }
    }
  }
}

const GITHUB_API = "https://api.github.com";

function requireToken(): string {
  const token = loadConfig().integrations.githubToken;
  if (!token) throw new Error("No GitHub token saved. Add a personal access token in Settings.");
  return token;
}

async function githubRequest(
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  const token = requireToken();
  const response = await fetch(GITHUB_API + path, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: "Bearer " + token,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : String(text).slice(0, 200);
    throw new Error("GitHub " + response.status + ": " + message);
  }
  return payload;
}

export const github = {
  /** Confirms the token works and returns the account it belongs to. */
  async whoami(): Promise<{ login: string; name: string; scopes: string }> {
    const token = requireToken();
    const response = await fetch(GITHUB_API + "/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token
      }
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error("GitHub " + response.status + ": " + detail.slice(0, 200));
    }
    const scopes = response.headers.get("x-oauth-scopes") || "fine-grained token";
    const data = await response.json();
    return { login: data.login, name: data.name || data.login, scopes };
  },

  listRepos(perPage = 100): Promise<unknown> {
    return githubRequest("/user/repos?per_page=" + perPage + "&sort=updated");
  },

  listBranches(owner: string, repo: string): Promise<unknown> {
    return githubRequest("/repos/" + owner + "/" + repo + "/branches?per_page=100");
  },

  getTree(owner: string, repo: string, ref = "HEAD"): Promise<unknown> {
    return githubRequest("/repos/" + owner + "/" + repo + "/git/trees/" + ref + "?recursive=1");
  },

  async readFile(owner: string, repo: string, path: string, ref?: string): Promise<{ text: string; sha: string }> {
    const query = ref ? "?ref=" + encodeURIComponent(ref) : "";
    const data = (await githubRequest(
      "/repos/" + owner + "/" + repo + "/contents/" + path + query
    )) as { content?: string; sha: string };
    const text = data.content ? atob(data.content.replace(/\n/g, "")) : "";
    return { text, sha: data.sha };
  },

  /** SYNERGY #7: writeFile is evidence-wrapped -- pass a `missionId` (or
   * null to skip evidence posting, e.g. outside a governed mission) so the
   * write's outcome is recorded as onitsir-core Evidence via
   * POST /api/mission/:id/evidence. */
  async writeFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch?: string,
    missionId: string | null = null
  ): Promise<unknown> {
    const callSignature = "PUT /repos/" + owner + "/" + repo + "/contents/" + path;
    return asEvidence(missionId, "github.writeFile", callSignature, async () => {
      let sha: string | undefined;
      try {
        const existing = await github.readFile(owner, repo, path, branch);
        sha = existing.sha;
      } catch {
        sha = undefined; // new file
      }
      const body: Record<string, unknown> = {
        message,
        content: btoa(unescape(encodeURIComponent(content)))
      };
      if (sha) body.sha = sha;
      if (branch) body.branch = branch;
      return githubRequest("/repos/" + owner + "/" + repo + "/contents/" + path, {
        method: "PUT",
        body: JSON.stringify(body)
      });
    });
  },

  /** SYNERGY #7: evidence-wrapped. */
  createIssue(owner: string, repo: string, title: string, body: string, missionId: string | null = null): Promise<unknown> {
    const callSignature = "POST /repos/" + owner + "/" + repo + "/issues";
    return asEvidence(missionId, "github.createIssue", callSignature, () =>
      githubRequest("/repos/" + owner + "/" + repo + "/issues", {
        method: "POST",
        body: JSON.stringify({ title, body })
      })
    );
  },

  /** SYNERGY #7: evidence-wrapped -- a repo creation is exactly the kind of
   * side-effecting action the Iron Law should gate on real HTTP outcome,
   * not LLM "it probably worked" vibes. */
  createRepo(name: string, description = "", isPrivate = false, missionId: string | null = null): Promise<unknown> {
    const callSignature = "POST /user/repos {name:" + name + "}";
    return asEvidence(missionId, "github.createRepo", callSignature, () =>
      githubRequest("/user/repos", {
        method: "POST",
        body: JSON.stringify({ name, description, private: isPrivate, auto_init: true })
      })
    );
  },

  listWorkflowRuns(owner: string, repo: string): Promise<unknown> {
    return githubRequest("/repos/" + owner + "/" + repo + "/actions/runs?per_page=20");
  },

  /** Escape hatch: any REST path the agents need. */
  raw(path: string, method = "GET", body?: unknown): Promise<unknown> {
    return githubRequest(path, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  }
};

export const firecrawl = {
  get available(): boolean {
    return Boolean(loadConfig().integrations.firecrawlKey);
  },

  /** Scrapes one URL to markdown. */
  async scrape(url: string): Promise<string> {
    const key = loadConfig().integrations.firecrawlKey;
    if (!key) throw new Error("No Firecrawl key saved.");
    const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ url, formats: ["markdown"] })
    });
    const data = await response.json();
    if (!response.ok) throw new Error("Firecrawl " + response.status + ": " + JSON.stringify(data).slice(0, 200));
    return data?.data?.markdown || data?.data?.content || "";
  },

  /** Discovers URLs on a site. */
  async map(url: string, search?: string): Promise<string[]> {
    const key = loadConfig().integrations.firecrawlKey;
    if (!key) throw new Error("No Firecrawl key saved.");
    const response = await fetch("https://api.firecrawl.dev/v2/map", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ url, ...(search ? { search } : {}) })
    });
    const data = await response.json();
    if (!response.ok) throw new Error("Firecrawl " + response.status);
    const links = data?.links || data?.data?.links || [];
    return links.map((l: string | { url?: string }) => (typeof l === "string" ? l : l.url || "")).filter(Boolean);
  },

  async search(query: string): Promise<unknown> {
    const key = loadConfig().integrations.firecrawlKey;
    if (!key) throw new Error("No Firecrawl key saved.");
    const response = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ query, limit: 8 })
    });
    if (!response.ok) throw new Error("Firecrawl " + response.status);
    return response.json();
  }
};

export const playwright = {
  get baseUrl(): string {
    return loadConfig().integrations.playwrightUrl.replace(/\/$/, "");
  },

  /** True when the local companion service is running. */
  async available(): Promise<boolean> {
    try {
      const response = await fetch(playwright.baseUrl + "/health", { signal: AbortSignal.timeout(3000) });
      return response.ok;
    } catch {
      return false;
    }
  },

  async call(action: string, payload: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(playwright.baseUrl + "/" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Browser companion error " + response.status);
    return data;
  },

  /** Opens a real browser window the agent can drive. */
  open(url: string, headless = false): Promise<unknown> {
    return playwright.call("open", { url, headless });
  },

  /** Returns readable text from a page, executing JavaScript first. */
  async read(url: string): Promise<string> {
    const data = (await playwright.call("read", { url })) as { text?: string };
    return data.text || "";
  },

  click(selector: string): Promise<unknown> {
    return playwright.call("click", { selector });
  },

  type(selector: string, text: string): Promise<unknown> {
    return playwright.call("type", { selector, text });
  },

  screenshot(url?: string): Promise<unknown> {
    return playwright.call("screenshot", { url });
  },

  close(): Promise<unknown> {
    return playwright.call("close", {});
  }
};

export const kling = {
  get available(): boolean {
    const { klingAccessKey, klingSecretKey } = loadConfig().integrations;
    return Boolean(klingAccessKey && klingSecretKey);
  },
  /**
   * KlingAI signs requests with a JWT derived from the secret key. Signing
   * cannot be done safely in the browser, so generation is routed through the
   * local companion service, which holds the signing logic.
   */
  async generate(prompt: string, kind: "image" | "video" = "image"): Promise<unknown> {
    const { klingAccessKey, klingSecretKey } = loadConfig().integrations;
    if (!klingAccessKey || !klingSecretKey) throw new Error("KlingAI keys are not saved.");
    return playwright.call("kling", { prompt, kind, accessKey: klingAccessKey, secretKey: klingSecretKey });
  }
};

/** Reports which integrations are ready, for the status strip. */
export async function integrationStatus(): Promise<Record<string, boolean>> {
  const config = loadConfig();
  return {
    github: Boolean(config.integrations.githubToken),
    firecrawl: Boolean(config.integrations.firecrawlKey),
    kling: Boolean(config.integrations.klingAccessKey && config.integrations.klingSecretKey),
    playwright: await playwright.available()
  };
}
