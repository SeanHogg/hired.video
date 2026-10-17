/**
 * The LLM client factory: builds the `LLMClient` facade backed by the
 * Builderforce gateway. Each method gates the budget, resolves the
 * profile chain (routing.ts), dispatches (dispatch.ts), validates JSON
 * answers (json-schema.ts) and charges the ledger (metering.ts).
 */

import type { z } from "zod";
import { BuilderforceClient, type ChatMessage } from "@seanhogg/builderforce-sdk";
import { isSuperAdmin } from "../../../middleware/superAdmin.js";
import { tokenLedger } from "../../../domains/billing/token-ledger.js";
import type { JwtPayload } from "../../../types/index.js";
import { dispatchChain } from "./dispatch.js";
import {
  deriveStrictJsonSchema,
  parseAndValidateJson,
  pickResponseFormat,
  type LenientIngest,
} from "./json-schema.js";
import { buildMetadata, chargeLedger } from "./metering.js";
import { buildProfileChain } from "./routing.js";
import type {
  LLMCallOpts,
  LLMClient,
  LLMEnv,
  LLMMessagesOptions,
  LLMOptions,
  LLMResult,
  LLMUsage,
} from "./types.js";

/**
 * Build the LLM facade. One implementation, backed by Builderforce.
 * Routes call this exactly the same way as before; nothing else
 * changes from a route-handler's perspective.
 */
export function createLLMClient(
  env: LLMEnv | undefined,
  user: JwtPayload | null | undefined,
): LLMClient {
  const apiKey = env?.BUILDERFORCE_API_KEY?.trim();
  if (!apiKey) {
    return createNoKeyLLMClient();
  }
  const sdk = new BuilderforceClient({
    apiKey,
    baseUrl: env?.BUILDERFORCE_GATEWAY_URL,
    // Default 60s; per-call override via LLMCallOpts.timeoutMs.
    timeoutMs: 60_000,
  });

  const sa = isSuperAdmin(user);
  return {
    async callJson<T>(
      featureKey: string,
      options: LLMOptions,
      schema: z.ZodType<T>,
      opts: LLMCallOpts = {},
    ): Promise<{ data: T; usage: LLMUsage }> {
      if (!opts.exempt) await tokenLedger.ensureBudget(user);
      const safe = sa ? options : { ...options, _saOverride: undefined };
      const chain = buildProfileChain(sa, safe.useCase, safe._saOverride);

      // Opportunistically derive a JSON Schema from the supplied Zod
      // schema and ask the gateway for vendor-side `strict: true`
      // conformance retry (Builderforce SDK ≥0.6). When the caller
      // already passed `jsonSchema` explicitly, honour that; otherwise
      // try to derive. Schemas that don't translate cleanly (transforms,
      // refines, top-level z.union with non-object branches, etc.) just
      // fall back to plain `json_object` mode — caller behaviour is
      // unchanged in that case.
      const jsonSchema = safe.jsonSchema ?? deriveStrictJsonSchema(schema, featureKey);

      let parsedData: T | undefined;
      const result = await dispatchChain(sdk, {
        chain,
        useCase: safe.useCase,
        messages: [
          { role: "system", content: safe.systemPrompt },
          { role: "user", content: safe.userMessage },
        ],
        responseFormat: pickResponseFormat(
          jsonSchema
            ? { ...safe, jsonSchema }
            : { ...safe, responseFormat: "json_object" },
        ),
        metadata: buildMetadata(user, featureKey, opts),
        callOpts: opts,
        validateContent: (content) => {
          parsedData = parseAndValidateJson(content, schema);
        },
      });

      if (parsedData === undefined) {
        throw new Error("Gateway returned content without running validator");
      }

      await chargeLedger(user, featureKey, result.usage, opts);
      return { data: parsedData, usage: result.usage };
    },

    async callJsonLenient<Wire, Canonical>(
      featureKey: string,
      options: LLMOptions,
      spec: LenientIngest<Wire, Canonical>,
      opts: LLMCallOpts = {},
    ): Promise<{ data: Canonical; usage: LLMUsage }> {
      if (!opts.exempt) await tokenLedger.ensureBudget(user);
      const safe = sa ? options : { ...options, _saOverride: undefined };
      const chain = buildProfileChain(sa, safe.useCase, safe._saOverride);

      // Auto-derive a JSON Schema from the lenient Zod schema so the
      // gateway can run vendor-side `strict: true` conformance retries
      // (Builderforce SDK ≥0.6) on every field EXCEPT the wide-typed
      // ones the lenient schema deliberately allows. We don't pass an
      // explicit `jsonSchema` from the caller — it's derived once here
      // (via the shared guard) so the wire schema and the gateway's
      // enforcement schema can never drift, AND so a schema too complex
      // for vendor constrained-decoding (e.g. the full resume document
      // in `match_tailor`) falls back to plain `json_object` mode
      // instead of triggering Gemini's permanent `400 too many states`
      // (gap #1801). Our post-hoc lenient parse + coerce + retry still
      // guarantees the canonical shape either way.
      const jsonSchema = deriveStrictJsonSchema(spec.ingest, spec.name);

      let coerced: Canonical | undefined;
      const result = await dispatchChain(sdk, {
        chain,
        useCase: safe.useCase,
        messages: [
          { role: "system", content: safe.systemPrompt },
          { role: "user", content: safe.userMessage },
        ],
        responseFormat: pickResponseFormat(
          jsonSchema
            ? { ...safe, jsonSchema }
            : { ...safe, responseFormat: "json_object" },
        ),
        metadata: buildMetadata(user, featureKey, opts),
        callOpts: opts,
        validateContent: (content) => {
          // Lenient parse first, then coerce. If coerce throws on a
          // malformed wire value (shouldn't happen — coerce is meant
          // to be total — but free-tier output is unpredictable), the
          // dispatch loop treats it as a model failure and advances
          // to the next profile.
          const wire = parseAndValidateJson(content, spec.ingest);
          coerced = spec.coerce(wire);
        },
      });

      if (coerced === undefined) {
        throw new Error("Gateway returned content without running validator");
      }

      await chargeLedger(user, featureKey, result.usage, opts);
      return { data: coerced, usage: result.usage };
    },

    async callText(
      featureKey: string,
      options: LLMOptions,
      opts: LLMCallOpts = {},
    ): Promise<{ content: string; usage: LLMUsage }> {
      if (!opts.exempt) await tokenLedger.ensureBudget(user);
      const safe = sa ? options : { ...options, _saOverride: undefined };
      const chain = buildProfileChain(sa, safe.useCase, safe._saOverride);

      const result = await dispatchChain(sdk, {
        chain,
        useCase: safe.useCase,
        messages: [
          { role: "system", content: safe.systemPrompt },
          { role: "user", content: safe.userMessage },
        ],
        responseFormat: pickResponseFormat({ ...safe, responseFormat: "text" }),
        metadata: buildMetadata(user, featureKey, opts),
        callOpts: opts,
      });

      await chargeLedger(user, featureKey, result.usage, opts);
      return { content: result.content, usage: result.usage };
    },

    async callMessages(
      featureKey: string,
      options: LLMMessagesOptions,
      opts: LLMCallOpts = {},
    ): Promise<LLMResult> {
      if (!opts.exempt) await tokenLedger.ensureBudget(user);
      const safe = sa ? options : { ...options, _saOverride: undefined };
      const chain = buildProfileChain(sa, safe.useCase, safe._saOverride);

      // Translate our LLMMessage shape to SDK ChatMessage. Our messages
      // always carry string content; the SDK's `string | ContentPart[]
      // | null` is wider but we don't use vision content blocks yet.
      const sdkMessages: ChatMessage[] = safe.messages.map((m) => {
        const out: ChatMessage = { role: m.role, content: m.content };
        if (m.tool_calls) out.tool_calls = m.tool_calls;
        if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
        if (m.name) out.name = m.name;
        return out;
      });

      const result = await dispatchChain(sdk, {
        chain,
        useCase: safe.useCase,
        messages: sdkMessages,
        responseFormat: pickResponseFormat({ responseFormat: safe.responseFormat ?? "text" }),
        tools: safe.tools,
        toolChoice: safe.toolChoice,
        metadata: buildMetadata(user, featureKey, opts),
        callOpts: opts,
      });

      await chargeLedger(user, featureKey, result.usage, opts);
      return result;
    },
  };
}

/**
 * No-op client used when no gateway key is configured. Both methods
 * reject — routes are expected to catch and fall through to the
 * keyword-overlap path.
 */
export function createNoKeyLLMClient(): LLMClient {
  const err = () =>
    Promise.reject(new Error("LLM unavailable: BUILDERFORCE_API_KEY not configured"));
  return {
    callJson: err as never,
    callJsonLenient: err as never,
    callText: err as never,
    callMessages: err as never,
  };
}

/** True when the gateway key is configured. */
export function hasAnyLLMProviderKey(env: LLMEnv | undefined): boolean {
  return Boolean(env?.BUILDERFORCE_API_KEY?.trim());
}
