/**
 * vitest.config.ts — SYNERGY #13: ADROS's `--test` self-diagnostic mode
 * ported as agentosirus's first automated test suite. `npm run test`
 * exercises every new synergy subsystem deterministically, no external
 * services needed (mirroring ADROS's `run.py --test` philosophy).
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/__tests__/**/*.test.ts"]
  }
});
