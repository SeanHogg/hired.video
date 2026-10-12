/**
 * #2233 / #2230 — the `resume_ocr` vision chain.
 *   • a verified free vision fallback sits behind the paid primary;
 *   • the text-only shared free pool is never appended to a vision chain;
 *   • a non-vision use case still gets its free-pool padding (regression).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveProfileChainForUseCase, VISION_USE_CASES, INTERACTIVE_USE_CASES } from "../providers.js";
import { CLAUDE_OPUS } from "../model-request-rules.js";
import { auditAgainstCatalog, buildCatalogMatchSet, collectConfiguredModels } from "../model-catalog-audit.js";

/** Live gateway catalog rows for the vision models, as `sdk.models.list()`
 *  returned them on 2026-10-10 (trimmed to the fields the audit reads). */
const LIVE_CATALOG_VISION_ROWS = {
  data: [
    { model: "meta/llama-3.2-11b-vision-instruct", vendor: "nvidia", available: true, capabilities: ["vision"] },
    { model: "google/gemma-4-26b-a4b-it:free", vendor: "openrouter", available: true, capabilities: ["tools", "structured_output", "vision"] },
    { model: "google/gemma-4-31b-it:free", vendor: "openrouter", available: true, capabilities: [] },
  ],
};

describe("resume_ocr vision chain", () => {
  const chain = resolveProfileChainForUseCase("resume_ocr").map((p) => p.model);

  it("keeps Claude Opus as the primary with free vision fallbacks behind it", () => {
    assert.equal(chain[0], CLAUDE_OPUS);
    assert.deepEqual(chain.slice(1), ["meta/llama-3.2-11b-vision-instruct", "google/gemma-4-26b-a4b-it:free"]);
  });

  it("appends no text-only free-pool or paid-terminal model", () => {
    for (const textOnly of ["qwen/qwen3-coder:free", "google/gemma-4-31b-it:free", "cerebras/llama3.1-8b"]) {
      assert.ok(!chain.includes(textOnly), `${textOnly} leaked into the vision chain: ${chain.join(", ")}`);
    }
    assert.ok(VISION_USE_CASES.has("resume_ocr"));
    assert.ok(!INTERACTIVE_USE_CASES.has("resume_ocr"));
  });

  it("every fallback is present in the live catalog snapshot", () => {
    const catalog = buildCatalogMatchSet(LIVE_CATALOG_VISION_ROWS);
    const configured = new Map([...collectConfiguredModels()].filter(([, uses]) => uses.includes("resume_ocr")));
    const audit = auditAgainstCatalog(configured, catalog);
    const fallbacks = audit.models.filter((r) => r.model !== CLAUDE_OPUS);
    assert.equal(fallbacks.length, 2);
    for (const row of fallbacks) assert.equal(row.availableInGateway, true, row.model);
  });

  it("still pads a non-vision use case with the shared free pool", () => {
    const autofill = resolveProfileChainForUseCase("autofill").map((p) => p.model);
    assert.ok(autofill.includes("qwen/qwen3-coder:free"), autofill.join(", "));
  });
});

describe("explicit_image_scan vision chain", () => {
  it("is a vision use case, so no text-only model is padded behind Sonnet", () => {
    assert.ok(VISION_USE_CASES.has("explicit_image_scan"));
    const chain = resolveProfileChainForUseCase("explicit_image_scan").map((p) => p.model);
    for (const textOnly of ["qwen/qwen3-coder:free", "google/gemma-4-31b-it:free", "cerebras/llama3.1-8b"]) {
      assert.ok(!chain.includes(textOnly), `${textOnly} leaked into the scan chain: ${chain.join(", ")}`);
    }
  });
});
