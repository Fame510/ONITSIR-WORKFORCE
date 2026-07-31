/**
 * evidenceMirror.ts -- offline mirror of onitsir-core's chain-step evidence
 * check and Router pre-filter scoring.
 *
 * SYNERGY #4 / SYNERGY #6. This is a MIRROR, not a second implementation of
 * governance. The Python side is authoritative: `decide()` and the evidence
 * producers live in onitsir-core and are never re-implemented here. What lives
 * here is the narrow offline-mode acceptance bar, kept deliberately identical
 * to the Python producer so that turning the backend off does not quietly
 * lower the bar for what counts as evidence.
 *
 * It was extracted out of apiShim.ts for one reason: apiShim.ts imports the
 * browser provider chain, the key vault, and window-dependent modules, so the
 * mirror could not be unit-tested where it was. An untestable mirror drifts.
 * Two real divergences from the Python producer were found once it became
 * testable, and both are fixed here:
 *
 *   1. The refusal-marker list held only three of the seven markers the Python
 *      producer checks. Offline mode would therefore accept a Python
 *      traceback, an "Internal Server Error" body, or an "[error]" provider
 *      string as passing evidence.
 *   2. Task relevance used substring matching over the first eight task words.
 *      That both over-matched (a task word occurring inside a longer unrelated
 *      word counted as relevance) and under-matched (words past the eighth
 *      were ignored). It now mirrors the Python tokenizer and uses token set
 *      intersection over the whole task.
 */

/** Mirrors onitsir-core's evidence_producers.chain_step._REFUSAL_MARKERS. */
export const REFUSAL_MARKERS: readonly string[] = [
  "i cannot help with that",
  "i can't assist with that",
  "as an ai language model",
  "i'm unable to",
  "traceback (most recent call last)",
  "internal server error",
  "[error]"
];

/** Mirrors onitsir-core's evidence_producers.chain_step._MIN_OUTPUT_CHARS. */
export const MIN_OUTPUT_CHARS = 20;

export interface LocalVerifyResult {
  passed: boolean;
  summary: string;
}

export interface PreFilterCandidate {
  id: string;
  name: string;
  category: string;
  desc: string;
}

/**
 * Mirrors onitsir-core's evidence_producers.chain_step._tokenize():
 * lowercase, then every run starting with a letter and at least 3 chars long.
 */
export function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z][a-z0-9+#-]{2,}/g) || []);
}

/**
 * SYNERGY #4: offline mirror of ChainStepEvidenceProducer.produce().
 *
 * Three checks, all of which must pass:
 *   1. output is at least MIN_OUTPUT_CHARS after trimming
 *   2. output contains no refusal or error marker
 *   3. output shares at least one token with the task (skipped when the task
 *      is empty, because there is then nothing to be off-topic about)
 */
export function localVerifyStep(task: string, output: string): LocalVerifyResult {
  const checks: string[] = [];
  let passed = true;

  if (output.trim().length < MIN_OUTPUT_CHARS) {
    passed = false;
    checks.push("FAIL length: output too short");
  } else {
    checks.push("PASS length");
  }

  const lowered = output.toLowerCase();
  if (REFUSAL_MARKERS.some((marker) => lowered.includes(marker))) {
    passed = false;
    checks.push("FAIL refusal marker detected");
  } else {
    checks.push("PASS no refusal marker");
  }

  const taskTerms = tokenize(task);
  if (taskTerms.size > 0) {
    const outputTerms = tokenize(output);
    let overlap = false;
    taskTerms.forEach((term) => {
      if (outputTerms.has(term)) overlap = true;
    });
    if (!overlap) {
      passed = false;
      checks.push("FAIL no task-keyword overlap");
    } else {
      checks.push("PASS task-keyword overlap");
    }
  }

  return { passed, summary: checks.join("; ") };
}

/**
 * SYNERGY #2: offline mirror of onitsir-core's Router pre-filter scoring.
 * Category hit scores 3, name hit scores 2, zero-score candidates are dropped,
 * and the remainder are returned highest-first, capped at `limit`.
 */
export function localPreFilter(
  roster: PreFilterCandidate[],
  goal: string,
  limit: number
): PreFilterCandidate[] {
  const terms = goal.toLowerCase().match(/[a-z][a-z0-9+#-]{1,}/g) || [];
  return roster
    .map((agent) => {
      let score = 0;
      const category = agent.category.toLowerCase();
      const name = agent.name.toLowerCase();
      for (const term of terms) {
        if (term === category || category.includes(term)) score += 3;
        if (name.includes(term)) score += 2;
      }
      return { agent, score };
    })
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((scored) => scored.agent);
}
