/**
 * Cloudflare Workers AI — the ONE adapter for every out-of-gateway model call
 * (`env.AI.run`): the text fallback of `ai-text-caller`, the explicit-image
 * scan's vision fallback, and help-search embeddings.
 *
 * Workers AI is the fallback for when the Builderforce gateway is missing or
 * down, so it can't itself go through the gateway. It IS metered the same
 * way: `runWorkersAi(…, meter)` charges the billed user through the same
 * `chargeLedger` choke point the gateway client uses (the rate card prices
 * `@cf/…` models at $0 vendor cost, but the tokens still count against the
 * user's allowance like any other AI call). Calls with no billed user
 * (moderation scans, help reindex, anonymous search) pass no meter — there is
 * nobody to charge, exactly like a gateway client built with `user = null`.
 */
import type { JwtPayload } from "../../types/index.js";
import { chargeLedger } from "./llm/metering.js";
import type { LLMUsage } from "./llm/types.js";

export interface WorkersAiBinding {
  run: (model: string, inputs: Record<string, unknown>) => Promise<unknown>;
}

// `@cf/meta/llama-3.1-8b-instruct` was retired 2026-05-30 (error 5028). Check
// the catalog (`wrangler ai models`) before changing a model id.
export const WORKERS_AI_TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const WORKERS_AI_VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
/** 768-dim — the `help-content` Vectorize index is built with this model. */
export const WORKERS_AI_EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

/** The `AI` binding from the request env (or the Worker-global env), or null. */
export function resolveWorkersAi(env: unknown): WorkersAiBinding | null {
  const ai =
    (env as { AI?: WorkersAiBinding } | undefined)?.AI ??
    (globalThis as { __ENV?: { AI?: WorkersAiBinding } }).__ENV?.AI;
  return ai && typeof ai.run === "function" ? ai : null;
}

/** Who a Workers AI call is charged to, and under which feature key. */
export interface WorkersAiMeter {
  user: JwtPayload | null | undefined;
  featureKey: string;
  /** Characters sent — the token estimate when the model reports no usage. */
  inputChars?: number;
  /** Flat charge for models that report no usage (image generation): when
   *  set, the call is charged exactly this many prompt tokens and the
   *  reported/estimated usage is ignored. */
  fixedTokens?: number;
}

/** ~4 characters per token — the estimate used when Workers AI omits usage. */
function approxTokens(chars: number): number {
  return chars > 0 ? Math.ceil(chars / 4) : 0;
}

/** Normalise a Workers AI answer's usage (`{ prompt_tokens, completion_tokens,
 *  total_tokens }` on text models) into the ledger's LLMUsage, estimating from
 *  characters when the model reports none. */
export function workersAiUsage(model: string, res: unknown, inputChars = 0): LLMUsage {
  const usage = (res as { usage?: Record<string, unknown> } | null)?.usage;
  const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const response = (res as { response?: unknown } | null)?.response;
  const promptTokens = num(usage?.prompt_tokens) ?? approxTokens(inputChars);
  const completionTokens =
    num(usage?.completion_tokens) ?? approxTokens(typeof response === "string" ? response.length : 0);
  return {
    promptTokens,
    completionTokens,
    totalTokens: num(usage?.total_tokens) ?? promptTokens + completionTokens,
    model,
    requestedModel: model,
  };
}

/** Run a Workers AI model; with a `meter`, charge the billed user afterwards
 *  (billing failures never fail the call — `chargeLedger` swallows them). */
export async function runWorkersAi(
  ai: WorkersAiBinding,
  model: string,
  inputs: Record<string, unknown>,
  meter?: WorkersAiMeter,
): Promise<unknown> {
  const res = await ai.run(model, inputs);
  if (meter) {
    const usage: LLMUsage =
      meter.fixedTokens !== undefined
        ? {
            promptTokens: meter.fixedTokens,
            completionTokens: 0,
            totalTokens: meter.fixedTokens,
            model,
            requestedModel: model,
          }
        : workersAiUsage(model, res, meter.inputChars ?? 0);
    await chargeLedger(meter.user, meter.featureKey, usage, {});
  }
  return res;
}
