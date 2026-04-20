import type { MiddlewareHandler, Context } from "hono";
import type { Variables } from "../types/index.js";
import {
  buildTokenBudgetDTO,
  getSubscription,
} from "../services/billing.js";
import {
  buildTokenBudgetExceededResponse,
  tokenLedger,
  TokenBudgetExceededError,
} from "../domains/billing/token-ledger.js";
import { FREE_TEAM_MEMBER_LIMIT } from "../../../shared/pricing.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import { eq, and, inArray, count } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

type AppCtx = Context<{ Variables: Variables }>;

// ---------------------------------------------------------------------------
// requirePremium — route middleware factory
// Usage: salaryRoutes.post("/analyze", requirePremium("Salary Calculator"), handler)
// ---------------------------------------------------------------------------
export function requirePremium(featureName: string): MiddlewareHandler<{ Variables: Variables }> {
  return async (c: AppCtx, next) => {
    const userId = c.var.user?.sub;
    if (!userId) {
      return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);
    }

    // Admin / SuperAdmin bypass — these roles are always treated as premium.
    const roles = c.var.user?.roles ?? [];
    const role = (c.var.user as any)?.role ?? "";
    if (
      roles.includes(USER_ROLES.SUPER_ADMIN) ||
      roles.includes(USER_ROLES.ADMIN) ||
      role === USER_ROLES.SUPER_ADMIN ||
      role === USER_ROLES.ADMIN
    ) {
      return next();
    }

    const sub = await getSubscription(userId);
    if (!sub.isPremium) {
      return c.json(
        {
          success: false,
          error: {
            code: "PREMIUM_REQUIRED",
            message: `${featureName} is a Premium feature. Upgrade to access it.`,
            upgradeUrl: "/settings/billing",
          },
        },
        402,
      );
    }
    return next();
  };
}

// ---------------------------------------------------------------------------
// checkTokenBudget — call inside a route handler before issuing an LLM call.
// Returns an error Response if the user has zero tokens available across
// both monthly allowance AND purchased pack balance. Otherwise returns null
// and the route can proceed.
//
// NOTE: This is a forward-looking gate, not a precise debit. We allow the
// call if remaining > 0, then `recordTokenUsage()` debits the actual amount
// after OpenRouter responds. A user with 100 tokens left can theoretically
// make a 5,000-token call and go into a 4,900-token deficit — the NEXT call
// is blocked. Cleaner UX than mid-call abort, and the overage is bounded.
// ---------------------------------------------------------------------------
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
 * @deprecated Use `checkTokenBudget`. Alias kept so call sites that haven't
 * been migrated yet still work — both names point at the new token-aware
 * implementation.
 */
export const checkAIUsage = checkTokenBudget;

// ---------------------------------------------------------------------------
// attachTokenBudget — post-response middleware.
//
// Mounts on every AI-metered router. After the handler runs, it reads the
// JSON body, computes the user's current token-budget DTO, and merges it
// onto the response envelope under `tokenBudget`. Clients (frontend hook,
// Chrome extension pill) read this field to keep the AI-tokens UI in sync
// without a second `/token-budget` round-trip.
//
// Behaviour:
//   - Skipped for unauthenticated requests (nothing to meter).
//   - Skipped when the response is not JSON or not a 2xx (errors already
//     carry their own budget in the 429 path; 4xx/5xx shouldn't change
//     totals).
//   - Always fires AFTER `recordTokenUsage()` has run in the handler, so
//     the attached budget reflects the call that just happened.
// ---------------------------------------------------------------------------
export function attachTokenBudget(): MiddlewareHandler<{ Variables: Variables }> {
  return async (c: AppCtx, next) => {
    await next();

    const userId = c.var.user?.sub;
    if (!userId) return;

    const res = c.res;
    if (!res || res.status < 200 || res.status >= 300) return;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) return;

    // Clone first so a failure mid-parse can't prevent the original response
    // from being returned. We rewrite c.res only after we successfully have
    // a new body in hand.
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
      console.warn("[tierEnforcement] buildTokenBudgetDTO failed:", err);
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

// ---------------------------------------------------------------------------
// requireTokenBudget — route middleware factory equivalent of
// checkTokenBudget. Use this at the route registration site so handlers
// stop repeating the `const limitError = await checkAIUsage(c as any); if
// (limitError) return limitError;` guard pattern (roadmap #148).
//
// Usage:
//   resumeOptimizerRoutes.post("/optimize", requireTokenBudget(), handler);
//
// The check short-circuits anonymous requests (the `sub` is absent, so
// there's nothing to meter); pair with the auth middleware upstream if
// a route requires authentication.
// ---------------------------------------------------------------------------
export function requireTokenBudget(): MiddlewareHandler<{ Variables: Variables }> {
  return async (c: AppCtx, next) => {
    const blocked = await checkTokenBudget(c);
    if (blocked) return blocked;
    return next();
  };
}

// ---------------------------------------------------------------------------
// checkTeamSize — call before creating a new team invite.
// Counts accepted + pending invitations sent by this user. If the total already
// meets or exceeds FREE_TEAM_MEMBER_LIMIT - 1 (the inviter counts as seat 1),
// free-tier users are blocked from sending another invite.
// ---------------------------------------------------------------------------
export async function checkTeamSize(c: AppCtx): Promise<Response | null> {
  const userId = c.var.user?.sub;
  if (!userId) return null;

  const sub = await getSubscription(userId);
  if (sub.isPremium) return null; // unlimited seats

  const db = getDb();
  const [row] = await db
    .select({ total: count() })
    .from(schema.accountInvitations)
    .where(
      and(
        eq(schema.accountInvitations.invitedBy, userId),
        inArray(schema.accountInvitations.status, ["pending", "accepted"]),
      ),
    );

  // Seat 1 = the account owner; seats 2+ = accepted/pending invitees
  const inviteesCount = row?.total ?? 0;
  if (inviteesCount >= FREE_TEAM_MEMBER_LIMIT - 1) {
    return c.json(
      {
        success: false,
        error: {
          code: "TEAM_LIMIT_REACHED",
          message: `Free accounts are limited to ${FREE_TEAM_MEMBER_LIMIT} team members. Upgrade to Premium to add more.`,
          upgradeUrl: "/settings/billing",
          limit: FREE_TEAM_MEMBER_LIMIT,
        },
      },
      402,
    ) as Response;
  }
  return null;
}
