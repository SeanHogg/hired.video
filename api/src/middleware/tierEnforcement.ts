import type { MiddlewareHandler, Context } from "hono";
import type { Variables } from "../types/index.js";
import { getSubscription, getMonthlyAIUsage } from "../services/billing.js";
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
// checkAIUsage — call inside a route handler before spending tokens.
// Returns an error Response if the free-tier limit is exceeded, otherwise null.
// ---------------------------------------------------------------------------
export async function checkAIUsage(c: AppCtx): Promise<Response | null> {
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

  const sub = await getSubscription(userId);
  if (sub.isPremium) return null; // unlimited

  const usage = await getMonthlyAIUsage(userId);
  if ((usage.remaining ?? 1) <= 0) {
    return c.json(
      {
        success: false,
        error: {
          code: "USAGE_LIMIT_EXCEEDED",
          message: `You've used all ${usage.limit} AI requests included in your free plan this month. Upgrade to Premium for unlimited access.`,
          upgradeUrl: "/settings/billing",
          usage: { used: usage.used, limit: usage.limit },
        },
      },
      429,
    ) as Response;
  }
  return null;
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
