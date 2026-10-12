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
import { BuilderforceApiError } from "@seanhogg/builderforce-sdk";
import { ResumeContentSchema } from "../../../../../shared/resume.js";
import { ResumeAnalysisIngest } from "../../resume/analyze.js";
import {
  classifyAttemptError,
  deriveStrictJsonSchema,
  estimateSchemaStates,
  toStrictSafeSchema,
  isRequestShapeCascade,
  isTruncatedJson,
  isChainTerminal,
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

  it("falls back for the REAL scorer schema: its actionArgs record can't be strict (503 LLM_UNAVAILABLE, 2026-10-10)", () => {
    assert.equal(deriveStrictJsonSchema(ResumeAnalysisIngest.ingest, "resume_scorer"), null);
  });

  it("strips constraint keywords strict modes reject, keeps field names that look like keywords", () => {
    const schema = z.object({
      score: z.number().min(0).max(100),
      format: z.string().min(1),
      pattern: z.string().regex(/^[A-F]$/),
      tags: z.array(z.string()).max(5),
    });
    const spec = deriveStrictJsonSchema(schema, "x");
    assert.ok(spec);
    const json = JSON.stringify(spec?.schema);
    for (const kw of ["minimum", "maximum", "minLength", "maxItems", "$schema", "\"pattern\":\"^"]) {
      assert.equal(json.includes(kw), false, `${kw} should be stripped`);
    }
    const props = (spec?.schema as { properties: Record<string, unknown> }).properties;
    assert.deepEqual(Object.keys(props).sort(), ["format", "pattern", "score", "tags"]);
    assert.deepEqual(props.score, { type: "number" });
  });
});

describe("toStrictSafeSchema", () => {
  it("rejects open objects anywhere, keeps closed ones", () => {
    assert.equal(toStrictSafeSchema({ type: "object", properties: {}, additionalProperties: {} }), null);
    assert.equal(
      toStrictSafeSchema({ type: "object", properties: { a: { type: "object", additionalProperties: true } }, additionalProperties: false }),
      null,
    );
    assert.deepEqual(toStrictSafeSchema({ type: "object", properties: { a: { type: "string", enum: ["x", null] } }, additionalProperties: false }), {
      type: "object",
      properties: { a: { type: "string", enum: ["x", null] } },
      additionalProperties: false,
    });
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

describe("isRequestShapeCascade (structured failover signal — gap #1802)", () => {
  const fo = (vendor: string, kind?: string) => ({ model: `${vendor}/m`, vendor, code: 0, kind });

  it("flags a cascade where every concrete attempt is a 4xx client_error", () => {
    // Mirrors the Gemini `400 too many states` cascade: every upstream
    // rejected the REQUEST shape, none was rate-limited.
    assert.equal(
      isRequestShapeCascade([fo("openrouter", "client_error"), fo("googleai", "client_error")]),
      true,
    );
  });

  it("ignores `skipped` attempts but still flags the dispatched client_errors", () => {
    assert.equal(
      isRequestShapeCascade([fo("a", "skipped"), fo("googleai", "client_error")]),
      true,
    );
  });

  it("does NOT flag when any concrete attempt was an actual rate_limit", () => {
    assert.equal(
      isRequestShapeCascade([fo("openrouter", "rate_limit"), fo("googleai", "client_error")]),
      false,
    );
  });

  it("does NOT flag an empty / kind-less (older-gateway) trail", () => {
    assert.equal(isRequestShapeCascade(undefined), false);
    assert.equal(isRequestShapeCascade([]), false);
    assert.equal(isRequestShapeCascade([fo("openrouter")]), false);
  });
});

describe("classifyAttemptError — integrated dispatch classification", () => {
  const cascade = (
    failovers: Array<{ vendor: string; code: number; kind?: string }>,
    extra: { message?: string; correlationId?: string } = {},
  ) =>
    new BuilderforceApiError(
      extra.message ?? "cascade_exhausted",
      429,
      "cascade_exhausted",
      {
        correlationId: extra.correlationId ?? "llm-gateway-trace-1",
        failovers: failovers.map((f) => ({ model: `${f.vendor}/m`, ...f })),
      },
      "req-1",
      { vendor: failovers[failovers.length - 1]?.vendor },
    );

  it("captures the gateway trace id from details.correlationId — gap #1810", () => {
    const cls = classifyAttemptError(
      cascade([{ vendor: "googleai", code: 429, kind: "rate_limit" }], {
        correlationId: "llm-abc-123",
      }),
    );
    assert.equal(cls.traceId, "llm-abc-123");
  });

  it("reclassifies an all-client_error 429 cascade as `schema` (structured) — gap #1802", () => {
    const cls = classifyAttemptError(
      cascade([
        { vendor: "openrouter", code: 400, kind: "client_error" },
        { vendor: "googleai", code: 400, kind: "client_error" },
      ]),
    );
    assert.equal(cls.kind, "schema");
    assert.equal(cls.status, 429);
    assert.equal(cls.vendor, "googleai");
  });

  it("reclassifies via the message fallback when the gateway inlined the text", () => {
    const cls = classifyAttemptError(
      cascade([{ vendor: "googleai", code: 429 }], {
        message: '[googleai] 400: "...produces a constraint that has too many states for serving"',
      }),
    );
    assert.equal(cls.kind, "schema");
  });

  it("leaves a genuine rate-limit cascade as `rate_limit`", () => {
    const cls = classifyAttemptError(
      cascade([
        { vendor: "openrouter", code: 429, kind: "rate_limit" },
        { vendor: "cerebras", code: 429, kind: "rate_limit" },
      ]),
    );
    assert.equal(cls.kind, "rate_limit");
  });
});

describe("isTruncatedJson (a JSON answer cut off at max_tokens advances the chain)", () => {
  it("flags json_object / json_schema answers that stopped at the token cap", () => {
    assert.equal(isTruncatedJson("length", { type: "json_object" }), true);
    assert.equal(
      isTruncatedJson("length", { type: "json_schema", json_schema: { name: "x", schema: {} } } as never),
      true,
    );
  });

  it("leaves complete answers and prose alone", () => {
    assert.equal(isTruncatedJson("stop", { type: "json_object" }), false);
    assert.equal(isTruncatedJson("length", { type: "text" }), false);
    assert.equal(isTruncatedJson("length", undefined), false);
    assert.equal(isTruncatedJson(undefined, { type: "json_object" }), false);
  });
});

describe("isChainTerminal — stop walking the profile chain (#1570 / #2309)", () => {
  it("stops on a tenant-key 401 (no vendor selected) — every profile shares the key", () => {
    // Verbatim shape of the production 401 (#2309).
    const err = new BuilderforceApiError("Invalid or revoked tenant API key", 401, "unauthorized");
    assert.equal(isChainTerminal(err), true);
  });

  it("keeps walking on a vendor-scoped 401 — the next vendor may accept", () => {
    const err = new BuilderforceApiError("upstream auth", 401, "upstream_error", undefined, "r", { vendor: "cerebras" });
    assert.equal(isChainTerminal(err), false);
  });

  it("stops on a gateway-flagged terminal error", () => {
    const err = new BuilderforceApiError("cap", 429, "plan_token_limit_exceeded", undefined, "r", { terminal: true });
    assert.equal(isChainTerminal(err), true);
  });

  it("keeps walking on a vendor schema 400 (Cerebras maxLength rejection)", () => {
    const err = new BuilderforceApiError(
      "[cerebras] 400: Invalid fields for schema with types ['string']: {'maxLength'}",
      400, "invalid_request_error", undefined, "r", { vendor: "cerebras" },
    );
    assert.equal(isChainTerminal(err), false);
  });

  it("stops on Cloudflare's per-invocation subrequest cap", () => {
    assert.equal(isChainTerminal(new Error("Too many subrequests by single Worker invocation.")), true);
  });

  it("keeps walking on an ordinary transport error", () => {
    assert.equal(isChainTerminal(new TypeError("fetch failed")), false);
  });
});
