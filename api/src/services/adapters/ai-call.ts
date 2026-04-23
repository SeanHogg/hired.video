/**
 * aiCall — the one way every route talks to the LLM.
 *
 * Replaces the ~6-line gate / call / record boilerplate each AI route
 * used to repeat. A route now looks like:
 *
 *   const result = await aiCall(c, "resume_roast", () =>
 *     callLLMJsonWithUsage(apiKey, { ... }, schema),
 *   );
 *   if (result instanceof Response) return result;    // 429 (over-quota)
 *   return c.json(success(result.data));
 *
 * Responsibilities:
 *   1. Gate  — `tokenLedger.ensureBudget()`. Anonymous + admin bypass.
 *   2. Call  — delegates to the caller (any function returning
 *              `{ data, usage }`, i.e. the `*WithUsage` helpers in ai.ts).
 *   3. Debit — `tokenLedger.charge()`. Audits every call, updates
 *              `tool_runs.tokens_used` when a toolRunId is supplied, and
 *              debits the right bucket (monthly → pack).
 *
 * Intentionally does NOT handle LLM failures — callers that want a mock
 * fallback (e.g. resume-roast marketing page) wrap `aiCall` in their own
 * try/catch. Over-quota is the only error this function converts to a
 * Response; everything else propagates.
 */

import type { Context } from "hono";
import type { Variables } from "../../types/index.js";
import type { LLMUsage } from "./ai.js";
import {
  buildTokenBudgetExceededResponse,
  tokenLedger,
  TokenBudgetExceededError,
} from "../../domains/billing/token-ledger.js";

/** Any Hono context with our `Variables` (user on JWT). Routes freely
 *  mix `Bindings: Env` in, so we take a generic env parameter that
 *  covers both `{Variables}` and `{Bindings, Variables}` forms. */
type AICallCtx<E extends { Variables: Variables } = { Variables: Variables }> = Context<E>;

export interface AICallOptions {
  /** Cross-link the charge to a `tool_runs` row. When supplied, the
   *  ledger also increments `tool_runs.tokens_used` atomically. */
  toolRunId?: string;
  /** Optional chat-session link (ai_usage_records.session_id). */
  sessionId?: string;
  /** Override who gets billed. Defaults to `c.var.user?.sub`. Exposed for
   *  the rare route that bills a different account than the caller
   *  (webhooks, scheduled jobs). */
  billedUserId?: string;
}

export type AICallResult<T> = { data: T; usage?: LLMUsage };

/**
 * Guard + record around a single LLM call.
 *
 * @param c           Hono context (used for the 429 envelope + auth).
 * @param featureKey  Stable identifier for the AI feature being invoked.
 *                    Matches `ai_usage_records.feature_key` — pick a slug
 *                    and keep it; this is how per-feature analytics group.
 * @param run         Thunk that performs the actual LLM call. Must return
 *                    `{ data, usage }` (use the `*WithUsage` helpers in
 *                    `services/ai.ts`).
 * @param opts        Optional linkage fields.
 * @returns           The `{ data, usage }` on success, or a 429 Response
 *                    when the budget gate rejects the call.
 */
export async function aiCall<T, E extends { Variables: Variables } = { Variables: Variables }>(
  c: AICallCtx<E>,
  featureKey: string,
  run: () => Promise<AICallResult<T>>,
  opts: AICallOptions = {},
): Promise<AICallResult<T> | Response> {
  const user = c.var.user;

  // 1. Gate. Anonymous + admin are no-ops. Over-quota throws.
  try {
    await tokenLedger.ensureBudget(user);
  } catch (err) {
    if (err instanceof TokenBudgetExceededError) {
      // The response builder only needs `c.json`; Hono's generic Env type
      // isn't covariant enough for TS to see that every AI route's ctx
      // shape is compatible. Erase the generic here — safe because we
      // only touch the base Hono surface.
      return buildTokenBudgetExceededResponse(c as unknown as Context<{ Variables: Variables }>, err.summary);
    }
    throw err;
  }

  // 2. LLM call — delegated to caller.
  const result = await run();

  // 3. Debit. Skip when there's no user to bill (anonymous public tools
  // like the marketing-page roast) OR when the runner didn't hit an LLM
  // (heuristic fallback paths return no usage). Admin spend IS recorded
  // so ops can audit internal usage, matching the pre-refactor behavior.
  const billedUserId = opts.billedUserId ?? user?.sub;
  if (billedUserId && result.usage && result.usage.totalTokens > 0) {
    try {
      await tokenLedger.charge({
        userId: billedUserId,
        featureKey,
        usage: result.usage,
        toolRunId: opts.toolRunId,
        sessionId: opts.sessionId,
      });
    } catch (err) {
      // Billing must never fail an otherwise-successful AI call — log and
      // move on. The next attachTokenBudget middleware run surfaces the
      // latest state from the DB even if this record missed.
      console.warn(`[aiCall] charge failed for ${billedUserId}/${featureKey}:`, err);
    }
  }

  return result;
}
