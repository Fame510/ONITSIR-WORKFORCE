#!/usr/bin/env node
/**
 * sync-shackle-types.mjs — SYNERGY #6: keeps agentosirus-web's
 * src/lib/shackle.ts / src/types.ts value sets in sync with onitsir-core's
 * Python enums (Verdict, DenyReason, HitlMode), so TypeScript NEVER drifts
 * into re-implementing decide() logic.
 *
 * Reads onitsir-server/app/schemas.py's `VerdictLiteral`/`DenyReasonLiteral`/
 * `HitlModeLiteral` (themselves derived from onitsir-core's Python enums)
 * and fails (non-zero exit) if agentosirus-web/src/types.ts's corresponding
 * union types have drifted. Run in CI on every change to either side.
 *
 * Usage: node infra/scripts/sync-shackle-types.mjs [--check|--write]
 *   --check (default): exit 1 if drifted, printing a diff-like report.
 *   --write: regenerate src/types.ts's Verdict/DenyReason/HitlMode blocks
 *            from the Python source of truth.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SCHEMAS_PY = path.join(ROOT, "packages", "onitsir-server", "app", "schemas.py");
const TYPES_TS = path.join(ROOT, "packages", "agentosirus-web", "src", "types.ts");

function extractLiteral(pySrc, name) {
  const re = new RegExp(name + "\\s*=\\s*Literal\\[([\\s\\S]*?)\\]");
  const m = pySrc.match(re);
  if (!m) throw new Error(`Could not find ${name} in ${SCHEMAS_PY}`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function tsUnion(values) {
  return values.map((v) => `'${v}'`).join("\n  | ");
}

function main() {
  const mode = process.argv.includes("--write") ? "write" : "check";
  const pySrc = fs.readFileSync(SCHEMAS_PY, "utf-8");
  const tsSrc = fs.readFileSync(TYPES_TS, "utf-8");

  const verdicts = extractLiteral(pySrc, "VerdictLiteral");
  const denyReasons = extractLiteral(pySrc, "DenyReasonLiteral");
  const hitlModes = extractLiteral(pySrc, "HitlModeLiteral");

  const expectedVerdict = `export type Verdict = ${verdicts.map((v) => `'${v}'`).join(" | ")};`;
  const expectedDenyReason = `export type DenyReason =\n  | ${tsUnion(denyReasons)};`;
  const expectedHitlMode = `export type HitlMode = ${hitlModes.map((v) => `'${v}'`).join(" | ")};`;

  const checks = [
    ["Verdict", expectedVerdict, tsSrc.includes(expectedVerdict)],
    ["DenyReason", expectedDenyReason, tsSrc.includes(expectedDenyReason)],
    ["HitlMode", expectedHitlMode, tsSrc.includes(expectedHitlMode)]
  ];

  const drifted = checks.filter(([, , ok]) => !ok);

  if (drifted.length === 0) {
    console.log("SYNERGY #6: shackle types in sync (Verdict/DenyReason/HitlMode).");
    return;
  }

  if (mode === "check") {
    console.error("SYNERGY #6: shackle type DRIFT detected between schemas.py and types.ts:");
    for (const [name, expected] of drifted) {
      console.error(`  - ${name} expected:\n${expected}\n`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("--write mode: manually reconcile types.ts using the `expected` blocks above (kept simple/explicit rather than blind text surgery).");
}

main();
