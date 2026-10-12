/**
 * Pure metering rules: per-model cost, debit bucket choice, usage alerts,
 * and the SA spend fold.
 *
 * Run: node --import tsx --test src/domains/billing/__tests__/token-metering-rules.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aiCallCostUsd, aiModelRate } from "../../../../../shared/ai-model-rates.js";
import { AI_CALL_MIN_TOKENS } from "../../../../../shared/pricing.js";
import { chooseDebitSource } from "../token-debit.js";
import { tokenUsageAlertFor, tokenUsageAlertMessage } from "../token-usage-alerts.js";
import { estimateRevenueUsd, groupSpendByRate } from "../../../services/billing/aiSpendReport.js";

describe("ai-model-rates", () => {
  it("prices the models we actually route to (bare ids, OpenRouter slugs, free pool)", () => {
    assert.equal(aiModelRate("claude-opus-5-5").id, "claude-opus-5-5");
    assert.equal(aiModelRate("anthropic/claude-opus-5.5").id, "claude-opus-5-5");
    assert.equal(aiModelRate("claude-sonnet-5-5").id, "claude-sonnet-5-5");
    assert.equal(aiModelRate("claude-haiku-4-5-20251001").id, "claude-haiku");
    assert.equal(aiModelRate("google/gemma-4-31b-it:free").id, "free-pool");
    assert.equal(aiModelRate("cerebras/llama3.1-8b").id, "cerebras");
    assert.equal(aiModelRate("some/new-model").id, "unpriced");
  });

  it("charges output (incl. thinking) at the output rate", () => {
    // Opus 5.5: 1M in = $4, 1M out = $20
    assert.equal(aiCallCostUsd({ model: "claude-opus-5-5", promptTokens: 1_000_000, completionTokens: 0 }), 4);
    assert.equal(aiCallCostUsd({ model: "claude-opus-5-5", promptTokens: 0, completionTokens: 1_000_000 }), 20);
    assert.equal(aiCallCostUsd({ model: "claude-sonnet-5-5", promptTokens: 6_000, completionTokens: 3_000 }), 0.042);
    assert.equal(aiCallCostUsd({ model: "x:free", promptTokens: 50_000, completionTokens: 50_000 }), 0);
  });
});

describe("chooseDebitSource", () => {
  it("spends the monthly allowance first, then packs", () => {
    assert.equal(chooseDebitSource({ monthlyRemaining: 10_000, packBalance: 50_000 }, 5_000), "monthly");
    assert.equal(chooseDebitSource({ monthlyRemaining: 1_000, packBalance: 50_000 }, 5_000), "pack");
    assert.equal(chooseDebitSource({ monthlyRemaining: 1_000, packBalance: 0 }, 5_000), "monthly");
    assert.equal(chooseDebitSource({ monthlyRemaining: 0, packBalance: 50_000, isUnlimited: true }, 5_000), "monthly");
  });
});

describe("tokenUsageAlertFor", () => {
  const base = { monthlyLimit: 150_000, packBalance: 0, isUnlimited: false };

  it("fires 'low' once when a monthly debit crosses 80%", () => {
    const before = { ...base, monthlyUsed: 110_000, totalAvailable: 40_000 };
    assert.equal(tokenUsageAlertFor(before, { tokens: 15_000, source: "monthly" }), "low");
    const already = { ...base, monthlyUsed: 125_000, totalAvailable: 25_000 };
    assert.equal(tokenUsageAlertFor(already, { tokens: 5_000, source: "monthly" }), null);
  });

  it("stays quiet at 80% while pack tokens remain", () => {
    const before = { ...base, packBalance: 200_000, monthlyUsed: 110_000, totalAvailable: 240_000 };
    assert.equal(tokenUsageAlertFor(before, { tokens: 15_000, source: "monthly" }), null);
  });

  it("fires 'exhausted' when the call leaves less than the minimum to start another", () => {
    const before = { ...base, monthlyUsed: 140_000, totalAvailable: 10_000 };
    assert.equal(tokenUsageAlertFor(before, { tokens: 10_000 - AI_CALL_MIN_TOKENS + 1, source: "monthly" }), "exhausted");
  });

  it("fires 'exhausted' when the last pack tokens are spent", () => {
    const before = { ...base, monthlyUsed: 150_000, packBalance: 5_000, totalAvailable: 5_000 };
    assert.equal(tokenUsageAlertFor(before, { tokens: 5_000, source: "pack" }), "exhausted");
  });

  it("never alerts unlimited users", () => {
    const before = {
      monthlyLimit: Number.POSITIVE_INFINITY,
      monthlyUsed: 9e9,
      packBalance: 0,
      totalAvailable: Number.POSITIVE_INFINITY,
      isUnlimited: true,
    };
    assert.equal(tokenUsageAlertFor(before, { tokens: 1e6, source: "monthly" }), null);
  });

  it("routes Pro to a top-up and free users to the upgrade", () => {
    assert.equal(tokenUsageAlertMessage("exhausted", true).url, "/settings?tab=billing");
    assert.equal(tokenUsageAlertMessage("exhausted", false).url, "/pricing");
    assert.equal(tokenUsageAlertMessage("exhausted", true).email, true);
    assert.equal(tokenUsageAlertMessage("low", true).email, false);
  });
});

describe("aiSpendReport pure helpers", () => {
  it("folds raw model ids into rate-card families, costliest first", () => {
    const rows = groupSpendByRate([
      { model: "claude-opus-5-5", calls: 2, tokens: 10_000, cost: 0.1 },
      { model: "anthropic/claude-opus-5.5", calls: 1, tokens: 5_000, cost: 0.05 },
      { model: "x:free", calls: 9, tokens: 90_000, cost: 0 },
    ]);
    assert.deepEqual(rows.map((r) => r.rateId), ["claude-opus-5-5", "free-pool"]);
    assert.equal(rows[0].calls, 3);
    assert.equal(rows[0].costUsd, 0.15);
  });

  it("estimates window revenue from Pro pro-rating plus packs", () => {
    assert.equal(estimateRevenueUsd(true, 30, 0), 1.99);
    assert.equal(estimateRevenueUsd(false, 30, 14.99), 14.99);
    assert.equal(estimateRevenueUsd(true, 7, 0), Math.round(((1.99 * 7) / 30) * 10_000) / 10_000);
  });
});
