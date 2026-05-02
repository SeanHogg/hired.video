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
  resolveProfileChainForUseCase,
  resolveProviderForModel,
  type InferenceProfile,
  type ProviderEnv,
  type ProviderId,
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
 *     `_saOverride` for A/B testing — their override replaces the
 *     primary profile and SUPPRESSES cross-provider fallback (if SA is
 *     testing a specific model, they want to know when it fails, not
 *     have the facade silently switch vendors).
 *   - The selected provider's API key is resolved from the Worker env;
 *     missing keys skip a profile and try the next.
 *   - On total provider outage, the facade walks the use case's
 *     cross-provider fallback list (`UseCaseProfile.fallbacks`) before
 *     giving up — see providers.ts for which use cases opt in.
 */
export function createLLMClient(
  env: ProviderEnv | undefined,
  user: JwtPayload | null | undefined,
): LLMClient {
  const sa = isSuperAdmin(user);

  // Strip non-SA `_saOverride` so a malicious caller cannot inject one
  // through an upstream untrusted source.
  const sanitize = (options: LLMOptions): LLMOptions =>
    sa ? options : { ...options, _saOverride: undefined };

  /**
   * Build the ordered list of profiles the facade should try for a call.
   * SA override (when present and the caller is SA) replaces the entire
   * chain — we don't want fallback masking SA test failures.
   */
  const buildProfileChain = (options: LLMOptions): InferenceProfile[] => {
    if (sa && options._saOverride) {
      const o = options._saOverride;
      const base = resolveProfileChainForUseCase(options.useCase)[0];
      return [
        {
          model: o.model ?? base.model,
          temperature: o.temperature ?? base.temperature,
          maxTokens: o.maxTokens ?? base.maxTokens,
        },
      ];
    }
    return resolveProfileChainForUseCase(options.useCase);
  };

  /**
   * For one attempt: pick the API key for this profile's provider, run
   * the lower-level helper with the profile pinned via `_saOverride`
   * (the lowest layer accepts that field as "use this exact profile,
   * don't re-resolve from useCase"), and return the result. Throws on
   * failure so the caller can advance to the next profile.
   */
  const runWithProfile = async <Out>(
    profile: InferenceProfile,
    saOverrideProvider: ProviderId | undefined,
    options: LLMOptions,
    run: (apiKey: string, optionsForRun: LLMOptions) => Promise<Out>,
  ): Promise<Out> => {
    const providerId = saOverrideProvider ?? resolveProviderForModel(profile.model);
    const apiKey = getProviderApiKey(env, providerId);
    if (!apiKey) {
      throw new Error(`LLM unavailable: ${providerId.toUpperCase()}_API_KEY not configured`);
    }
    const pinned: LLMOptions = {
      ...options,
      _saOverride: {
        model: profile.model,
        temperature: profile.temperature,
        maxTokens: profile.maxTokens,
        provider: providerId,
      },
    };
    return run(apiKey, pinned);
  };

  const dispatch = async <Out>(
    options: LLMOptions,
    run: (apiKey: string, optionsForRun: LLMOptions) => Promise<Out>,
  ): Promise<Out> => {
    const chain = buildProfileChain(options);
    const saProviderOverride = sa ? options._saOverride?.provider : undefined;

    const errors: string[] = [];
    for (let i = 0; i < chain.length; i++) {
      const profile = chain[i];
      const isPrimary = i === 0;
      try {
        return await runWithProfile(
          profile,
          isPrimary ? saProviderOverride : undefined,
          options,
          run,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`[${profile.model}] ${msg}`);
        if (i < chain.length - 1) {
          console.warn(
            `[llm-facade] ${options.useCase} profile ${profile.model} failed, ` +
              `falling back to ${chain[i + 1].model}: ${msg.slice(0, 150)}`,
          );
        }
      }
    }
    throw new Error(
      `All ${chain.length} profile(s) for use case "${options.useCase}" failed:\n${errors.join("\n")}`,
    );
  };

  return {
    callJson<T>(options: LLMOptions, schema: z.ZodType<T>) {
      const safe = sanitize(options);
      return dispatch(safe, (apiKey, optionsForRun) =>
        callLLMJsonWithUsage(apiKey, optionsForRun, schema),
      );
    },
    callText(options: LLMOptions) {
      const safe = sanitize(options);
      return dispatch(safe, (apiKey, optionsForRun) =>
        callLLMWithUsage(apiKey, optionsForRun).then((r) => ({
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
