/**
 * Token Ledger — the one domain service that owns per-user AI-token
 * accounting. Every AI call in the system goes through `ensureBudget()`
 * before firing and `charge()` after. Nothing else should talk to
 * `recordTokenUsage` or `checkTokenBudget` directly.
 *
 * Responsibilities (DDD: ledger as an aggregate root):
 *   • Gate  — can this user afford another AI call right now?
 *   • Debit — record exact spend against the monthly allowance (falling
 *             back to the purchased pack balance) + attach the usage to
 *             a tool_runs row when the caller has one.
 *   • Query — return the current TokenBudgetSummary / DTO.
 *
 * Kept deliberately thin — the write path still delegates to the existing
 * `recordTokenUsage()` in `services/billing.ts` so the pack-vs-monthly
 * branching logic has exactly one implementation. This module is the
 * seam the rest of the app depends on; `services/billing.ts` is the
 * low-level persistence implementation detail.
 */

import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { sql } from "drizzle-orm";
import type { JwtPayload, Variables, AppEnv } from "../../types/index.js";
import type { TokenBudgetDTO } from "../../../../shared/billing.js";
import { getDb, schema } from "../../db/index.js";
import {
  buildTokenBudgetDTO,
  getTokenBudgetSummary,
  recordExemptTokenUsage,
  recordTokenUsage,
  type TokenBudgetSummary,
} from "../../services/billing/BillingService.js";
import type { LLMUsage } from "../../services/adapters/llm-client.js";
import { isAdminRole } from "../../middleware/superAdmin.js";
import { servicesProcessor } from "../services-processing/index.js";
import { hasTokensForAiCall, PRO_AI_MONTHLY_TOKENS } from "../../../../shared/pricing.js";
import { aiCallCostUsd } from "../../../../shared/ai-model-rates.js";
import { emitNotification } from "../../services/notifications/notificationService.js";
import { buildRepos } from "../../repositories/index.js";
import { logger } from "../../lib/logger.js";
import { tokenUsageAlertFor, tokenUsageAlertMessage } from "./token-usage-alerts.js";
import {
  resolveEmployeeAiContext,
  checkCompanyBudget,
  recordCompanyTokenUsage,
  getCompanyTokenBudget,
  getCompanyTokenPoolView,
  setMemberTokenLimit,
  toSummary as companyBudgetSummary,
  type CompanyPoolView,
} from "./company-token-ledger.js";

/** Who a token pool belongs to. Both pools are `ai_tokens` wallets
 *  (wallet_balances, W3-B); this module is the one API over both. */
export type TokenOwner =
  | { ownerKind: "user"; ownerId: string }
  | { ownerKind: "company"; ownerId: string };

/**
 * Thrown by `ensureBudget()` when a user has zero tokens available across
 * both monthly allowance and purchased packs. The caller (middleware or
 * `aiCall` orchestrator) converts this to a 429 response via
 * `buildTokenBudgetExceededResponse`.
 */
export class TokenBudgetExceededError extends Error {
  readonly code = "TOKEN_BUDGET_EXCEEDED" as const;
  constructor(public readonly summary: TokenBudgetSummary) {
    super("Token budget exceeded");
    this.name = "TokenBudgetExceededError";
  }
}

export interface ChargeArgs {
  userId: string;
  featureKey: string;
  usage: LLMUsage;
  /** Optional link back to the tool_runs row this charge is attributed to. */
  toolRunId?: string;
  /** Optional chat-session link (used by the AI chat feature). */
  sessionId?: string;
  /** A free AI call (e.g. the cover-letter Tone rewrite): audited with its
   *  cost, never debited from any allowance or pack. */
  exempt?: boolean;
}

export interface TokenLedger {
  /** Throws `TokenBudgetExceededError` when the caller has no budget.
   *  No-op for anonymous callers, admins, and unlimited plans. */
  ensureBudget(user: JwtPayload | null | undefined): Promise<void>;

  /** Persist a single AI call to the audit log, debit the right bucket,
   *  and (when `toolRunId` is supplied) update the tool_runs row with the
   *  token count + a foreign-key backref on the audit row. Returns the
   *  fresh TokenBudgetDTO for middleware to attach to the response. */
  charge(args: ChargeArgs): Promise<TokenBudgetDTO | null>;

  /** Current budget summary. Thin wrapper so callers don't import
   *  `services/billing.ts` directly. */
  getBudget(userId: string): Promise<TokenBudgetSummary>;

  /** Current budget of either pool, in the one TokenBudgetSummary shape. */
  budgetFor(owner: TokenOwner): Promise<TokenBudgetSummary>;

  /** Employer view of their company pool (null when they manage none). */
  companyPoolView(employerUserId: string): Promise<CompanyPoolView | null>;

  /** Employer sets / clears (null) a member's monthly sub-cap on the pool. */
  setCompanyMemberLimit(employerUserId: string, memberUserId: string, limit: number | null): Promise<void>;
}

export const tokenLedger: TokenLedger = {
  async ensureBudget(user) {
    // Anonymous callers aren't metered. They hit public tools (e.g. the
    // marketing-page roast) that intentionally skip the budget gate.
    if (!user?.sub) return;
    // SuperAdmin / Admin bypass — matches the behavior the middleware has
    // always had. Internal users always pass, but their spend is still
    // recorded on the charge side for audit.
    if (isAdminRole(user)) return;

    // Workforce employees draw from their employer's shared pool + sub-cap
    // (gap #1679). resolveEmployeeAiContext returns null for everyone else,
    // who fall through to the unchanged per-user gate below.
    const employeeCtx = await resolveEmployeeAiContext(user.sub);
    if (employeeCtx) {
      const blocked = await checkCompanyBudget(employeeCtx, user.sub);
      if (blocked) throw new TokenBudgetExceededError(blocked);
      return;
    }

    const summary = await getTokenBudgetSummary(user.sub);
    if (summary.isUnlimited) return;
    if (hasTokensForAiCall(summary.totalAvailable)) return;

    throw new TokenBudgetExceededError(summary);
  },

  async charge({ userId, featureKey, usage, toolRunId, sessionId, exempt }) {
    // Defensive: downstream handles zero-token calls too, but we skip the
    // DTO round-trip in that case.
    if (usage.totalTokens <= 0) return null;

    // A free call: the audit row (tokens + cost) and nothing else — no
    // allowance, pack, workforce-pool or usage-ledger debit.
    if (exempt) {
      await recordExemptTokenUsage({
        userId,
        featureKey,
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        sessionId,
        toolRunId,
      });
      return null;
    }

    // Route the debit to the employer's shared pool for active employees;
    // everyone else debits their personal allowance (gap #1679).
    const employeeCtx = await resolveEmployeeAiContext(userId);
    if (employeeCtx) {
      await recordCompanyTokenUsage({
        companyId: employeeCtx.companyId,
        userId,
        featureKey,
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        sessionId,
        toolRunId,
      });
    } else {
      const debit = await recordTokenUsage({
        userId,
        featureKey,
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        sessionId,
        toolRunId,
      });
      if (debit) {
        const alert = tokenUsageAlertFor(debit.before, debit);
        if (alert) await notifyTokenUsageAlert(userId, alert, debit.before.isPro);
      }
    }

    // Write-through to the central usage ledger so the Usage Statement panel
    // + monthly close cron can see AI consumption next to every other gated
    // dimension. Best-effort — token accounting still lives in token_usage,
    // this is the audit projection.
    //
    // The `ai` facts land in typed usage_ledger columns (migration 0612):
    // #515 — the gateway treats `model` as a HINT and may swap vendors on
    // cooldown / outage / plan mismatch; requested vs resolved model lets SA
    // dashboard silent substitutions. #2159 — json_schema conformance
    // retries per feature. Observability only — dispatch is unchanged.
    try {
      await servicesProcessor.meter({
        userId,
        eventType: "ai_tokens",
        quantity: usage.totalTokens,
        metadata: {
          model: usage.model,
          costUsd: aiCallCostUsd(usage),
          toolRunId,
          sessionId,
        },
        ai: {
          featureKey,
          requestedModel: usage.requestedModel ?? null,
          resolvedModel: usage.model,
          schemaRetries: usage.schemaRetries ?? null,
        },
      });
    } catch (err) {
      logger.warn("[token-ledger] failed to mirror ai_tokens to usage_ledger", err);
    }

    if (toolRunId) {
      // Keep tool_runs.tokens_used in sync with the charge. Best-effort —
      // a missing row shouldn't fail the AI response.
      try {
        const db = getDb();
        await db
          .update(schema.toolRuns)
          .set({
            tokensUsed: sql`COALESCE(${schema.toolRuns.tokensUsed}, 0) + ${usage.totalTokens}`,
          } as any)
          .where(eq(schema.toolRuns.id, toolRunId));
      } catch (err) {
        logger.warn("[token-ledger] failed to update tool_runs.tokens_used", { toolRunId, error: err });
      }
    }

    // Employees draw from the shared pool, not a personal allowance — the
    // per-user budget DTO would be misleading, so skip it. Their pill is fed
    // by the company-pool endpoint instead (gap #1679).
    if (employeeCtx) return null;

    try {
      return await buildTokenBudgetDTO(userId);
    } catch (err) {
      logger.warn("[token-ledger] buildTokenBudgetDTO failed", { userId, error: err });
      return null;
    }
  },

  getBudget: getTokenBudgetSummary,

  async budgetFor(owner) {
    return owner.ownerKind === "company"
      ? companyBudgetSummary(await getCompanyTokenBudget(owner.ownerId))
      : getTokenBudgetSummary(owner.ownerId);
  },

  companyPoolView: (employerUserId) => getCompanyTokenPoolView(employerUserId),

  async setCompanyMemberLimit(employerUserId, memberUserId, limit) {
    await setMemberTokenLimit(employerUserId, memberUserId, limit);
  },
};

/** Best-effort: an alert failure never fails the AI response. */
async function notifyTokenUsageAlert(
  userId: string,
  alert: Parameters<typeof tokenUsageAlertMessage>[0],
  isPro: boolean,
): Promise<void> {
  const msg = tokenUsageAlertMessage(alert, isPro);
  try {
    await emitNotification(
      { repos: buildRepos(getDb()) },
      {
        recipientIds: [userId],
        type: msg.type,
        actor: null,
        title: msg.title,
        message: msg.message,
        url: msg.url,
        email: msg.email,
      },
    );
  } catch (err) {
    logger.warn("[token-ledger] usage alert failed", { userId, error: err });
  }
}

/**
 * Shape the 429 envelope the frontend's `api-client` already parses. The
 * middleware and the `aiCall` orchestrator both go through this function
 * so the error payload can't drift between call sites.
 */
export function buildTokenBudgetExceededResponse(
  c: Context<AppEnv>,
  summary: TokenBudgetSummary,
): Response {
  return c.json(
    {
      success: false as const,
      error: {
        code: "TOKEN_BUDGET_EXCEEDED" as const,
        message: summary.isPro
          ? `You've used your ${summary.monthlyLimit.toLocaleString("en-US")} Pro AI tokens for this month. Buy a token pack to keep going, or wait for next month's reset.`
          : `You've used your ${summary.monthlyLimit.toLocaleString("en-US")} free AI tokens for this month. Upgrade to Pro for ${PRO_AI_MONTHLY_TOKENS.toLocaleString("en-US")} tokens per month.`,
        upgradeUrl: summary.isPro ? "/settings?tab=billing" : "/pricing",
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
  );
}
