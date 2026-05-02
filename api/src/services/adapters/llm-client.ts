/**
 * LLMClient — single port through which route handlers talk to an LLM
 * provider.
 *
 * Two non-negotiable invariants:
 *
 *   1. Every call MUST declare a `useCase`. The facade looks up a
 *      profile (model + temperature + maxTokens) in USE_CASE_PROFILES
 *      and applies it. Callers do not (and cannot) pass model /
 *      temperature / provider — those are product decisions, not knobs.
 *
 *   2. Vendor identity (model id, provider) is invisible to end users.
 *      It is only visible to SuperAdmin via the audit ledger and the
 *      `/api/superadmin/ai/use-cases` endpoint. SA may override the
 *      profile for A/B testing via `_saOverride`; the facade enforces
 *      that this override is silently dropped for non-SA callers.
 *
 * Why a port?
 *   - Routes stay provider-agnostic. Swapping OpenRouter for direct
 *     Anthropic, Cerebras, or a self-hosted Ollama is a one-file change.
 *   - Tests inject a FakeLLMClient so they don't need real network
 *     calls or real API keys.
 *   - Multiple calls within a single handler (analyze + tailor,
 *     bake-off harness) can share one client instance.
 *
 * Factories:
 *   - `createLLMClient(env, user)`  — recommended. Multi-provider;
 *     auto-routes to the right vendor based on the call's useCase,
 *     pulling the correct API key from the Worker env.
 *   - `createNoKeyLLMClient()`      — null-object for routes whose
 *     fallback path doesn't need an LLM (returns rejected promises).
 */

import type { z } from "zod";
import { callLLMJsonWithUsage, callLLMWithUsage, type LLMOptions, type LLMUsage } from "./ai.js";
import {
  getProviderApiKey,
  resolveProfileForUseCase,
  resolveProviderForModel,
  type ProviderEnv,
} from "./providers.js";
import { isSuperAdmin } from "../../middleware/superAdmin.js";
import type { JwtPayload } from "../../types/index.js";

export interface LLMClient {
  /**
   * Call the model with a JSON schema — returns parsed data + usage.
   * Throws when every model in the fallback chain fails.
   */
  callJson<T>(options: LLMOptions, schema: z.ZodType<T>): Promise<{ data: T; usage: LLMUsage }>;
  /**
   * Call the model and return the raw text response + usage. Used for
   * the bake-off harness and anywhere you need to diff / inspect the
   * raw LLM output.
   */
  callText(options: LLMOptions): Promise<{ content: string; usage: LLMUsage }>;
}

/**
 * Build the use-case-driven LLM facade. Each call must specify its own
 * `useCase` in `LLMOptions` — that drives the model + sampling profile.
 * The facade enforces:
 *   - Non-SA callers cannot override the profile (any `_saOverride` they
 *     try to pass is dropped).
 *   - SA callers can override one or more profile fields via
 *     `_saOverride` for A/B testing. Their override is honored.
 *   - The selected provider's API key is resolved from the Worker env;
 *     if missing, the call rejects so the route can fall back to its
 *     mock / keyword path.
 */
export function createLLMClient(
  env: ProviderEnv | undefined,
  user: JwtPayload | null | undefined,
): LLMClient {
  const sa = isSuperAdmin(user);

  // Strip non-SA `_saOverride` so a malicious caller cannot inject one
  // through an upstream untrusted source. SA overrides are passed through
  // verbatim and applied by the lower-level helper.
  const sanitize = (options: LLMOptions): LLMOptions =>
    sa ? options : { ...options, _saOverride: undefined };

  const dispatch = <Out>(
    options: LLMOptions,
    run: (apiKey: string) => Promise<Out>,
  ): Promise<Out> => {
    const profile = resolveProfileForUseCase(options.useCase);
    const overrideModel = sa ? options._saOverride?.model : undefined;
    const overrideProvider = sa ? options._saOverride?.provider : undefined;
    const model = overrideModel ?? profile.model;
    const providerId = overrideProvider ?? resolveProviderForModel(model);
    const apiKey = getProviderApiKey(env, providerId);
    if (!apiKey) {
      return Promise.reject(
        new Error(`LLM unavailable: ${providerId.toUpperCase()}_API_KEY not configured`),
      );
    }
    return run(apiKey);
  };

  return {
    callJson<T>(options: LLMOptions, schema: z.ZodType<T>) {
      const safe = sanitize(options);
      return dispatch(safe, (apiKey) => callLLMJsonWithUsage(apiKey, safe, schema));
    },
    callText(options: LLMOptions) {
      const safe = sanitize(options);
      return dispatch(safe, (apiKey) =>
        callLLMWithUsage(apiKey, safe).then((r) => ({
          content: r.content,
          usage: r.usage,
        })),
      );
    },
  };
}

/**
 * A no-op client used by routes when no API key is configured. Both
 * methods reject — the route is expected to catch and fall through to
 * the keyword-overlap path.
 */
export function createNoKeyLLMClient(): LLMClient {
  const err = () => Promise.reject(new Error("LLM unavailable: no provider key configured"));
  return {
    callJson: err as never,
    callText: err as never,
  };
}
