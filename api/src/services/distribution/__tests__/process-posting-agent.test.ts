/**
 * processPostingAgent kill switch (#2300 / #2848).
 *
 * The planner itself is not injectable (it talks to getDb / billing /
 * captions in-process). The only unit-testable surface without a DB is
 * the POSTING_AGENT_ENABLED === "false" early return: expireAgentDrafts
 * would throw here because getDb() has no DATABASE_URL, so a clean
 * resolve is proof the kill switch never entered the planner.
 *
 * Pro-lapse handling is pausePostingAgent(userId, "plan") — covered in
 * pause-posting-agent.test.ts. Caption token-budget fallback is
 * caption-fallback.test.ts.
 *
 * Run: node --import tsx --test src/services/distribution/__tests__/process-posting-agent.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { processPostingAgent } from "../process-posting-agent.js";

const hasDb = Boolean(
  process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_DB_URL,
);

describe("processPostingAgent kill switch", () => {
  it("is exported as a function", () => {
    assert.equal(typeof processPostingAgent, "function");
  });

  it('returns immediately when POSTING_AGENT_ENABLED is the string "false"', async () => {
    const result = await processPostingAgent({ POSTING_AGENT_ENABLED: "false" });
    assert.equal(result, undefined);
  });

  it("does not treat a missing env as a kill switch (would hit getDb)", async (t) => {
    // Strict equality: only the lowercase string "false" skips the planner.
    // Calling without that flag reaches expireAgentDrafts → getDb() and
    // throws in this unit-test isolate (no DATABASE_URL).
    if (hasDb) {
      t.skip("DATABASE_URL is set; would run the real planner");
      return;
    }
    await assert.rejects(() => processPostingAgent(), /database connection string/i);
  });

  it("does not treat TRUE / False / 0 as a kill switch", async (t) => {
    if (hasDb) {
      t.skip("DATABASE_URL is set; would run the real planner");
      return;
    }
    await assert.rejects(
      () => processPostingAgent({ POSTING_AGENT_ENABLED: "true" }),
      /database connection string/i,
    );
    await assert.rejects(
      () => processPostingAgent({ POSTING_AGENT_ENABLED: "FALSE" }),
      /database connection string/i,
    );
    await assert.rejects(
      () => processPostingAgent({ POSTING_AGENT_ENABLED: "0" }),
      /database connection string/i,
    );
  });
});
