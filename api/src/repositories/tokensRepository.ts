/**
 * TokensRepository — the AI-usage metering aggregate:
 *   • userTokenBalance     — pack balance + lifetime counters
 *   • tokenPackPurchases   — paid + admin-grant ledger rows
 *   • aiUsageRecords       — per-request token burn
 *   • toolRuns             — per-invocation tool-run log (tokens, latency)
 *
 * One aggregate because all four tables answer "how was AI usage
 * metered and charged": balance = what they have, purchases = where it
 * came from, usage + tool runs = where it went. Splitting would
 * fragment the same transactional story.
 */

import { and, desc, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import { schema } from "../db/index.js";

const { userTokenBalance, tokenPackPurchases, aiUsageRecords, toolRuns } = schema;

export type DbLike = any;

export type UserTokenBalanceRow = typeof userTokenBalance.$inferSelect;
export type TokenPackPurchaseRow = typeof tokenPackPurchases.$inferSelect;
export type TokenPackPurchaseInsert = typeof tokenPackPurchases.$inferInsert;
export type AiUsageRow = typeof aiUsageRecords.$inferSelect;
export type AiUsageInsert = typeof aiUsageRecords.$inferInsert;
export type ToolRunRow = typeof toolRuns.$inferSelect;
export type ToolRunInsert = typeof toolRuns.$inferInsert;

export interface ITokensRepository {
  // balances
  findBalanceByUserId(userId: string): Promise<UserTokenBalanceRow | null>;
  findBalancesByUserIds(userIds: string[]): Promise<Array<{ userId: string; balance: number }>>;
  upsertBalance(userId: string, deltaBalance: number, deltaGranted: number): Promise<void>;
  // purchases
  insertPurchase(input: TokenPackPurchaseInsert): Promise<TokenPackPurchaseRow>;
  // usage records
  insertUsage(input: AiUsageInsert): Promise<AiUsageRow>;
  monthlyUsedByUser(userId: string, periodStart: Date, periodEnd: Date): Promise<number>;
  monthlyUsedByUsers(
    userIds: string[],
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Array<{ userId: string; used: number }>>;
  deleteMonthlyUsageForUser(userId: string, periodStart: Date, periodEnd: Date): Promise<void>;
  // tool runs — another flavor of metered usage; lives here because
  // "how much AI did this user consume" is one question no matter what
  // surface the usage came from.
  insertToolRun(input: ToolRunInsert): Promise<void>;
  findToolRunsForUser(userId: string, limit?: number): Promise<ToolRunRow[]>;
  toolRunStatsByUsers(userIds: string[]): Promise<Map<string, { runs: number; tokens: number }>>;
}

export class TokensRepository implements ITokensRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  // ── balances ──────────────────────────────────────────────────────────────

  async findBalanceByUserId(userId: string): Promise<UserTokenBalanceRow | null> {
    const [row] = await this.db
      .select()
      .from(userTokenBalance)
      .where(eq(userTokenBalance.userId, userId))
      .limit(1);
    return (row as UserTokenBalanceRow) ?? null;
  }

  async findBalancesByUserIds(userIds: string[]) {
    if (userIds.length === 0) return [];
    const rows = await this.db
      .select({ userId: userTokenBalance.userId, balance: userTokenBalance.balance })
      .from(userTokenBalance)
      .where(inArray(userTokenBalance.userId, userIds));
    return rows as Array<{ userId: string; balance: number }>;
  }

  /** Atomically add `deltaBalance` to the user's balance and
   *  `deltaGranted` to their lifetime-granted counter. Used by both
   *  paid pack purchases (via stripe webhook) and SuperAdmin grants. */
  async upsertBalance(userId: string, deltaBalance: number, deltaGranted: number): Promise<void> {
     
    await (this.db.insert(userTokenBalance) as any)
      .values({
        userId,
        balance: deltaBalance,
        lifetimeGranted: deltaGranted,
        lifetimeConsumed: 0,
      })
      .onConflictDoUpdate({
        target: userTokenBalance.userId,
        set: {
          balance: sql`${userTokenBalance.balance} + ${deltaBalance}`,
          lifetimeGranted: sql`${userTokenBalance.lifetimeGranted} + ${deltaGranted}`,
          updatedAt: this.now(),
        },
      });
  }

  // ── purchases ─────────────────────────────────────────────────────────────

  async insertPurchase(input: TokenPackPurchaseInsert): Promise<TokenPackPurchaseRow> {
     
    const [created] = await (this.db.insert(tokenPackPurchases) as any).values(input).returning();
    return created as TokenPackPurchaseRow;
  }

  // ── usage ─────────────────────────────────────────────────────────────────

  async insertUsage(input: AiUsageInsert): Promise<AiUsageRow> {
    const [created] = await this.db.insert(aiUsageRecords).values(input as any).returning();
    return created as AiUsageRow;
  }

  async monthlyUsedByUser(userId: string, periodStart: Date, periodEnd: Date): Promise<number> {
    const [row] = await this.db
      .select({ used: sum(aiUsageRecords.totalTokens) })
      .from(aiUsageRecords)
      .where(and(
        eq(aiUsageRecords.userId, userId),
        eq(aiUsageRecords.source, "monthly"),
        gte(aiUsageRecords.createdAt, periodStart),
        lt(aiUsageRecords.createdAt, periodEnd),
      ));
    return Number(row?.used ?? 0);
  }

  async monthlyUsedByUsers(userIds: string[], periodStart: Date, periodEnd: Date) {
    if (userIds.length === 0) return [];
    const rows = await this.db
      .select({
        userId: aiUsageRecords.userId,
        used: sum(aiUsageRecords.totalTokens),
      })
      .from(aiUsageRecords)
      .where(and(
        inArray(aiUsageRecords.userId, userIds),
        eq(aiUsageRecords.source, "monthly"),
        gte(aiUsageRecords.createdAt, periodStart),
        lt(aiUsageRecords.createdAt, periodEnd),
      ))
      .groupBy(aiUsageRecords.userId);
    return (rows as Array<{ userId: string; used: string | null }>).map((r) => ({
      userId: r.userId,
      used: Number(r.used ?? 0),
    }));
  }

  async deleteMonthlyUsageForUser(userId: string, periodStart: Date, periodEnd: Date): Promise<void> {
    await this.db
      .delete(aiUsageRecords)
      .where(and(
        eq(aiUsageRecords.userId, userId),
        eq(aiUsageRecords.source, "monthly"),
        gte(aiUsageRecords.createdAt, periodStart),
        lt(aiUsageRecords.createdAt, periodEnd),
      ));
  }

  // ── tool runs ─────────────────────────────────────────────────────────────

  async insertToolRun(input: ToolRunInsert): Promise<void> {
    await this.db.insert(toolRuns).values(input as any);
  }

  async findToolRunsForUser(userId: string, limit = 100): Promise<ToolRunRow[]> {
    return (await this.db
      .select()
      .from(toolRuns)
      .where(eq(toolRuns.userId, userId))
      .orderBy(desc(toolRuns.createdAt))
      .limit(Math.min(500, Math.max(1, limit)))) as ToolRunRow[];
  }

  async toolRunStatsByUsers(userIds: string[]): Promise<Map<string, { runs: number; tokens: number }>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        userId: toolRuns.userId,
        runs: sql<number>`count(*)::int`,
        tokens: sum(toolRuns.tokensUsed),
      })
      .from(toolRuns)
      .where(inArray(toolRuns.userId, userIds))
      .groupBy(toolRuns.userId);
    return new Map(
      (rows as Array<{ userId: string; runs: number; tokens: number | null }>).map((r) => [
        r.userId,
        { runs: Number(r.runs), tokens: Number(r.tokens ?? 0) },
      ]),
    );
  }
}
