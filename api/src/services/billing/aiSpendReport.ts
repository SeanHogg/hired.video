/**
 * SuperAdmin AI spend report (shared/ai-spend.ts) — AI cost per user and per
 * model family against estimated revenue, so heavy users who cost more than
 * they pay are visible.
 *
 * Cached for a short TTL: it is an admin observability read over a growing
 * usage table, a couple of minutes stale is fine, and there is no single write
 * that should invalidate it (every AI call would thrash it).
 */
import {
  AI_SPEND_USER_LIMIT,
  type AiSpendModelRow,
  type AiSpendReportDTO,
  type AiSpendUserRow,
  type AiSpendWindow,
} from "../../../../shared/ai-spend.js";
import { aiModelRate } from "../../../../shared/ai-model-rates.js";
import { PRO_MONTHLY_PRICE } from "../../../../shared/pricing.js";
import type { ITokensRepository } from "../../repositories/tokensRepository.js";
import { getOrSetIsolateCached } from "../../utils/isolate-cache.js";

const CACHE_TTL_SECONDS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface AiSpendReportDeps {
  tokens: Pick<ITokensRepository, "spendByUser" | "spendByModel" | "spendTotals" | "packRevenueByUsers">;
  users: { findManyByIds(ids: string[]): Promise<Array<{ id: string; email: string | null; name: string | null }>> };
  isProForUsers(userIds: string[]): Promise<Map<string, boolean>>;
  now: () => Date;
}

const usd = (n: number) => Math.round(n * 10_000) / 10_000;

/** Pure: fold per-model rows into rate-card families. */
export function groupSpendByRate(
  rows: Array<{ model: string; calls: number; tokens: number; cost: number }>,
): AiSpendModelRow[] {
  const byRate = new Map<string, AiSpendModelRow>();
  for (const r of rows) {
    const rateId = aiModelRate(r.model).id;
    const acc = byRate.get(rateId) ?? { rateId, calls: 0, tokens: 0, costUsd: 0 };
    acc.calls += r.calls;
    acc.tokens += r.tokens;
    acc.costUsd = usd(acc.costUsd + r.cost);
    byRate.set(rateId, acc);
  }
  return [...byRate.values()].sort((a, b) => b.costUsd - a.costUsd);
}

/** Pure: estimated revenue for the window (Pro pro-rated + packs bought). */
export function estimateRevenueUsd(isPro: boolean, days: number, packRevenue: number): number {
  const subscription = isPro ? PRO_MONTHLY_PRICE * (days / 30) : 0;
  return usd(subscription + packRevenue);
}

export async function buildAiSpendReport(deps: AiSpendReportDeps, days: AiSpendWindow): Promise<AiSpendReportDTO> {
  const since = new Date(deps.now().getTime() - days * DAY_MS);
  const [userSpend, modelSpend, totals] = await Promise.all([
    deps.tokens.spendByUser(since, AI_SPEND_USER_LIMIT),
    deps.tokens.spendByModel(since),
    deps.tokens.spendTotals(since),
  ]);
  const ids = userSpend.map((r) => r.userId);
  const [people, proByUser, packRevenue] = await Promise.all([
    deps.users.findManyByIds(ids),
    deps.isProForUsers(ids),
    deps.tokens.packRevenueByUsers(ids, since),
  ]);
  const personById = new Map(people.map((p) => [p.id, p]));

  const users: AiSpendUserRow[] = userSpend.map((r) => {
    const isPro = proByUser.get(r.userId) ?? false;
    const revenueUsd = estimateRevenueUsd(isPro, days, packRevenue.get(r.userId) ?? 0);
    const costUsd = usd(r.cost);
    const person = personById.get(r.userId);
    return {
      userId: r.userId,
      email: person?.email ?? null,
      name: person?.name ?? null,
      isPro,
      calls: r.calls,
      tokens: r.tokens,
      costUsd,
      revenueUsd,
      marginUsd: usd(revenueUsd - costUsd),
    };
  });

  return {
    days,
    since: since.toISOString(),
    totals: { calls: totals.calls, tokens: totals.tokens, costUsd: usd(totals.cost) },
    users,
    models: groupSpendByRate(modelSpend),
    unprofitableUsers: users.filter((u) => u.marginUsd < 0).length,
  };
}

export function getAiSpendReport(deps: AiSpendReportDeps, days: AiSpendWindow): Promise<AiSpendReportDTO> {
  return getOrSetIsolateCached({
    key: `ai-spend:v1:${days}`,
    ttlSeconds: CACHE_TTL_SECONDS,
    loader: () => buildAiSpendReport(deps, days),
  });
}
