/**
 * Unit coverage for the two LLM-dispatch fixes behind gaps #1801 / #1802:
 *
 *   • `deriveStrictJsonSchema` / `estimateSchemaStates` — the
 *     complexity guard that stops us registering an oversized strict
 *     `responseSchema` (the full JSON-Resume document) that Gemini
 *     rejects permanently with `400 too many states`. Small schemas
 *     still go strict; the resume document falls back to json_object.
 *
 *   • `looksLikeSchemaRejection` — reclassifies a 429-wrapped Gemini
 *     schema 400 as a `schema` failure so the user gets an honest 502
 *     instead of "providers at capacity, retry in a minute".
 *
 * Fixtures use the REAL `ResumeContentSchema` (the actual schema that
 * blew up in production) and the verbatim googleai 400 message from the
 * production 503 (correlationId llm-7a1c2422) — not a synthetic stand-in
 * — so the thresholds are exercised against the shape that actually
 * fails.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ResumeContentSchema } from "../../../../../shared/resume.js";
import {
  deriveStrictJsonSchema,
  estimateSchemaStates,
  looksLikeSchemaRejection,
} from "../llm-client.js";

// Verbatim from the production 503 (correlationId llm-7a1c2422). The
// gateway wraps this googleai 400 inside a 429 cascade_exhausted.
const GEMINI_TOO_MANY_STATES =
  '[googleai] 400: [{ "error": { "code": 400, "message": "The specified ' +
  'schema produces a constraint that has too many states for serving. ' +
  "Typical causes of this error are schemas with lots of text...";

describe("estimateSchemaStates", () => {
  it("returns a low count for a small object schema", () => {
    const small = z.object({
      score: z.number(),
      summary: z.string(),
      fit: z.enum(["strong", "good", "fair", "weak"]),
    });
    const states = estimateSchemaStates(z.toJSONSchema(small));
    // 3 props + 4 enum members — comfortably under the strict ceiling.
    assert.ok(states < 100, `expected small schema under ceiling, got ${states}`);
  });

  it("counts the full JSON-Resume document well over the strict ceiling", () => {
    const states = estimateSchemaStates(z.toJSONSchema(ResumeContentSchema));
    assert.ok(
      states > 100,
      `expected ResumeContentSchema over the 100-state ceiling, got ${states}`,
    );
  });

  it("ignores primitives / null / over-deep nodes without throwing", () => {
    assert.equal(estimateSchemaStates(null), 0);
    assert.equal(estimateSchemaStates("string"), 0);
    assert.equal(estimateSchemaStates(42), 0);
  });
});

describe("deriveStrictJsonSchema", () => {
  it("registers a small object schema as strict", () => {
    const small = z.object({ score: z.number(), summary: z.string() });
    const spec = deriveStrictJsonSchema(small, "match_analyze");
    assert.ok(spec, "expected a strict spec for a small schema");
    assert.equal(spec?.strict, true);
    assert.equal(spec?.name, "match_analyze");
  });

  it("falls back (returns null) for the oversized resume document — gap #1801", () => {
    const spec = deriveStrictJsonSchema(ResumeContentSchema, "match_tailor");
    assert.equal(
      spec,
      null,
      "the full resume schema must NOT be sent as a strict responseSchema",
    );
  });

  it("falls back (returns null) for a non-object-rooted schema", () => {
    const topLevelUnion = z.union([z.string(), z.number()]);
    assert.equal(deriveStrictJsonSchema(topLevelUnion, "x"), null);
  });
});

describe("looksLikeSchemaRejection", () => {
  it("flags the real Gemini too-many-states 400", () => {
    assert.equal(looksLikeSchemaRejection(GEMINI_TOO_MANY_STATES), true);
  });

  it("flags generic invalid-schema / responseSchema messages", () => {
    assert.equal(looksLikeSchemaRejection("LLM returned invalid schema: ..."), true);
    assert.equal(looksLikeSchemaRejection("400: responseSchema rejected"), true);
  });

  it("does NOT flag a genuine rate-limit message", () => {
    assert.equal(
      looksLikeSchemaRejection("429 Too Many Requests: rate limit exceeded, retry later"),
      false,
    );
  });
});
