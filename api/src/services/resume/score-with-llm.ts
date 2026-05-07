/**
 * Shared LLM-or-fallback scoring helper. Both the AI Resume Scorer and
 * the Resume Optimizer route the user's resume text through an LLM with
 * a structured-JSON system prompt; if the LLM is unavailable (no API
 * key in dev/test, upstream error, or response fails schema validation)
 * they return a deterministic constant fallback instead.
 *
 * Returns the parsed schema-valid LLM result OR the fallback constant.
 * Over-budget (429) is thrown as `TokenBudgetExceededError` by the
 * client and converted to a 429 response by `app.onError`; callers do
 * not need to handle it explicitly.
 */

import type { Context } from "hono";
import type { z } from "zod";
import type { Env, Variables } from "../../types/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../adapters/llm-client.js";
import { TokenBudgetExceededError } from "../../domains/billing/token-ledger.js";
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
): Promise<T> {
  if (
    !hasAnyLLMProviderKey(args.c.env as any) ||
    args.resumeText.trim().length < MIN_RESUME_TEXT_LENGTH
  ) {
    return args.fallback;
  }
  try {
    const client = createLLMClient(args.c.env as any, args.c.var.user);
    const { data } = await client.callJson(
      args.featureKey,
      {
        useCase: args.useCase,
        systemPrompt: args.systemPrompt,
        // 12k char cap matches resume-roast.ts — fits inside every
        // configured model's context window with room for completion.
        userMessage: args.userMessage.slice(0, MAX_RESUME_TEXT_LENGTH * 2),
      },
      args.schema,
    );
    return data;
  } catch (err) {
    // Over-quota — propagate so the global onError converts to 429.
    if (err instanceof TokenBudgetExceededError) throw err;
    console.error(
      `[${args.featureKey}] LLM error, falling back to placeholder:`,
      err instanceof Error ? err.message : err,
    );
    return args.fallback;
  }
}
