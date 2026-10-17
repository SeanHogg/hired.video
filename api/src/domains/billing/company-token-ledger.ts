/**
 * Company token pool (gap #1679) — the workspace analog of the per-user
 * token ledger. An active workforce *employee* draws AI tokens from their
 * employer's SHARED pool instead of a personal allowance:
 *
 *   pool monthly allowance = company seats × WORKFORCE_SEAT_AI_MONTHLY_TOKENS
 *   pool overflow          = the company's ai_tokens wallet (purchased top-ups)
 *   per-member sub-cap     = user_company_role_associations.monthly_token_limit
 *
 * Scope is deliberately narrow: ONLY active `employee` memberships route here
 * (resolveEmployeeAiContext returns null for everyone else), so personal Pro
 * users, recruiters, and job seekers keep the proven per-user path untouched.
 * This module owns the company accounting; `token-ledger.ts` is the single
 * module surface (owner-polymorphic: ownerKind 'user' | 'company') — it
 * throws/charges and re-exposes the employer controls, so callers import
 * token-ledger only, never this file.
 */

import { and, eq, gte, inArray, lt, sum } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { companyWallet, WalletRepository } from "../../repositories/walletRepository.js";
import { hasTokensForAiCall, WORKFORCE_SEAT_AI_MONTHLY_TOKENS } from "../../../../shared/pricing.js";
import { aiCallCostUsd } from "../../../../shared/ai-model-rates.js";
import { chooseDebitSource } from "./token-debit.js";
import { ForbiddenError } from "../../middleware/errorHandler.js";
import { logger } from "../../lib/logger.js";
import type { TokenBudgetSummary } from "../../services/billing/BillingService.js";

const { userCompanyRoleAssociations, companySubscriptions, aiUsageRecords, users } = schema;

export interface EmployeeAiContext {
  companyId: string;
  /** Per-member sub-cap (tokens/month) or null when unrestricted. */
  monthlyTokenLimit: number | null;
}

/** Resolve the company an active employee draws AI from + their sub-cap.
 *  Returns null for non-employees (who keep the per-user token path). */
export async function resolveEmployeeAiContext(
  userId: string,
  db = getDb(),
): Promise<EmployeeAiContext | null> {
  const [m] = await db
    .select({
      companyId: userCompanyRoleAssociations.companyId,
      monthlyTokenLimit: userCompanyRoleAssociations.monthlyTokenLimit,
    })
    .from(userCompanyRoleAssociations)
    .where(and(
      eq(userCompanyRoleAssociations.userId, userId),
      eq(userCompanyRoleAssociations.role, "employee"),
      eq(userCompanyRoleAssociations.isActive, true),
    ))
    .limit(1);
  if (!m) return null;
  return { companyId: m.companyId, monthlyTokenLimit: m.monthlyTokenLimit ?? null };
}

function monthBounds(now = new Date()): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

export interface CompanyTokenBudget {
  /** Seats × WORKFORCE_SEAT_AI_MONTHLY_TOKENS — the shared monthly allowance. */
  monthlyLimit: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  /** Purchased company pack balance (overflow). */
  packBalance: number;
  totalAvailable: number;
  seatCount: number;
}

/** The company's shared pool budget for the current month. */
export async function getCompanyTokenBudget(companyId: string, db = getDb()): Promise<CompanyTokenBudget> {
  const [sub] = await db
    .select({ seatCount: companySubscriptions.seatCount })
    .from(companySubscriptions)
    .where(eq(companySubscriptions.companyId, companyId))
    .limit(1);
  const seatCount = sub?.seatCount ?? 0;
  const monthlyLimit = seatCount * WORKFORCE_SEAT_AI_MONTHLY_TOKENS;

  const { start, end } = monthBounds();
  const [usedRow] = await db
    .select({ used: sum(aiUsageRecords.totalTokens) })
    .from(aiUsageRecords)
    .where(and(
      eq(aiUsageRecords.companyId, companyId),
      eq(aiUsageRecords.source, "monthly"),
      gte(aiUsageRecords.createdAt, start),
      lt(aiUsageRecords.createdAt, end),
    ));
  const monthlyUsed = Number(usedRow?.used ?? 0);

  const balRow = await new WalletRepository(db).find(companyWallet(companyId), "ai_tokens");
  const packBalance = balRow?.balance ?? 0;

  const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);
  return {
    monthlyLimit,
    monthlyUsed,
    monthlyRemaining,
    packBalance,
    totalAvailable: monthlyRemaining + packBalance,
    seatCount,
  };
}

/** A member's month-to-date tokens attributed to this company (both monthly
 *  and pack sources count toward their personal sub-cap). */
export async function getMemberMonthlyCompanyUsage(
  companyId: string,
  userId: string,
  db = getDb(),
): Promise<number> {
  const { start, end } = monthBounds();
  const [row] = await db
    .select({ used: sum(aiUsageRecords.totalTokens) })
    .from(aiUsageRecords)
    .where(and(
      eq(aiUsageRecords.companyId, companyId),
      eq(aiUsageRecords.userId, userId),
      gte(aiUsageRecords.createdAt, start),
      lt(aiUsageRecords.createdAt, end),
    ));
  return Number(row?.used ?? 0);
}

/** Present a company budget in the per-user TokenBudgetSummary shape so the
 *  existing 429 builder + budget DTO can render it without a parallel type. */
export function toSummary(budget: CompanyTokenBudget): TokenBudgetSummary {
  return {
    planId: "workforce",
    isPro: true,
    monthlyLimit: budget.monthlyLimit,
    monthlyUsed: budget.monthlyUsed,
    monthlyRemaining: budget.monthlyRemaining,
    packBalance: budget.packBalance,
    totalAvailable: budget.totalAvailable,
    isUnlimited: false,
  };
}

/** Gate: can this employee make another AI call right now? Returns a
 *  TokenBudgetSummary describing the limit they hit when BLOCKED (shared pool
 *  exhausted OR over their per-member sub-cap), or null when within budget. */
export async function checkCompanyBudget(
  ctx: EmployeeAiContext,
  userId: string,
  db = getDb(),
): Promise<TokenBudgetSummary | null> {
  const budget = await getCompanyTokenBudget(ctx.companyId, db);
  if (!hasTokensForAiCall(budget.totalAvailable)) {
    return toSummary(budget);
  }
  if (ctx.monthlyTokenLimit != null) {
    const memberUsed = await getMemberMonthlyCompanyUsage(ctx.companyId, userId, db);
    if (memberUsed >= ctx.monthlyTokenLimit) {
      // Surface the member's sub-cap as the limit so the 429 budget block
      // reflects what they actually hit, not the whole pool.
      return {
        planId: "workforce",
        isPro: true,
        monthlyLimit: ctx.monthlyTokenLimit,
        monthlyUsed: memberUsed,
        monthlyRemaining: 0,
        packBalance: 0,
        totalAvailable: 0,
        isUnlimited: false,
      };
    }
  }
  return null;
}

/** Debit a completed AI call against the company pool: attribute the usage
 *  row to the company and decrement the pack balance when the monthly
 *  allowance is spent. Mirrors recordTokenUsage's monthly-then-pack logic. */
export async function recordCompanyTokenUsage(args: {
  companyId: string;
  userId: string;
  model: string;
  featureKey: string;
  promptTokens: number;
  completionTokens: number;
  sessionId?: string;
  toolRunId?: string;
}, db = getDb()): Promise<void> {
  const totalTokens = args.promptTokens + args.completionTokens;
  if (totalTokens <= 0) return;

  const budget = await getCompanyTokenBudget(args.companyId, db);
  const source = chooseDebitSource(budget, totalTokens);

  try {
    await db
      .insert(aiUsageRecords)
      .values({
        userId: args.userId,
        companyId: args.companyId,
        model: args.model,
        featureKey: args.featureKey,
        promptTokens: args.promptTokens,
        completionTokens: args.completionTokens,
        totalTokens,
        cost: String(aiCallCostUsd(args)),
        source,
        sessionId: args.sessionId ?? null,
        toolRunId: args.toolRunId ?? null,
      } as any);
  } catch (err) {
    logger.warn("[company-token-ledger] usage insert failed", { featureKey: args.featureKey, error: err });
  }

  if (source === "pack") {
    try {
      await new WalletRepository(db).applyDelta(companyWallet(args.companyId), "ai_tokens", {
        delta: -totalTokens,
        clampAtZero: true,
        consumedAdd: totalTokens,
      });
    } catch (err) {
      logger.warn("[company-token-ledger] pack debit failed", { companyId: args.companyId, error: err });
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Employer controls — set a member's sub-cap + view the pool (gap #1679)
// ───────────────────────────────────────────────────────────────────────────

/** Companies where this user is an active employer. */
async function employerCompanyIds(employerUserId: string, db: ReturnType<typeof getDb>): Promise<string[]> {
  const rows = await db
    .select({ companyId: userCompanyRoleAssociations.companyId })
    .from(userCompanyRoleAssociations)
    .where(and(
      eq(userCompanyRoleAssociations.userId, employerUserId),
      eq(userCompanyRoleAssociations.role, "employer"),
      eq(userCompanyRoleAssociations.isActive, true),
    ));
  return rows.map((r) => r.companyId);
}

/** Employer sets (or clears, with null) a member's monthly AI-token sub-cap.
 *  Authorized only when the caller is an active employer in the member's
 *  company; throws ForbiddenError otherwise. */
export async function setMemberTokenLimit(
  employerUserId: string,
  targetUserId: string,
  limit: number | null,
  db = getDb(),
): Promise<void> {
  const companies = await employerCompanyIds(employerUserId, db);
  if (companies.length === 0) throw new ForbiddenError("Not an employer");
  const [membership] = await db
    .select({ id: userCompanyRoleAssociations.id, companyId: userCompanyRoleAssociations.companyId })
    .from(userCompanyRoleAssociations)
    .where(and(
      eq(userCompanyRoleAssociations.userId, targetUserId),
      eq(userCompanyRoleAssociations.role, "employee"),
      eq(userCompanyRoleAssociations.isActive, true),
    ))
    .limit(1);
  if (!membership || !companies.includes(membership.companyId)) {
    throw new ForbiddenError("That member is not in your workspace");
  }
  await db.update(userCompanyRoleAssociations)
    .set({ monthlyTokenLimit: limit, updatedAt: new Date() } as any)
    .where(eq(userCompanyRoleAssociations.id, membership.id));
}

export interface CompanyPoolMemberView {
  userId: string;
  name: string;
  email: string;
  monthlyTokenLimit: number | null;
  monthlyUsed: number;
}

export interface CompanyPoolView {
  companyId: string;
  budget: CompanyTokenBudget;
  members: CompanyPoolMemberView[];
}

/** Employer's view of their shared pool: the budget + each active member's
 *  month-to-date usage and sub-cap. Returns null when the caller manages no
 *  company. */
export async function getCompanyTokenPoolView(
  employerUserId: string,
  db = getDb(),
): Promise<CompanyPoolView | null> {
  const companies = await employerCompanyIds(employerUserId, db);
  if (companies.length === 0) return null;
  const companyId = companies[0]!;
  const budget = await getCompanyTokenBudget(companyId, db);

  const memberships = await db
    .select({
      userId: userCompanyRoleAssociations.userId,
      monthlyTokenLimit: userCompanyRoleAssociations.monthlyTokenLimit,
      name: users.name,
      email: users.email,
    })
    .from(userCompanyRoleAssociations)
    .innerJoin(users, eq(users.id, userCompanyRoleAssociations.userId))
    .where(and(
      eq(userCompanyRoleAssociations.companyId, companyId),
      eq(userCompanyRoleAssociations.role, "employee"),
      eq(userCompanyRoleAssociations.isActive, true),
    ));

  const usageByUser = await getMembersMonthlyCompanyUsage(
    companyId,
    memberships.map((m) => m.userId),
    db,
  );
  const members: CompanyPoolMemberView[] = memberships.map((m) => ({
    userId: m.userId,
    name: m.name,
    email: m.email,
    monthlyTokenLimit: m.monthlyTokenLimit ?? null,
    monthlyUsed: usageByUser.get(m.userId) ?? 0,
  }));
  return { companyId, budget, members };
}

/** Batch form of getMemberMonthlyCompanyUsage — ONE `SUM … GROUP BY user_id`
 *  for every member instead of a query per member. Users with no usage are
 *  absent from the map (callers default to 0). */
export async function getMembersMonthlyCompanyUsage(
  companyId: string,
  userIds: string[],
  db = getDb(),
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0) return out;
  const { start, end } = monthBounds();
  const rows = await db
    .select({ userId: aiUsageRecords.userId, used: sum(aiUsageRecords.totalTokens) })
    .from(aiUsageRecords)
    .where(and(
      eq(aiUsageRecords.companyId, companyId),
      inArray(aiUsageRecords.userId, userIds),
      gte(aiUsageRecords.createdAt, start),
      lt(aiUsageRecords.createdAt, end),
    ))
    .groupBy(aiUsageRecords.userId);
  for (const r of rows) {
    if (r.userId) out.set(r.userId, Number(r.used ?? 0));
  }
  return out;
}
