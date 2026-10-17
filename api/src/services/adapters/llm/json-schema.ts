/**
 * Schema coercion + validation for JSON-mode LLM calls: lenient-ingest
 * pairings, post-hoc parse + Zod validation, strict-mode `json_schema`
 * derivation (with the vendor state-budget guard), and `response_format`
 * selection.
 */

import { z, toJSONSchema } from "zod";
import type { JsonSchemaSpec, ResponseFormat } from "@seanhogg/builderforce-sdk";

/**
 * A "lenient-ingest" pairing: what the LLM is allowed to emit on the
 * wire, and how to coerce that wire shape into the canonical TS shape
 * the rest of the app uses.
 *
 * Why: free-tier models (qwen, gemma) drift on strict-enum fields —
 * Career 360's `roadmap[N].horizon` saw `"6m"` / `"1y"` / `"4w"` /
 * `"30 days"` instead of the strict `"30d" | "60d" | "90d" | "180d"`,
 * which killed the call across a 3-profile fallback chain even though
 * the underlying intent was fine. This pattern keeps the strict
 * schema in place at the storage / wire boundary while giving the
 * gateway + the LLM a relaxed schema they can actually conform to.
 *
 * Use `defineLenientIngest` so TS infers `Wire` and `Canonical` from
 * the supplied schema + coercion function and you don't have to type
 * them explicitly:
 *
 *   const PlanIngest = defineLenientIngest({
 *     name: "Career360Plan",
 *     ingest: LenientPlanResponseSchema,
 *     coerce: (wire) => ({ ...wire, roadmap: wire.roadmap.map(s => ({
 *       ...s, horizon: normalizeHorizon(s.horizon),
 *     })) }),
 *   });
 *   const result = await client.callJsonLenient(key, opts, PlanIngest);
 *   // result.data is the strict canonical shape.
 */
export interface LenientIngest<Wire, Canonical> {
  /** Stable name for the gateway's strict-mode `json_schema` registration.
   *  Surfaces in `_builderforce.schemaRetries` telemetry so SA can see
   *  which ingest schemas are causing vendor-side conformance retries. */
  name: string;
  /** Lenient Zod schema — what the LLM is expected to produce on the
   *  wire. Wider than canonical: free-form `z.string()` in place of
   *  strict enums where free-tier drift is observed. */
  ingest: z.ZodType<Wire>;
  /** Map a wire value onto the canonical shape. Runs after the lenient
   *  schema validates, so `wire` is fully typed. Should be pure +
   *  total — caller-side normalization, not validation. */
  coerce: (wire: Wire) => Canonical;
}

/** Identity-shaped factory that exists purely so callers can write
 *  `defineLenientIngest({ ... })` and have TypeScript infer `Wire` and
 *  `Canonical` from the supplied schema + coercion function. */
export function defineLenientIngest<Wire, Canonical>(
  spec: LenientIngest<Wire, Canonical>,
): LenientIngest<Wire, Canonical> {
  return spec;
}

/** Strip leading/trailing markdown code fences a model occasionally
 *  wraps around its JSON output. Belt-and-suspenders even with
 *  `response_format: json_object` — some free-tier models still wrap. */
function stripJsonFences(content: string): string {
  return content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
}

/** Parse + zod-validate a JSON string. Throws on parse / schema fail
 *  so the dispatch loop can advance to the next profile. */
export function parseAndValidateJson<T>(content: string, schema: z.ZodType<T>): T {
  const stripped = stripJsonFences(content);
  const obj = JSON.parse(stripped);
  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    throw new Error(`LLM returned invalid schema: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Rough upper bound on the number of constrained-decoding "states" a
 *  vendor (notably Google AI / Gemini) must compile a strict
 *  `responseSchema` into. Gemini hard-rejects schemas past its internal
 *  ceiling with `400: The specified schema produces a constraint that
 *  has too many states for serving` — a PERMANENT failure, not a
 *  transient one (gap #1801). We approximate the cost by counting every
 *  declared property + enum member across the whole (recursively walked)
 *  schema, including `$defs`, `items`, `additionalProperties`, and
 *  `anyOf`/`oneOf`/`allOf` branches. Cheaper than modelling Gemini's
 *  exact grammar and monotonic in the things that actually blow it up
 *  (lots of properties, long enums, deep nesting). */
export function estimateSchemaStates(node: unknown, depth = 0): number {
  if (depth > 12 || node === null || typeof node !== "object") return 0;
  const obj = node as Record<string, unknown>;
  let count = 0;
  if (Array.isArray(obj.enum)) count += obj.enum.length;
  for (const bagKey of ["properties", "$defs", "definitions"] as const) {
    const bag = obj[bagKey];
    if (bag && typeof bag === "object") {
      for (const child of Object.values(bag as Record<string, unknown>)) {
        count += 1 + estimateSchemaStates(child, depth + 1);
      }
    }
  }
  if (obj.items) count += estimateSchemaStates(obj.items, depth + 1);
  if (obj.additionalProperties && typeof obj.additionalProperties === "object") {
    count += estimateSchemaStates(obj.additionalProperties, depth + 1);
  }
  for (const branchKey of ["anyOf", "oneOf", "allOf"] as const) {
    const branch = obj[branchKey];
    if (Array.isArray(branch)) {
      for (const b of branch) count += estimateSchemaStates(b, depth + 1);
    }
  }
  return count;
}

/** Above this estimated state count we DON'T register the schema as a
 *  strict vendor-side `responseSchema` — we fall back to plain
 *  `json_object` mode and rely on our own post-hoc Zod validation +
 *  retry. Tuned so the full JSON-Resume `ResumeContentSchema` (~170
 *  states — the resume-tailor pipeline) falls back, while the small
 *  enum-bearing schemas that genuinely benefit from vendor conformance
 *  retry (Career360 plan, match insights — under ~20 states) stay
 *  strict. See gap #1801. */
const MAX_STRICT_SCHEMA_STATES = 100;

/** Try to derive a Builderforce-shaped `JsonSchemaSpec` from a Zod
 *  schema so the gateway can run vendor-side `strict: true` conformance
 *  retries. Returns `null` (caller falls back to plain `json_object`
 *  mode) when EITHER:
 *    • the schema can't be translated cleanly (transforms, refinements,
 *      top-level non-object unions) — the gateway only accepts
 *      object-rooted schemas for strict mode; or
 *    • the schema is too complex for vendor constrained-decoding —
 *      Gemini returns a permanent `400 too many states` (gap #1801) that
 *      no fallback model in the chain can absorb once the gateway
 *      cascades into Gemini.
 *  `name` doubles as the schema's id for SA's
 *  `_builderforce.schemaRetries` telemetry. Single source of truth for
 *  both `callJson` and `callJsonLenient` so the two paths can't drift on
 *  whether/when strict mode is safe. */
export function deriveStrictJsonSchema(
  schema: z.ZodType<unknown>,
  name: string,
): JsonSchemaSpec | null {
  try {
    const derived = toStrictSafeSchema(toJSONSchema(schema));
    if (!derived || derived.type !== "object") return null;
    if (estimateSchemaStates(derived) > MAX_STRICT_SCHEMA_STATES) return null;
    return { name, strict: true, schema: derived };
  } catch {
    return null;
  }
}

/** Keywords vendor strict modes reject (Anthropic structured outputs 400s
 *  on numeric / length constraints; OpenAI strict on most of these too).
 *  Dropping them is safe: every caller re-validates the answer with the
 *  original Zod schema, which still enforces them. */
const STRICT_UNSUPPORTED_KEYWORDS: ReadonlySet<string> = new Set([
  "$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "pattern", "format", "minItems", "maxItems", "propertyNames", "default",
]);
const STRICT_SCHEMA_BAGS: ReadonlySet<string> = new Set(["properties", "$defs", "definitions"]);

/**
 * The strict-mode-safe copy of a derived JSON Schema, or null when it can't
 * be expressed strictly. Strict decoding needs every object closed
 * (`additionalProperties: false`), so a record / open object
 * (`z.record`, `.passthrough()`) means "use json_object instead" — the
 * scorer's `actionArgs` record made every Claude attempt 400 and the AI
 * Resume Scorer answer 503 LLM_UNAVAILABLE (2026-10-10).
 */
export function toStrictSafeSchema(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    const out: unknown[] = [];
    for (const item of node) {
      // Scalars (enum / required values, including a literal null) pass as-is.
      if (item === null || typeof item !== "object") {
        out.push(item);
        continue;
      }
      const safe = toStrictSafeSchema(item);
      if (safe === null) return null;
      out.push(safe);
    }
    return out as unknown as Record<string, unknown>;
  }
  if (node === null || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (obj.type === "object" && obj.additionalProperties !== undefined && obj.additionalProperties !== false) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (STRICT_UNSUPPORTED_KEYWORDS.has(key)) continue;
    // A bag of named sub-schemas: its keys are field names (a field may be
    // called "format" or "pattern"), so only its values are schemas.
    if (STRICT_SCHEMA_BAGS.has(key) && value !== null && typeof value === "object" && !Array.isArray(value)) {
      const bag: Record<string, unknown> = {};
      for (const [field, sub] of Object.entries(value as Record<string, unknown>)) {
        const safe = toStrictSafeSchema(sub);
        if (safe === null) return null;
        bag[field] = safe;
      }
      out[key] = bag;
    } else if (value !== null && typeof value === "object") {
      const safe = toStrictSafeSchema(value);
      if (safe === null) return null;
      out[key] = safe;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** A JSON-mode answer the model stopped at `max_tokens`: it cannot parse,
 *  so the dispatch loop treats it as a failed attempt. */
export function isTruncatedJson(finishReason: string | null | undefined, format: ResponseFormat | undefined): boolean {
  return finishReason === "length" && !!format && format.type !== "text";
}

/** Build the `response_format` value the gateway expects. JSON-mode
 *  callers pass `responseFormat: "json_object"` (loose) or
 *  `jsonSchema` (strict, gateway retries on schema-fail). Text-mode
 *  callers omit response_format entirely. */
export function pickResponseFormat(
  opts: { responseFormat?: "json_object" | "text"; jsonSchema?: JsonSchemaSpec },
): ResponseFormat | undefined {
  if (opts.jsonSchema) {
    return { type: "json_schema", json_schema: opts.jsonSchema };
  }
  if (opts.responseFormat === "json_object") {
    return { type: "json_object" };
  }
  if (opts.responseFormat === "text") {
    return { type: "text" };
  }
  return undefined;
}
