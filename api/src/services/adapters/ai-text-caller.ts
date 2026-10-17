/**
 * AI text caller — ONE "system + user → raw model text" port with the fallback
 * order every JSON-producing helper needs (résumé parse + revise, the Post
 * dock's caption):
 *
 *   1. the Builderforce gateway (reads up to `maxInputChars`, 12k by default,
 *      with a model strong enough to keep every role), then
 *   2. Cloudflare Workers AI llama-3.3-70b (same cap) when the gateway is missing
 *      or failing — e.g. a revoked tenant key, which otherwise takes every
 *      AI surface down with it.
 *
 * Returning a plain function keeps the use cases free of env/adapter imports
 * and trivially fakeable in tests.
 */
import { createLLMClient, hasAnyLLMProviderKey } from "./llm-client.js";
import type { LLMUseCase } from "./providers.js";
import { WORKERS_AI_TEXT_MODEL, resolveWorkersAi, runWorkersAi, type WorkersAiMeter } from "./workers-ai.js";
import { logger } from "../../lib/logger.js";

export type AiTextCaller = (systemPrompt: string, userMessage: string) => Promise<string>;

/** Default input cap. A caller whose message is a whole résumé it must hand
 *  back intact (revise) raises it — a cut-off résumé can't be edited. */
const DEFAULT_MAX_INPUT_CHARS = 12_000;
// Workers AI defaults to 256 output tokens — far too few to echo a résumé as
// JSON, so the fallback always truncated. Match the gateway profile's cap.
const WORKERS_AI_MAX_TOKENS = 8_000;

/** True when either the gateway or Workers AI can take a call. */
export function hasAiTextProvider(env: unknown): boolean {
  return hasAnyLLMProviderKey(env as Parameters<typeof hasAnyLLMProviderKey>[0]) || resolveWorkersAi(env) !== null;
}

/**
 * The Workers AI leg on its own, for callers that already ran the gateway
 * through a richer path (e.g. `callJsonLenient`'s strict schema) and only
 * need the fallback. Null when the AI binding isn't bound. With `meter`, each
 * call is charged to the billed user under `meter.featureKey` — the same
 * ledger (`chargeLedger`) the gateway path charges.
 */
export function createWorkersAiTextCaller(
  env: unknown,
  {
    maxInputChars = DEFAULT_MAX_INPUT_CHARS,
    meter,
  }: { maxInputChars?: number; meter?: Omit<WorkersAiMeter, "inputChars"> } = {},
): AiTextCaller | null {
  const cfAi = resolveWorkersAi(env);
  if (!cfAi) return null;
  return async (systemPrompt, userMessage) => {
    const userContent = userMessage.slice(0, maxInputChars);
    const res = (await runWorkersAi(
      cfAi,
      WORKERS_AI_TEXT_MODEL,
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: WORKERS_AI_MAX_TOKENS,
      },
      meter ? { ...meter, inputChars: systemPrompt.length + userContent.length } : undefined,
    )) as { response?: unknown } | null;
    return typeof res?.response === "string" ? res.response : JSON.stringify(res);
  };
}

/**
 * Build the caller for one request. `label` names the call in gateway logs
 * (e.g. "resume_parse_ai"); `useCase` picks the gateway model profile.
 */
export function createAiTextCaller(
  env: unknown,
  user: Parameters<typeof createLLMClient>[1],
  {
    label,
    useCase,
    maxInputChars = DEFAULT_MAX_INPUT_CHARS,
    signal,
  }: {
    label: string;
    useCase: LLMUseCase;
    maxInputChars?: number;
    /** The request's abort signal: once the client is gone, no further
     *  model call starts and an in-flight gateway call is cancelled —
     *  never retried on the fallback. */
    signal?: AbortSignal;
  },
): AiTextCaller {
  // The fallback bills the same user under the same feature key as the
  // gateway call it stands in for.
  const fallback = createWorkersAiTextCaller(env, { maxInputChars, meter: { user, featureKey: label } });
  const llm = hasAnyLLMProviderKey(env as Parameters<typeof hasAnyLLMProviderKey>[0])
    ? createLLMClient(env as Parameters<typeof createLLMClient>[0], user)
    : null;

  return async (systemPrompt, userMessage) => {
    signal?.throwIfAborted();
    if (llm) {
      try {
        const { content } = await llm.callText(
          label,
          {
            useCase,
            systemPrompt,
            userMessage: userMessage.slice(0, maxInputChars),
            responseFormat: "json_object",
          },
          signal ? { signal } : undefined,
        );
        return content;
      } catch (err) {
        if (!fallback || signal?.aborted) throw err;
        logger.warn(`[${label}] gateway LLM failed, falling back to Workers AI`, {
          error: err instanceof Error ? err.message : err,
        });
      }
    }
    if (fallback) return fallback(systemPrompt, userMessage);
    throw new Error("No AI provider available");
  };
}
