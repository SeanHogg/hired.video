/**
 * Free-tier hard-limit guards — count user-owned domain artifacts in
 * the current period and return a 402 envelope when the cap is hit.
 *
 * These cross multiple bounded contexts on purpose: each guard is a
 * thin policy that asks "given the caller's subscription tier, can
 * they create another X this period?" The DB queries are local to
 * each guard so the answer doesn't have to round-trip through the
 * domain aggregate (the goal is a fast pre-check, not full validation).
 *
 * Sibling modules:
 *   - `middleware/auth-gates.ts`     (requirePro, requireVideoAnalytics)
 *   - `middleware/token-budget.ts`   (checkTokenBudget, attachTokenBudget…)
 */

import type { Context } from "hono";
import type { Variables } from "../types/index.js";
import { getSubscription } from "../services/billing/BillingService.js";
import { and, eq, gte, inArray, count, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import {
  FREE_INTERVIEW_SESSIONS_PER_MONTH,
  FREE_TEAM_MEMBER_LIMIT,
} from "../../../shared/pricing.js";
import { TIER_COPY, UPGRADE_URL } from "../../../shared/tier-copy.js";

type AppCtx = Context<{ Variables: Variables }>;

/**
 * Returns midnight UTC on day 1 of the calendar month containing `now`.
 * Exported so handlers needing the same window for separate aggregation
 * stay aligned.
 */
export function startOfMonthUtc(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Call before sending a new team invite. Counts pending + accepted
 * invitations from this user; blocks free-tier users at
 * FREE_TEAM_MEMBER_LIMIT - 1 (the inviter is seat 1).
 */
export async function checkTeamSize(c: AppCtx): Promise<Response | null> {
  const userId = c.var.user?.sub;
  if (!userId) return null;

  const sub = await getSubscription(userId);
  if (sub.isPro) return null; // unlimited seats

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

  const inviteesCount = row?.total ?? 0;
  if (inviteesCount >= FREE_TEAM_MEMBER_LIMIT - 1) {
    return c.json(
      {
        success: false,
        error: {
          code: "TEAM_LIMIT_REACHED",
          message: TIER_COPY.freeLimitReached({
            limit: FREE_TEAM_MEMBER_LIMIT,
            unit: "team members",
          }),
          upgradeUrl: UPGRADE_URL,
          limit: FREE_TEAM_MEMBER_LIMIT,
        },
      },
      402,
    ) as Response;
  }
  return null;
}

/**
 * Call inside POST /api/interview/sessions before creating a new session.
 * Pricing-page Pro claim "AI interview practice" is unlimited for Pro;
 * Free is capped at FREE_INTERVIEW_SESSIONS_PER_MONTH per calendar
 * month (UTC).
 */
export async function checkInterviewSessionsThisMonth(c: AppCtx): Promise<Response | null> {
  const userId = c.var.user?.sub;
  if (!userId) return null;

  const sub = await getSubscription(userId);
  if (sub.isPro) return null;

  const db = getDb();
  const [row] = await db
    .select({ used: sql<number>`count(*)::int` })
    .from(schema.interviewSessions)
    .where(and(
      eq(schema.interviewSessions.userId, userId),
      gte(schema.interviewSessions.createdAt, startOfMonthUtc()),
    ));

  const used = Number(row?.used ?? 0);
  if (used >= FREE_INTERVIEW_SESSIONS_PER_MONTH) {
    return c.json(
      {
        success: false,
        error: {
          code: "FREE_LIMIT_REACHED",
          message: TIER_COPY.freeMonthlyLimitReached({
            limit: FREE_INTERVIEW_SESSIONS_PER_MONTH,
            unit: "interview practice sessions",
          }),
          upgradeUrl: UPGRADE_URL,
          limit: FREE_INTERVIEW_SESSIONS_PER_MONTH,
          used,
        },
      },
      402,
    ) as Response;
  }
  return null;
}
