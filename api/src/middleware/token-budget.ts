/**
 * Token-budget middleware — gates LLM-bound routes against the user's
 * monthly + pack token allowance, and decorates JSON responses with a
 * fresh `tokenBudget` DTO for the frontend AI-tokens pill.
 *
 * Sibling modules:
 *   - `middleware/auth-gates.ts`        (requirePro, requireVideoAnalytics)
 *   - `domains/services-processing/services-processor.ts`  (per-period entitlement gates — team_invite, interview_session, video_publish, resume_tailor, …)
 */

import type { Context, MiddlewareHandler } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { buildTokenBudgetDTO } from "../services/billing/BillingService.js";
import { logger } from "../lib/logger.js";
import {
  buildTokenBudgetExceededResponse,
  tokenLedger,
  TokenBudgetExceededError,
} from "../domains/billing/token-ledger.js";

type AppCtx = Context<AppEnv>;

/**
 * Forward-looking gate — call inside an LLM handler before issuing the
 * upstream request. Returns a Response (429 envelope) when the user has
 * zero tokens available across both monthly + pack balances; otherwise
 * returns null and the handler proceeds.
 *
 * NOTE: Not a precise debit. We allow the call if remaining > 0, then
 * `recordTokenUsage()` debits the actual amount after OpenRouter responds.
 * A user with 100 tokens left can theoretically make a 5,000-token call
 * and go into a 4,900-token deficit — the NEXT call is blocked. Cleaner
 * UX than a mid-call abort, and the overage is bounded.
 */
export async function checkTokenBudget(c: AppCtx): Promise<Response | null> {
  try {
    await tokenLedger.ensureBudget(c.var.user);
    return null;
  } catch (err) {
    if (err instanceof TokenBudgetExceededError) {
      return buildTokenBudgetExceededResponse(c, err.summary);
    }
    throw err;
  }
}

/**
 * @deprecated Use `checkTokenBudget`. Alias preserved so call sites that
 * haven't been migrated yet still work — both names point at the new
 * token-aware implementation.
 */
export const checkAIUsage = checkTokenBudget;

/**
 * Post-response middleware that merges a fresh `tokenBudget` DTO onto
 * every successful JSON envelope. Mounted on every AI-metered router so
 * the frontend hook + Chrome-extension pill stay in sync without an
 * extra `/token-budget` round-trip.
 *
 * Skips: unauthenticated requests, non-JSON responses, non-2xx responses
 * (errors already carry their own budget in the 429 path).
 */
export function attachTokenBudget(): MiddlewareHandler<AppEnv> {
  return async (c: AppCtx, next) => {
    await next();

    const userId = c.var.user?.sub;
    if (!userId) return;

    const res = c.res;
    if (!res || res.status < 200 || res.status >= 300) return;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) return;

    let body: unknown;
    try {
      body = await res.clone().json();
    } catch {
      return;
    }
    if (!body || typeof body !== "object") return;

    let budget;
    try {
      budget = await buildTokenBudgetDTO(userId);
    } catch (err) {
      logger.warn("[token-budget] buildTokenBudgetDTO failed", err);
      return;
    }

    const merged = { ...(body as Record<string, unknown>), tokenBudget: budget };
    const newHeaders = new Headers(res.headers);
    newHeaders.delete("content-length");
    c.res = new Response(JSON.stringify(merged), {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  };
}

/**
 * Route-registration-site equivalent of `checkTokenBudget`. Use this
 * instead of the boilerplate `const blocked = await checkAIUsage(c); if
 * (blocked) return blocked;` guard inside handlers.
 *
 * Anonymous requests short-circuit (no `sub` → nothing to meter); pair
 * with the auth middleware upstream when a route requires authentication.
 */
export function requireTokenBudget(): MiddlewareHandler<AppEnv> {
  return async (c: AppCtx, next) => {
    const blocked = await checkTokenBudget(c);
    if (blocked) return blocked;
    return next();
  };
}
