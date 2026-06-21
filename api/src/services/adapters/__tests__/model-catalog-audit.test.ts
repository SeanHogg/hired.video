/**
 * Coverage for the model-catalog drift guard (gap #1938) — the mechanism that
 * catches a pinned LLM model ID going retired before it 503s a user-blocking
 * flow (the #1937 root cause). Tests the pure pieces: configured-model
 * collection, catalog match-set construction across gateway response shapes,
 * presence matching, and the audit diff + partial-vs-total drift signal.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectConfiguredModels,
  buildCatalogMatchSet,
  isConfiguredModelPresent,
  auditAgainstCatalog,
  auditModelCatalog,
  formatModelDriftEmailHtml,
  bareModelId,
} from "../model-catalog-audit.js";
import type { LLMUseCase } from "../providers.js";

describe("collectConfiguredModels", () => {
  it("includes the paid-terminal models the chains depend on", () => {
    const map = collectConfiguredModels();
    // The current paid terminal (post-#1937; Anthropic id bumped to opus-4-8
    // on 2026-06-21 when claude-haiku-4-5 retired out of the gateway catalog,
    // gap #1938). If these go missing the safety net is dead — this is exactly
    // what the audit exists to surface.
    assert.ok(map.has("anthropic/claude-opus-4-8"), "anthropic terminal must be configured");
    assert.ok(map.has("cerebras/llama3.1-8b"), "cerebras terminal must be configured");
  });

  it("maps each model to the use cases that reference it (sorted, deduped)", () => {
    const map = collectConfiguredModels();
    const anthropicUseCases = map.get("anthropic/claude-opus-4-8");
    assert.ok(anthropicUseCases && anthropicUseCases.length > 0);
    // sorted
    assert.deepEqual(anthropicUseCases, [...anthropicUseCases].sort());
    // deduped (Set-backed)
    assert.equal(new Set(anthropicUseCases).size, anthropicUseCases.length);
  });

  it("does not reference any retired Anthropic model id (regression for #1937)", () => {
    const models = [...collectConfiguredModels().keys()];
    for (const m of models) {
      assert.ok(!m.includes("claude-3-haiku"), `retired id leaked: ${m}`);
      assert.ok(!m.includes("claude-3.5-sonnet"), `retired id leaked: ${m}`);
      assert.ok(!m.includes("claude-3-5-sonnet"), `retired id leaked: ${m}`);
    }
  });
});

describe("buildCatalogMatchSet + isConfiguredModelPresent", () => {
  it("matches a vendor/model:tier hint against a {model,vendor} catalog entry", () => {
    // Gateway lists models split into {model, vendor} with bare model ids.
    const set = buildCatalogMatchSet({
      data: [
        { model: "claude-haiku-4-5", vendor: "anthropic", available: true },
        { model: "qwen3-coder", vendor: "qwen", available: true },
      ],
    });
    assert.equal(isConfiguredModelPresent("anthropic/claude-haiku-4-5", set), true);
    assert.equal(isConfiguredModelPresent("qwen/qwen3-coder:free", set), true);
    // A retired model is correctly absent.
    assert.equal(isConfiguredModelPresent("anthropic/claude-3-haiku", set), false);
  });

  it("handles the bare `models: string[]` and bare-array response shapes", () => {
    const fromLoose = buildCatalogMatchSet({ models: ["anthropic/claude-haiku-4-5"] });
    assert.equal(isConfiguredModelPresent("anthropic/claude-haiku-4-5", fromLoose), true);

    const fromArray = buildCatalogMatchSet([{ id: "cerebras/llama3.1-8b" }]);
    assert.equal(isConfiguredModelPresent("cerebras/llama3.1-8b", fromArray), true);
  });

  it("bareModelId strips vendor prefix and :tier suffix", () => {
    assert.equal(bareModelId("qwen/qwen3-coder:free"), "qwen3-coder");
    assert.equal(bareModelId("anthropic/claude-haiku-4-5"), "claude-haiku-4-5");
    assert.equal(bareModelId("llama3.1-8b"), "llama3.1-8b");
  });
});

describe("auditAgainstCatalog", () => {
  const configured = new Map<string, LLMUseCase[]>([
    ["anthropic/claude-haiku-4-5", ["match_tailor"]],
    ["anthropic/claude-3-haiku", ["studio_script"]], // pretend-retired
    ["qwen/qwen3-coder:free", ["resume_optimize"]],
  ]);

  it("flags exactly the configured models absent from the catalog", () => {
    const catalog = buildCatalogMatchSet({
      data: [
        { model: "claude-haiku-4-5", vendor: "anthropic" },
        { model: "qwen3-coder", vendor: "qwen" },
        // claude-3-haiku intentionally absent (retired)
      ],
    });
    const audit = auditAgainstCatalog(configured, catalog);
    assert.equal(audit.gatewayChecked, true);
    assert.deepEqual(audit.missing, ["anthropic/claude-3-haiku"]);
  });

  it("reports inconclusive (all null, empty missing) when the gateway is unreachable", () => {
    const audit = auditAgainstCatalog(configured, null);
    assert.equal(audit.gatewayChecked, false);
    assert.deepEqual(audit.missing, []);
    assert.ok(audit.models.every((r) => r.availableInGateway === null));
  });

  it("returns rows sorted by model id", () => {
    const audit = auditAgainstCatalog(configured, new Set());
    assert.deepEqual(
      audit.models.map((r) => r.model),
      [...audit.models.map((r) => r.model)].sort(),
    );
  });
});

describe("auditModelCatalog (no gateway key)", () => {
  it("is inconclusive without a configured BUILDERFORCE_API_KEY", async () => {
    const audit = await auditModelCatalog({});
    assert.equal(audit.gatewayChecked, false);
    assert.deepEqual(audit.missing, []);
  });
});

describe("formatModelDriftEmailHtml", () => {
  it("lists the missing models and their use cases", () => {
    const html = formatModelDriftEmailHtml({
      gatewayChecked: true,
      models: [
        { model: "anthropic/claude-3-haiku", useCases: ["studio_script", "match_tailor"], availableInGateway: false },
        { model: "anthropic/claude-haiku-4-5", useCases: ["match_tailor"], availableInGateway: true },
      ],
      missing: ["anthropic/claude-3-haiku"],
      auditedAt: "2026-06-06T00:00:00.000Z",
    });
    assert.ok(html.includes("anthropic/claude-3-haiku"));
    assert.ok(html.includes("studio_script, match_tailor"));
    // The present model is not listed as missing.
    assert.ok(!html.includes(">anthropic/claude-haiku-4-5<"));
  });
});
