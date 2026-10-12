/**
 * Coverage for per-model-family wire rules (model-request-rules.ts): direct
 * Claude 5.x legs are strict-pinned, drop sampling params, get a thinking-sized
 * max_tokens floor and a longer attempt timeout, and downgrade forced tool
 * choice; every other family passes the profile through unchanged.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildModelRequestParams,
  isListedInGatewayCatalog,
  CLAUDE_OPUS,
  CLAUDE_SONNET,
} from "../model-request-rules.js";
import { USE_CASE_PROFILES, resolveProfileChainForUseCase } from "../providers.js";

describe("Claude 5.x legs", () => {
  for (const model of [CLAUDE_OPUS, CLAUDE_SONNET]) {
    it(`${model}: strict, no temperature, thinking floor, long timeout`, () => {
      const p = buildModelRequestParams({ model, temperature: 0.2, maxTokens: 300 }, undefined, false);
      assert.equal(p.model, model);
      assert.equal(p.modelStrict, true);
      assert.equal("temperature" in p, false);
      assert.equal(p.max_tokens, 16_000);
      assert.equal(p.attemptTimeoutMs, 120_000);
      assert.equal("tool_choice" in p, false);
    });
  }

  it("keeps a caller max_tokens above the floor", () => {
    const p = buildModelRequestParams({ model: CLAUDE_OPUS, temperature: 0, maxTokens: 32_000 }, undefined, false);
    assert.equal(p.max_tokens, 32_000);
  });

  it("sets the floor when the profile has no maxTokens", () => {
    const p = buildModelRequestParams({ model: CLAUDE_OPUS, temperature: 0.7 }, undefined, false);
    assert.equal(p.max_tokens, 16_000);
  });

  it("downgrades forced tool use to auto, keeps none", () => {
    assert.equal(buildModelRequestParams({ model: CLAUDE_OPUS, temperature: 0 }, "required", true).tool_choice, "auto");
    assert.equal(buildModelRequestParams({ model: CLAUDE_OPUS, temperature: 0 }, "none", true).tool_choice, "none");
  });

  it("direct Claude ids are not catalog-listed; vendor-prefixed pool ids are", () => {
    assert.equal(isListedInGatewayCatalog(CLAUDE_OPUS), false);
    assert.equal(isListedInGatewayCatalog("claude-haiku-4-5-20251001"), false);
    assert.equal(isListedInGatewayCatalog("qwen/qwen3-coder:free"), true);
    assert.equal(isListedInGatewayCatalog("cerebras/llama3.1-8b"), true);
  });
});

describe("non-Claude legs pass through", () => {
  it("free-pool model keeps temperature/max_tokens, no strict, no family timeout", () => {
    const p = buildModelRequestParams({ model: "qwen/qwen3-coder:free", temperature: 0.4, maxTokens: 900 }, "required", true);
    assert.deepEqual(p, { model: "qwen/qwen3-coder:free", temperature: 0.4, max_tokens: 900, tool_choice: "required" });
  });

  it("omits max_tokens when the profile has none", () => {
    const p = buildModelRequestParams({ model: "cerebras/llama3.1-8b", temperature: 0.2 }, undefined, false);
    assert.deepEqual(p, { model: "cerebras/llama3.1-8b", temperature: 0.2 });
  });
});

describe("profiles", () => {
  it("every Claude leg in every chain uses a direct id (never anthropic/claude-*)", () => {
    for (const useCase of Object.keys(USE_CASE_PROFILES) as (keyof typeof USE_CASE_PROFILES)[]) {
      for (const { model } of resolveProfileChainForUseCase(useCase)) {
        assert.ok(!/^anthropic\/claude-/.test(model), `${useCase} pins ${model}`);
      }
    }
  });
});
