/**
 * symbolicVerifier.ts — SYNERGY #15: static analysis of emitted WAT.
 *
 * Ported from morphic-kernel/wasm-runtime/core/symbolicVerifier.js
 * (`SymbolicVerifier`). Analyzes the ACTUAL emitted WAT (not a
 * self-declared metric): counts real loop/branch structure, detects
 * unbounded loops (a `(loop` whose body has no `br_if`/`br` exit and no
 * `;;; bound=` annotation), sums gas instrumentation, and derives a
 * worst-case step estimate.
 *
 * The Z3 SMT bridge from morphic-kernel is Node-only (spawns a `z3`
 * subprocess) and has no browser equivalent, so this port always uses the
 * pure-JS bounds-check fallback path that morphic-kernel itself falls back
 * to when Z3 is unavailable -- documented explicitly rather than silently
 * pretending Z3 ran.
 */

const GAS_LOOP = 10;

export interface WatAnalysis {
  loops: number;
  branches: number;
  gasCalls: number;
  memOps: number;
  unboundedLoops: number;
  loopBounds: number[];
  worstCaseSteps: number;
  memoryBytes: number;
  safetyScore: number;
}

export interface VerifyPolicy {
  maxLatency?: number; // ms budget, translated to worst-case step budget
  maxMemoryMB?: number;
  requireSecurityScore?: number;
}

export interface VerifyResult {
  verified: boolean;
  reason?: string;
  analysis: WatAnalysis;
}

function matchParen(text: string, from: number): number {
  let depth = 0;
  let i = from;
  while (i < text.length && text[i] !== "(") i++;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

export class SymbolicVerifier {
  analyzeWat(wat: string): WatAnalysis {
    const text = String(wat);
    let loops = 0;
    let unboundedLoops = 0;
    const loopBounds: number[] = [];

    const loopRe = /\(loop\b/g;
    let m: RegExpExecArray | null;
    while ((m = loopRe.exec(text)) !== null) {
      loops++;
      const start = m.index;
      const back = text.slice(Math.max(0, start - 160), start);
      const annot = back.match(/;;;\s*bound=(\d+)/);
      const fwd = text.slice(start, matchParen(text, start));
      const hasExit = /\bbr_if\b/.test(fwd) || /\bbr\s+\$(exit|done|end|out)\b/.test(fwd);
      if (annot) {
        loopBounds.push(parseInt(annot[1], 10));
      } else if (!hasExit) {
        unboundedLoops++;
        loopBounds.push(Infinity);
      } else {
        loopBounds.push(100000); // bounded but unknown -> conservative cap
      }
    }

    const branches = (text.match(/\bbr_if\b/g) || []).length + (text.match(/\(if\b/g) || []).length;
    const gasCalls = (text.match(/\(call \$use_gas/g) || []).length;
    const memOps = (text.match(/i32\.store|i64\.store|memory\.grow/g) || []).length;

    const finiteBounds = loopBounds.filter((b) => Number.isFinite(b));
    const worstCaseSteps = finiteBounds.reduce((s, b) => s + b * GAS_LOOP, 10 + branches * 10);
    const memoryBytes = memOps * 65536;
    const safetyScore = Math.max(0, 100 - unboundedLoops * 50 - memOps * 3);

    return { loops, branches, gasCalls, memOps, unboundedLoops, loopBounds, worstCaseSteps, memoryBytes, safetyScore };
  }

  async verify(wat: string, policy: VerifyPolicy = {}): Promise<VerifyResult> {
    const a = this.analyzeWat(wat);
    const maxSteps = (policy.maxLatency || 1000) * 1000;
    const maxMem = (policy.maxMemoryMB || 64) * 1024 * 1024;

    if (a.unboundedLoops > 0) {
      return { verified: false, reason: "UNBOUNDED_LOOP_DETECTED", analysis: a };
    }
    if (a.gasCalls < a.loops) {
      return { verified: false, reason: "UNINSTRUMENTED_LOOP", analysis: a };
    }

    // No browser-side Z3 bridge exists (Node-only subprocess in
    // morphic-kernel) -- always use the JS bounds-check fallback, the same
    // path morphic-kernel itself takes when Z3 is unavailable.
    const jsValid = a.worstCaseSteps <= maxSteps && a.memoryBytes <= maxMem;
    if (!jsValid) return { verified: false, reason: "js_fallback_bounds_exceeded", analysis: a };

    const scoreOk = a.safetyScore >= (policy.requireSecurityScore || 50);
    if (!scoreOk) return { verified: false, reason: "safety_score_below_threshold", analysis: a };

    return { verified: true, analysis: a };
  }
}
