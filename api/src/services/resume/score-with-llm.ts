/**
 * Shared LLM-or-fallback scoring helper. Both the AI Resume Scorer and
 * the Resume Optimizer route the user's resume text through an LLM with
 * a structured-JSON system prompt; if the LLM is unavailable (no API
 * key in dev/test, upstream error, or response fails schema validation)
 * they return a deterministic constant fallback instead.
 *
 * Extracted because the try/aiCall/fallback ladder was duplicated across
 * resume-scorer.ts and resume-optimizer.ts (DRY rule). The variant bits
 * — system prompt, user message, response schema, fallback value — are
 * caller-supplied; everything else is here.
 *
 * Returns:
 *   • The parsed schema-valid LLM result, OR
 *   • The fallback constant, OR
 *   • A 429 `Response` (over budget) — propagate as-is so callers can
 *     `if (result instanceof Response) return result`.
 */

import type { Context } from "hono";
import type { z } from "zod";
import type { Env, Variables } from "../../types/index.js";
import { callLLMJsonWithUsage, getApiKey } from "../adapters/ai.js";
import { aiCall } from "../adapters/ai-call.js";
import type { LLMUseCase } from "../adapters/providers.js";

const MIN_RESUME_TEXT_LENGTH = 20;
const MAX_RESUME_TEXT_LENGTH = 12_000;

export interface ScoreWithLLMArgs<T> {
  /** Hono request context — used for budget gate and billing. */
  c: Context<{ Bindings: Env; Variables: Variables }>;
  /** Telemetry slug (e.g. "resume_scorer", "resume_optimizer"). Surfaces in `ai_usage_records.feature_key`. */
  featureKey: string;
  /** Inference-profile key from providers.ts. Both scorer and optimizer use `resume_optimize`. */
  useCase: LLMUseCase;
  /** Resume text from the request body — trimmed/empty input falls through to `fallback`. */
  resumeText: string;
  /** System prompt declaring the JSON shape we expect back. */
  systemPrompt: string;
  /** User message — caller composes (e.g. include a target job description). */
  userMessage: string;
  /** Zod schema validating the LLM JSON response. */
  schema: z.ZodType<T>;
  /** Constant returned when the LLM is unavailable, errors, or fails schema validation. */
  fallback: T;
}

export async function scoreWithLLMOrFallback<T>(
  args: ScoreWithLLMArgs<T>,
): Promise<T | Response> {
  const apiKey = getApiKey(args.c.env);
  if (!apiKey || args.resumeText.trim().length < MIN_RESUME_TEXT_LENGTH) {
    return args.fallback;
  }
  try {
    const result = await aiCall(args.c, args.featureKey, () =>
      callLLMJsonWithUsage(
        apiKey,
        {
          useCase: args.useCase,
          systemPrompt: args.systemPrompt,
          // 12k char cap matches resume-roast.ts — fits inside every
          // configured model's context window with room for completion.
          userMessage: args.userMessage.slice(0, MAX_RESUME_TEXT_LENGTH * 2),
        },
        args.schema,
      ),
    );
    if (result instanceof Response) return result; // 429 — over budget
    return result.data;
  } catch (err) {
    console.error(
      `[${args.featureKey}] LLM error, falling back to placeholder:`,
      err instanceof Error ? err.message : err,
    );
    return args.fallback;
  }
}
