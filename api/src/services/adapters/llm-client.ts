/**
 * LLMClient — single port through which route handlers talk to an LLM
 * provider.
 *
 * Why a port?
 *   - Routes (and their handlers) stay provider-agnostic. Swapping
 *     OpenRouter for direct Anthropic or a self-hosted Ollama is a
 *     one-file change.
 *   - Tests inject a FakeLLMClient so they don't need real network
 *     calls or real API keys. This is the main driver: match flows
 *     kept breaking because every path that used `callLLMJsonWithUsage`
 *     directly had to test against a live network in CI, which flaps.
 *   - Multiple concurrent calls inside a single handler (analyze +
 *     tailor, bake-off harness) can share one client instance and one
 *     mental model.
 *
 * This module is intentionally tiny — the factory wraps the existing
 * `callLLMJsonWithUsage` so we don't have to rewrite the OpenRouter
 * integration. The FakeLLMClient for tests lives alongside the handlers
 * that use it.
 */

import type { z } from "zod";
import { callLLMJsonWithUsage, callLLMWithUsage, type LLMOptions, type LLMUsage } from "./ai.js";

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
 * Default client — delegates to the OpenRouter helpers in ai.ts.
 */
export function createOpenRouterClient(apiKey: string): LLMClient {
  return {
    callJson<T>(options: LLMOptions, schema: z.ZodType<T>) {
      return callLLMJsonWithUsage(apiKey, options, schema);
    },
    callText(options: LLMOptions) {
      return callLLMWithUsage(apiKey, options).then((r) => ({ content: r.content, usage: r.usage }));
    },
  };
}

/**
 * A no-op client used by routes when no API key is configured. Both
 * methods reject — the route is expected to catch and fall through to
 * the keyword-overlap path.
 */
export function createNoKeyLLMClient(): LLMClient {
  const err = () => Promise.reject(new Error("LLM unavailable: OPENROUTER_API_KEY not configured"));
  return {
    callJson: err as never,
    callText: err as never,
  };
}
