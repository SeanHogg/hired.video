import type { MiddlewareHandler, Context } from "hono";
import type { Variables } from "../types/index.js";
import { getSubscription, getTokenBudgetSummary } from "../services/billing.js";
import { FREE_TEAM_MEMBER_LIMIT } from "../../../shared/pricing.js";
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
    if (roles.includes("SuperAdmin") || roles.includes("Admin") || role === "SuperAdmin" || role === "Admin") {
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
  const userId = c.var.user?.sub;
  if (!userId) return null;

  // Admin and SuperAdmin roles are internal users — unlimited AI usage
  // regardless of subscription status.
  const roles = c.var.user?.roles ?? [];
  const role = (c.var.user as any)?.role ?? "";
  if (
    roles.includes("SuperAdmin") ||
    roles.includes("Admin") ||
    role === "SuperAdmin" ||
    role === "Admin"
  ) {
    return null;
  }

  const summary = await getTokenBudgetSummary(userId);
  if (summary.isUnlimited) return null;
  if (summary.totalAvailable > 0) return null;

  return c.json(
    {
      success: false,
      error: {
        code: "TOKEN_BUDGET_EXCEEDED",
        message: summary.isPro
          ? `You've used all ${summary.monthlyLimit.toLocaleString()} AI tokens in your Pro plan this month. Buy a token pack to keep going, or wait for next month's reset.`
          : `You've used all ${summary.monthlyLimit.toLocaleString()} free AI tokens this month. Upgrade to Pro for ${(1_000_000).toLocaleString()} tokens per month, or buy a token pack.`,
        upgradeUrl: "/pricing",
        budget: {
          monthlyUsed: summary.monthlyUsed,
          monthlyLimit: summary.monthlyLimit,
          monthlyRemaining: summary.monthlyRemaining,
          packBalance: summary.packBalance,
          totalAvailable: summary.totalAvailable,
          plan: summary.planId,
        },
      },
    },
    429,
  ) as Response;
}

/**
 * @deprecated Use `checkTokenBudget`. Alias kept so call sites that haven't
 * been migrated yet still work — both names point at the new token-aware
 * implementation.
 */
export const checkAIUsage = checkTokenBudget;

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
