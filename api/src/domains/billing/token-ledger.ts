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
import type { JwtPayload, Variables } from "../../types/index.js";
import type { TokenBudgetDTO } from "../../../../shared/billing.js";
import { getDb, schema } from "../../db/index.js";
import {
  buildTokenBudgetDTO,
  getTokenBudgetSummary,
  recordTokenUsage,
  type TokenBudgetSummary,
} from "../../services/billing.js";
import type { LLMUsage } from "../../services/ai.js";
import { isAdminRole } from "./audience.js";

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

    const summary = await getTokenBudgetSummary(user.sub);
    if (summary.isUnlimited) return;
    if (summary.totalAvailable > 0) return;

    throw new TokenBudgetExceededError(summary);
  },

  async charge({ userId, featureKey, usage, toolRunId, sessionId }) {
    // Defensive: downstream handles zero-token calls too, but we skip the
    // DTO round-trip in that case.
    if (usage.totalTokens <= 0) return null;

    await recordTokenUsage({
      userId,
      featureKey,
      model: usage.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      sessionId,
      toolRunId,
    });

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
        console.warn(`[token-ledger] failed to update tool_runs.tokens_used for ${toolRunId}:`, err);
      }
    }

    try {
      return await buildTokenBudgetDTO(userId);
    } catch (err) {
      console.warn(`[token-ledger] buildTokenBudgetDTO failed for ${userId}:`, err);
      return null;
    }
  },

  getBudget: getTokenBudgetSummary,
};

/**
 * Shape the 429 envelope the frontend's `api-client` already parses. The
 * middleware and the `aiCall` orchestrator both go through this function
 * so the error payload can't drift between call sites.
 */
export function buildTokenBudgetExceededResponse(
  c: Context<{ Variables: Variables }>,
  summary: TokenBudgetSummary,
): Response {
  return c.json(
    {
      success: false as const,
      error: {
        code: "TOKEN_BUDGET_EXCEEDED" as const,
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
  );
}
