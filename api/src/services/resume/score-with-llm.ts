/**
 * Shared LLM-or-fallback scoring helper. Both the AI Resume Scorer and
 * the Resume Optimizer route the user's resume text through an LLM with
 * a structured-JSON system prompt.
 *
 * Failure semantics, narrowed after a production incident on 2026-05-17
 * where the fallback constant was leaking to real users (the response
 * looked like a real "Optimized resume content draft." string instead
 * of an error). The helper now distinguishes the three failure modes:
 *
 *   1. No AI provider at all (no gateway key AND no Workers AI binding)
 *      → return the deterministic fallback. Hits only the local dev path.
 *      Keeping this branch lets contributors run the tool surfaces
 *      without an API key.
 *   2. Resume text too short to analyze → throw a 422 ValidationError
 *      so the caller surfaces "we couldn't read your resume" rather
 *      than presenting fake scores.
 *   3. Gateway errored or returned schema-invalid JSON → retry once on
 *      Cloudflare Workers AI (same fallback résumé parse/revise use, so a
 *      revoked gateway key no longer takes scoring down — #2309), parsed
 *      through the SAME lenient ingest. Only when that also fails → throw
 *      a 503 AppError so the frontend can prompt a retry. Never the
 *      fallback constant (that leaked to real users on 2026-05-17).
 *
 * Over-budget (429) is thrown as `TokenBudgetExceededError` by the
 * client and converted to a 429 response by `app.onError`; callers do
 * not need to handle it explicitly.
 */

import type { Context } from "hono";
import type { Env, Variables, AppEnv } from "../../types/index.js";
import {
  createLLMClient,
  hasAnyLLMProviderKey,
  type LenientIngest,
  type LLMStreamSink,
} from "../adapters/llm-client.js";
import { createWorkersAiTextCaller } from "../adapters/ai-text-caller.js";
import { TokenBudgetExceededError } from "../../domains/billing/token-ledger.js";
import type { LLMUseCase } from "../adapters/providers.js";
import { AppError, ValidationError } from "../../middleware/errorHandler.js";
import { extractJson } from "./parse.js";

const MIN_RESUME_TEXT_LENGTH = 20;
const MAX_RESUME_TEXT_LENGTH = 12_000;

export interface ScoreWithLenientLLMArgs<Wire, Canonical> {
  /** Hono request context — used for budget gate and billing. */
  c: Context<AppEnv>;
  /** Telemetry slug (e.g. "resume_scorer", "resume_optimizer"). Surfaces in `ai_usage_records.feature_key`. */
  featureKey: string;
  /** Inference-profile key from providers.ts. Both scorer and optimizer use `resume_optimize`. */
  useCase: LLMUseCase;
  /** Resume text from the request body — empty/short input throws ValidationError. */
  resumeText: string;
  /** System prompt declaring the JSON shape we expect back. */
  systemPrompt: string;
  /** User message — caller composes (e.g. include a target job description). */
  userMessage: string;
  /** Lenient-ingest spec — gateway gets a strict `json_schema` from the
   *  lenient Zod schema (vendor-side conformance retry) and the
   *  `coerce` step normalises drift-prone enum fields onto canonical
   *  values before the helper returns. */
  ingest: LenientIngest<Wire, Canonical>;
  /** Returned only on the local-dev "no gateway key configured" path.
   *  Production failures (timeout, schema drift, etc.) throw a 503
   *  AppError instead so they never reach the user as fake scores. */
  fallback: Canonical;
  /** Stream the gateway answer as it is generated (#1342). The Workers AI
   *  fallback is not streamed: its answer arrives whole on the result. */
  stream?: LLMStreamSink;
}

/** Lenient-ingest helper used by AI Resume Scorer + Resume Optimizer
 *  through `analyzeResume`. See file header for failure semantics. */
export async function scoreWithLenientLLMOrFallback<Wire, Canonical>(
  args: ScoreWithLenientLLMArgs<Wire, Canonical>,
): Promise<Canonical> {
  const env = args.c.env as any;
  const hasGateway = hasAnyLLMProviderKey(env);
  const workersAi = createWorkersAiTextCaller(env, { maxInputChars: MAX_RESUME_TEXT_LENGTH * 2 });
  if (!hasGateway && !workersAi) {
    return args.fallback;
  }
  if (args.resumeText.trim().length < MIN_RESUME_TEXT_LENGTH) {
    throw new ValidationError(
      `Resume text must be at least ${MIN_RESUME_TEXT_LENGTH} characters to analyze.`,
    );
  }
  const userMessage = args.userMessage.slice(0, MAX_RESUME_TEXT_LENGTH * 2);

  if (hasGateway) {
    try {
      const client = createLLMClient(env, args.c.var.user);
      const { data } = await client.callJsonLenient(
        args.featureKey,
        { useCase: args.useCase, systemPrompt: args.systemPrompt, userMessage },
        args.ingest,
        args.stream ? { stream: args.stream } : undefined,
      );
      return data;
    } catch (err) {
      if (err instanceof TokenBudgetExceededError) throw err;
      console.error(
        `[${args.featureKey}] gateway LLM error${workersAi ? ", falling back to Workers AI" : ""}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (workersAi) {
    try {
      const raw = await workersAi(
        `${args.systemPrompt}

Respond with ONE JSON object only — no prose, no markdown fences.`,
        userMessage,
      );
      const parsed = args.ingest.ingest.safeParse(extractJson(raw));
      if (parsed.success) return args.ingest.coerce(parsed.data);
      console.error(
        `[${args.featureKey}] Workers AI reply failed schema:`,
        parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    } catch (err) {
      console.error(
        `[${args.featureKey}] Workers AI error:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  throw new AppError(
    "LLM_UNAVAILABLE",
    "Resume analysis is temporarily unavailable. Please try again in a moment.",
    503,
  );
}
