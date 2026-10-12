/**
 * Coverage for the use-case fallback-chain assembly in providers.ts:
 *   • #1939 — interactive use cases cap `:free` attempts before the paid
 *     terminal (bounds free-pool-congestion wall-clock); non-interactive
 *     use cases keep the full free pool.
 *   • #1937 regression — no chain pins a retired Anthropic model id, and the
 *     paid terminal is reachable on interactive flows.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveProfileChainForUseCase,
  USE_CASE_PROFILES,
  INTERACTIVE_USE_CASES,
  type LLMUseCase,
} from "../providers.js";
import { CLAUDE_SONNET } from "../model-request-rules.js";

const isFree = (m: string) => m.endsWith(":free");

describe("interactive free-attempt cap (#1939)", () => {
  it("match_tailor tries at most 2 free models then reaches the paid terminal", () => {
    const chain = resolveProfileChainForUseCase("match_tailor").map((p) => p.model);
    const freeCount = chain.filter(isFree).length;
    assert.ok(freeCount <= 2, `expected ≤2 free attempts, got ${freeCount}: ${chain.join(", ")}`);
    // Paid terminal must still be present after the cap.
    assert.ok(chain.includes(CLAUDE_SONNET), `paid terminal missing: ${chain.join(", ")}`);
    assert.ok(chain.includes("cerebras/llama3.1-8b"), `cerebras terminal missing: ${chain.join(", ")}`);
  });

  it("caps every interactive use case at 2 free attempts", () => {
    for (const useCase of INTERACTIVE_USE_CASES) {
      const chain = resolveProfileChainForUseCase(useCase).map((p) => p.model);
      const freeCount = chain.filter(isFree).length;
      assert.ok(freeCount <= 2, `${useCase}: expected ≤2 free, got ${freeCount} (${chain.join(", ")})`);
    }
  });

  it("keeps the full free pool for a non-interactive use case (autofill)", () => {
    const chain = resolveProfileChainForUseCase("autofill").map((p) => p.model);
    const freeCount = chain.filter(isFree).length;
    assert.ok(freeCount >= 3, `non-interactive should keep full free pool, got ${freeCount}`);
    // No paid terminal padding on non-interactive flows.
    assert.ok(!chain.includes(CLAUDE_SONNET));
    assert.ok(!chain.includes("cerebras/llama3.1-8b"));
  });
});

describe("no retired Anthropic model ids (#1937 regression)", () => {
  it("every chain across every use case avoids claude-3-haiku / claude-3.5-sonnet", () => {
    for (const useCase of Object.keys(USE_CASE_PROFILES) as LLMUseCase[]) {
      for (const { model } of resolveProfileChainForUseCase(useCase)) {
        assert.ok(!model.includes("claude-3-haiku"), `${useCase} pins retired ${model}`);
        assert.ok(!model.includes("claude-3.5-sonnet"), `${useCase} pins retired ${model}`);
      }
    }
  });
});
