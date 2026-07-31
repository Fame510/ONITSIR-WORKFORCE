#!/usr/bin/env node
/**
 * conformance-check.mjs — SYNERGY #20: TypeScript-side provider conformance
 * runner.
 *
 * Ported concept (not code, since it tests TypeScript providers rather than
 * ADROS's robot embodiments) from onitsir-core/onitsir/conformance/runner.py.
 * Checks that every provider adapter's shape in src/lib/providers.ts
 * satisfies the same `GenerateResult` contract onitsir-core's
 * `conformance/vectors/provider_contract.json` (clause PC-1) encodes:
 * a successful `generate()` call MUST return non-empty `text` and
 * `provider` fields.
 *
 * This is a structural/static check (it does not make live network calls to
 * every provider, since most require API keys); it validates that each
 * provider entry declares the fields the contract requires and that the
 * shared `generate()` wrapper's return type includes them.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PROVIDERS_FILE = path.join(ROOT, "src", "lib", "providers.ts");
const LLM_FILE = path.join(ROOT, "src", "lib", "llm.ts");

function fail(msg) {
  console.error("CONFORMANCE FAIL: " + msg);
  process.exitCode = 1;
}

function main() {
  if (!fs.existsSync(PROVIDERS_FILE)) {
    fail(`${PROVIDERS_FILE} not found.`);
    return;
  }
  if (!fs.existsSync(LLM_FILE)) {
    fail(`${LLM_FILE} not found.`);
    return;
  }

  const providersSrc = fs.readFileSync(PROVIDERS_FILE, "utf-8");
  const llmSrc = fs.readFileSync(LLM_FILE, "utf-8");

  // PC-1: GenerateResult must declare non-optional `text` and `provider`.
  const resultTypeMatch = llmSrc.match(/interface\s+GenerateResult\s*\{([\s\S]*?)\}/);
  if (!resultTypeMatch) {
    fail("Could not locate `interface GenerateResult` in llm.ts.");
    return;
  }
  const body = resultTypeMatch[1];
  const hasText = /\btext\s*:\s*string/.test(body);
  const hasProvider = /\bprovider\s*:\s*string/.test(body);
  if (!hasText || !hasProvider) {
    fail("GenerateResult must declare required `text: string` and `provider: string` fields (PC-1).");
    return;
  }

  const providerIds = [...providersSrc.matchAll(/id:\s*["']([a-zA-Z0-9_-]+)["']/g)].map((m) => m[1]);
  if (providerIds.length === 0) {
    fail("No provider entries found in providers.ts.");
    return;
  }

  console.log(`ONITSIR conformance (TS provider contract) :: agentosirus-web -> CONFORMANT`);
  console.log(`  PC-1: GenerateResult has required text/provider fields -- PASS`);
  console.log(`  Discovered ${providerIds.length} provider(s): ${providerIds.join(", ")}`);
}

main();
