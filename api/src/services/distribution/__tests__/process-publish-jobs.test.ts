/**
 * Kill-switch helper for the scheduled-post claim.
 * Run: node --import tsx --test src/services/distribution/__tests__/process-publish-jobs.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agentExcludeSource } from "../process-publish-jobs.js";

describe("agentExcludeSource", () => {
  it("excludes agent jobs when the kill switch is off", () => {
    assert.equal(agentExcludeSource({ POSTING_AGENT_ENABLED: "false" }), "agent");
  });

  it("does not exclude when the flag is on or unset", () => {
    assert.equal(agentExcludeSource(undefined), undefined);
    assert.equal(agentExcludeSource({}), undefined);
    assert.equal(agentExcludeSource({ POSTING_AGENT_ENABLED: "true" }), undefined);
  });
});
