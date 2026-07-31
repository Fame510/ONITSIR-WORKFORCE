/**
 * evidenceMirror.test.ts -- parity between the offline evidence mirror and
 * onitsir-core's ChainStepEvidenceProducer.
 *
 * Offline mode must not be an easier mode. Every rejection the Python producer
 * makes, the browser mirror must also make, otherwise disabling the backend
 * silently lowers the bar for what counts as evidence. Each case below has a
 * one-to-one counterpart in
 * packages/onitsir-core/tests/test_evidence_producers.py.
 */
import { describe, it, expect } from "vitest";
import {
  MIN_OUTPUT_CHARS,
  REFUSAL_MARKERS,
  localPreFilter,
  localVerifyStep,
  tokenize
} from "../evidenceMirror";

const TASK = "add rate limiting to the gate route";
const GOOD_OUTPUT =
  "Added rate limiting middleware to the gate route and covered it with two new tests; both pass.";

describe("localVerifyStep parity with ChainStepEvidenceProducer (SYNERGY #4)", () => {
  it("accepts substantive, on-topic output", () => {
    const result = localVerifyStep(TASK, GOOD_OUTPUT);
    expect(result.passed).toBe(true);
  });

  it("rejects empty output", () => {
    expect(localVerifyStep(TASK, "").passed).toBe(false);
  });

  it("rejects output shorter than the minimum length", () => {
    const result = localVerifyStep(TASK, "done");
    expect(result.passed).toBe(false);
    expect(result.summary).toContain("FAIL length");
  });

  it("rejects whitespace-only output", () => {
    expect(localVerifyStep(TASK, "            ").passed).toBe(false);
  });

  it("treats the length boundary the same way Python does", () => {
    const justUnder = "a".repeat(MIN_OUTPUT_CHARS - 1);
    const justOver = "rate".padEnd(MIN_OUTPUT_CHARS, "x");
    expect(localVerifyStep("", justUnder).passed).toBe(false);
    expect(localVerifyStep("", justOver).passed).toBe(true);
  });

  it("mirrors all seven Python refusal markers", () => {
    expect(REFUSAL_MARKERS).toHaveLength(7);
    for (const marker of REFUSAL_MARKERS) {
      const output = marker + " while working on the rate limiting gate route change here";
      const result = localVerifyStep(TASK, output);
      expect(result.passed, "marker not rejected: " + marker).toBe(false);
      expect(result.summary).toContain("FAIL refusal marker detected");
    }
  });

  it("rejects a refusal even when it is long and on-topic", () => {
    const result = localVerifyStep(
      TASK,
      "I cannot help with that request to add rate limiting to the gate route, but here is some general information instead."
    );
    expect(result.passed).toBe(false);
  });

  it("rejects a Python traceback masquerading as output", () => {
    const result = localVerifyStep(
      TASK,
      "Traceback (most recent call last):\n  File \"app.py\", line 3\nValueError: rate limiting gate route failed"
    );
    expect(result.passed).toBe(false);
  });

  it("rejects an Internal Server Error body", () => {
    const result = localVerifyStep(
      TASK,
      "Internal Server Error occurred while adding rate limiting to the gate route; nothing was written."
    );
    expect(result.passed).toBe(false);
  });

  it("rejects a provider error string", () => {
    const result = localVerifyStep(
      TASK,
      "[error] upstream provider returned 503 while working on the rate limiting gate route"
    );
    expect(result.passed).toBe(false);
  });

  it("rejects confident off-topic output for lack of keyword overlap", () => {
    const result = localVerifyStep(
      TASK,
      "Bordeaux vintages from nineteen eighty two remain excellent value for patient collectors seeking cellar depth."
    );
    expect(result.passed).toBe(false);
    expect(result.summary).toContain("FAIL no task-keyword overlap");
  });

  it("skips the overlap check when no task is supplied", () => {
    const result = localVerifyStep(
      "",
      "This is a sufficiently long output with no particular subject."
    );
    expect(result.passed).toBe(true);
    expect(result.summary).not.toContain("task-keyword overlap");
  });

  it("does not count a task word buried inside an unrelated longer word", () => {
    // "rate" appears inside "grateful", but tokenization is whole-token, so
    // this must NOT register as relevance. Substring matching would pass it.
    // The task deliberately avoids stopwords, because a shared "the" would
    // create overlap on its own and mask what is being tested here.
    const result = localVerifyStep(
      "rate submission",
      "Extremely grateful for every opportunity to review this material."
    );
    expect(result.passed).toBe(false);
    expect(result.summary).toContain("FAIL no task-keyword overlap");
  });

  it("counts a shared stopword as overlap, which is a known weakness", () => {
    // Documented limitation of the crude overlap heuristic, shared with the
    // Python producer: a common word like "the" is enough to look relevant.
    // Pinned so it is a known property rather than a surprise, and so any
    // future stopword filter has to change both sides together.
    const result = localVerifyStep(
      "rate the submission",
      "Extremely grateful for the opportunity to review this material."
    );
    expect(result.passed).toBe(true);
  });

  it("considers task words beyond the first eight", () => {
    // The old implementation truncated the task to eight words, so a match on
    // the ninth word was invisible to it.
    const longTask = "one two three four five six seven eight canonicalization";
    const result = localVerifyStep(
      longTask,
      "Implemented canonicalization for the parameter digest and verified it end to end."
    );
    expect(result.passed).toBe(true);
  });
});

describe("tokenize parity with the Python tokenizer", () => {
  it("lowercases and keeps runs of three or more starting with a letter", () => {
    expect(Array.from(tokenize("Add Rate Limiting")).sort()).toEqual([
      "add",
      "limiting",
      "rate"
    ]);
  });

  it("drops tokens shorter than three characters", () => {
    expect(tokenize("a to be the").has("to")).toBe(false);
    expect(tokenize("a to be the").has("the")).toBe(true);
  });

  it("drops tokens that do not start with a letter", () => {
    expect(tokenize("404 errors").has("404")).toBe(false);
    expect(tokenize("404 errors").has("errors")).toBe(true);
  });

  it("keeps technology tokens containing plus, hash, and hyphen", () => {
    const tokens = tokenize("use c++ and c# and multi-tenant");
    // The pattern is a leading letter plus at least two more permitted chars,
    // so "c++" (three chars) survives but "c#" (two) does not.
    expect(tokens.has("c++")).toBe(true);
    expect(tokens.has("c#")).toBe(false);
    expect(tokens.has("multi-tenant")).toBe(true);
  });

  it("deduplicates repeats", () => {
    expect(tokenize("rate rate rate").size).toBe(1);
  });
});

describe("localPreFilter parity with Router.pre_filter (SYNERGY #2)", () => {
  const roster = [
    { id: "design-brand-guardian", name: "Brand Guardian", category: "design", desc: "" },
    { id: "engineering-frontend-developer", name: "Frontend Developer", category: "engineering", desc: "" },
    { id: "marketing-growth-hacker", name: "Growth Hacker", category: "marketing", desc: "" }
  ];

  it("returns only candidates that scored above zero", () => {
    const result = localPreFilter(roster, "design work", 10);
    expect(result.map((a) => a.id)).toEqual(["design-brand-guardian"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(localPreFilter(roster, "underwater welding", 10)).toEqual([]);
  });

  it("ranks a category-and-name match above a category-only match", () => {
    const result = localPreFilter(roster, "brand design", 10);
    expect(result[0].id).toBe("design-brand-guardian");
  });

  it("respects the limit", () => {
    const result = localPreFilter(roster, "design engineering marketing", 2);
    expect(result).toHaveLength(2);
  });

  it("is deterministic across repeated calls", () => {
    const first = localPreFilter(roster, "design engineering marketing", 3).map((a) => a.id);
    const second = localPreFilter(roster, "design engineering marketing", 3).map((a) => a.id);
    expect(first).toEqual(second);
  });
});
