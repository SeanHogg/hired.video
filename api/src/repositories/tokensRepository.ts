/**
 * TokensRepository — the AI-usage metering aggregate:
 *   • pack balance         — wallet_balances (currency 'ai_tokens'), via
 *                            the one WalletRepository
 *   • tokenPackPurchases   — pending/paid purchases + admin-grant ledger rows
 *   • aiUsageRecords       — per-request token burn
 *   • toolRuns             — per-invocation tool-run log (tokens, latency)
 *
 * One aggregate because all four tables answer "how was AI usage
 * metered and charged": balance = what they have, purchases = where it
 * came from, usage + tool runs = where it went. Splitting would
 * fragment the same transactional story.
 */

import { and, desc, eq, gte, inArray, isNull, lt, ne, or, sql, sum } from "drizzle-orm";
import { ADMIN_GRANT_PACK_ID } from "../../../shared/token-packs.js";
import { schema } from "../db/index.js";
import { signalWork } from "../services/scheduling/work-signals.js";
import { userWallet, WalletRepository } from "./walletRepository.js";

const { tokenPackPurchases, aiUsageRecords, toolRuns, boostCheckouts, courseCheckouts, jobBoosts } = schema;

/** The provider transaction id was already claimed by a boost or course
 *  checkout — it can't also pay for a token pack. */
export class PaymentAlreadyClaimedError extends Error {
  constructor() {
    super("Payment already claimed by another checkout");
    this.name = "PaymentAlreadyClaimedError";
  }
}

export type DbLike = any;

/** A user's purchased-pack token balance (the pre-merge user_token_balance shape). */
export interface UserTokenBalanceRow {
  id: string;
  userId: string;
  balance: number;
  lifetimeGranted: number;
  lifetimeConsumed: number;
  updatedAt: Date;
}

const AI_TOKENS = "ai_tokens" as const;
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
  /** Debit `tokens` from the pack balance (clamped at 0; lifetime consumed
   *  += tokens). Creates the row when missing. */
  debitPackBalance(userId: string, tokens: number): Promise<void>;
  // purchases
  insertPurchase(input: TokenPackPurchaseInsert): Promise<TokenPackPurchaseRow>;
  /** Record a charge as `pending` before the provider check (gap #2352). One
   *  row per payment reference (unique, 0501): a replay returns the row that
   *  is already there, whatever its status. */
  recordPendingPurchase(input: TokenPackPurchaseInsert): Promise<TokenPackPurchaseRow>;
  /** pending → paid AND credit the balance, in ONE statement. True only for
   *  the call that made the flip — a replayed confirm, a concurrent cron run
   *  or a second webhook gets false and credits nothing. */
  settlePendingPurchase(purchaseId: string): Promise<boolean>;
  /** Count a provider check on a pending row and set its next status. */
  markPurchaseChecked(purchaseId: string, status: "pending" | "rejected" | "expired"): Promise<void>;
  /** The stalest pending rows created before `createdBefore` and last
   *  checked before `checkedBefore` (or never), oldest first. */
  listPendingPurchases(input: { limit: number; createdBefore: Date; checkedBefore: Date }): Promise<TokenPackPurchaseRow[]>;
  // usage records
  insertUsage(input: AiUsageInsert): Promise<AiUsageRow>;
  monthlyUsedByUser(userId: string, periodStart: Date, periodEnd: Date): Promise<number>;
  monthlyUsedByUsers(
    userIds: string[],
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Array<{ userId: string; used: number }>>;
  deleteMonthlyUsageForUser(userId: string, periodStart: Date, periodEnd: Date): Promise<void>;
  // spend (SA monitoring, shared/ai-spend.ts) — cost is USD per call
  spendByUser(since: Date, limit: number): Promise<SpendAggregate<"userId">[]>;
  spendByModel(since: Date): Promise<SpendAggregate<"model">[]>;
  spendTotals(since: Date): Promise<{ calls: number; tokens: number; cost: number }>;
  /** USD paid for token packs per user since `since` (excludes admin grants). */
  packRevenueByUsers(userIds: string[], since: Date): Promise<Map<string, number>>;
  // tool runs — another flavor of metered usage; lives here because
  // "how much AI did this user consume" is one question no matter what
  // surface the usage came from.
  insertToolRun(input: ToolRunInsert): Promise<void>;
  findToolRunsForUser(userId: string, limit?: number): Promise<ToolRunRow[]>;
  toolRunStatsByUsers(userIds: string[]): Promise<Map<string, { runs: number; tokens: number }>>;
}

export type SpendAggregate<K extends string> = { [P in K]: string } & {
  calls: number;
  tokens: number;
  cost: number;
};

export class TokensRepository implements ITokensRepository {
  private readonly wallets: WalletRepository;

  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {
    this.wallets = new WalletRepository(db, now);
  }

  // ── balances ──────────────────────────────────────────────────────────────

  async findBalanceByUserId(userId: string): Promise<UserTokenBalanceRow | null> {
    const w = await this.wallets.find(userWallet(userId), AI_TOKENS);
    if (!w) return null;
    return {
      id: w.id,
      userId: w.ownerId,
      balance: w.balance,
      lifetimeGranted: w.lifetimeGranted,
      lifetimeConsumed: w.lifetimeConsumed,
      updatedAt: w.updatedAt,
    };
  }

  async findBalancesByUserIds(userIds: string[]) {
    const rows = await this.wallets.findMany("user", userIds, AI_TOKENS);
    return rows.map((w) => ({ userId: w.ownerId, balance: w.balance }));
  }

  /** Atomically add `deltaBalance` to the user's balance and
   *  `deltaGranted` to their lifetime-granted counter. Used by both
   *  paid pack purchases (via stripe webhook) and SuperAdmin grants. */
  async upsertBalance(userId: string, deltaBalance: number, deltaGranted: number): Promise<void> {
    await this.wallets.applyDelta(userWallet(userId), AI_TOKENS, { delta: deltaBalance, grantedAdd: deltaGranted });
  }

  async debitPackBalance(userId: string, tokens: number): Promise<void> {
    await this.wallets.applyDelta(userWallet(userId), AI_TOKENS, {
      delta: -tokens,
      clampAtZero: true,
      consumedAdd: tokens,
    });
  }

  // ── purchases ─────────────────────────────────────────────────────────────

  async insertPurchase(input: TokenPackPurchaseInsert): Promise<TokenPackPurchaseRow> {
     
    const [created] = await (this.db.insert(tokenPackPurchases) as any).values(input).returning();
    return created as TokenPackPurchaseRow;
  }

  async recordPendingPurchase(input: TokenPackPurchaseInsert): Promise<TokenPackPurchaseRow> {
    const ref = input.stripePaymentIntentId;
    // One provider payment pays for exactly one thing: refuse a transaction
    // id a boost or course checkout already claimed. Mirrors the reverse
    // NOT EXISTS (token_pack_purchases) guards in the boost and course
    // claimPayment statements, so whichever claim lands second is refused.
    if (ref && (await this.isPaymentClaimedElsewhere(ref))) throw new PaymentAlreadyClaimedError();
    const rows = await (this.db.insert(tokenPackPurchases) as any)
      .values({ ...input, status: "pending" })
      .onConflictDoNothing()
      .returning();
    const created = rows?.[0] as TokenPackPurchaseRow | undefined;
    if (created) {
      // Wake the cron's token-pack reconcile queue (KV marker).
      await signalWork("token-packs");
      return created;
    }
    if (!ref) throw new Error("recordPendingPurchase: a payment reference is required");
    const [existing] = await this.db
      .select()
      .from(tokenPackPurchases)
      .where(eq(tokenPackPurchases.stripePaymentIntentId, ref))
      .limit(1);
    return existing as TokenPackPurchaseRow;
  }

  private async isPaymentClaimedElsewhere(providerPaymentId: string): Promise<boolean> {
    const result = await this.db.execute(sql`
      SELECT EXISTS (SELECT 1 FROM ${boostCheckouts} WHERE ${boostCheckouts.providerPaymentId} = ${providerPaymentId})
          OR EXISTS (SELECT 1 FROM ${courseCheckouts} WHERE ${courseCheckouts.providerPaymentId} = ${providerPaymentId})
          OR EXISTS (SELECT 1 FROM ${jobBoosts} WHERE ${jobBoosts.stripePaymentIntentId} = ${providerPaymentId})
        AS claimed
    `);
    const rows: Array<{ claimed?: unknown }> = Array.isArray(result) ? result : (result?.rows ?? []);
    return rows[0]?.claimed === true || rows[0]?.claimed === "t";
  }

  async settlePendingPurchase(purchaseId: string): Promise<boolean> {
    // One statement, so the flip and the credit can't come apart: a crash
    // between them would otherwise leave a `paid` row with no tokens.
    const credit = this.wallets.creditFromSelectSql({
      ownerKind: "user",
      currency: AI_TOKENS,
      source: sql`SELECT user_id AS owner_id, tokens_granted AS amount FROM flipped`,
    });
    const rows = await this.wallets.execute(sql`
      WITH flipped AS (
        UPDATE token_pack_purchases
        SET status = 'paid', check_attempts = check_attempts + 1, checked_at = ${this.now()}
        WHERE id = ${purchaseId} AND status = 'pending'
        RETURNING user_id, tokens_granted
      )
      ${credit}
    `);
    return rows.length > 0;
  }

  async markPurchaseChecked(purchaseId: string, status: "pending" | "rejected" | "expired"): Promise<void> {
    await this.db
      .update(tokenPackPurchases)
      .set({
        status,
        checkAttempts: sql`${tokenPackPurchases.checkAttempts} + 1`,
        checkedAt: this.now(),
      })
      .where(and(eq(tokenPackPurchases.id, purchaseId), eq(tokenPackPurchases.status, "pending")));
  }

  async listPendingPurchases(input: {
    limit: number;
    createdBefore: Date;
    checkedBefore: Date;
  }): Promise<TokenPackPurchaseRow[]> {
    // Served by idx_token_pack_purchases_pending (0517).
    const rows = await this.db
      .select()
      .from(tokenPackPurchases)
      .where(
        and(
          eq(tokenPackPurchases.status, "pending"),
          lt(tokenPackPurchases.createdAt, input.createdBefore),
          or(isNull(tokenPackPurchases.checkedAt), lt(tokenPackPurchases.checkedAt, input.checkedBefore)),
        ),
      )
      .orderBy(sql`${tokenPackPurchases.checkedAt} ASC NULLS FIRST`, tokenPackPurchases.createdAt)
      .limit(input.limit);
    return rows as TokenPackPurchaseRow[];
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

  // ── spend ──────────────────────────────────────────────────────────────────

  private spendColumns() {
    return {
      calls: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${aiUsageRecords.totalTokens}), 0)::bigint`,
      cost: sql<string>`coalesce(sum(${aiUsageRecords.cost}), 0)`,
    };
  }

  private static toSpend<K extends string>(key: K, rows: Array<Record<string, unknown>>): SpendAggregate<K>[] {
    return rows.map((r) => ({
      [key]: String(r[key]),
      calls: Number(r.calls ?? 0),
      tokens: Number(r.tokens ?? 0),
      cost: Number(r.cost ?? 0),
    })) as SpendAggregate<K>[];
  }

  async spendByUser(since: Date, limit: number) {
    const cost = sql`sum(${aiUsageRecords.cost})`;
    const rows = await this.db
      .select({ userId: aiUsageRecords.userId, ...this.spendColumns() })
      .from(aiUsageRecords)
      .where(gte(aiUsageRecords.createdAt, since))
      .groupBy(aiUsageRecords.userId)
      .orderBy(desc(cost))
      .limit(limit);
    return TokensRepository.toSpend("userId", rows);
  }

  async spendByModel(since: Date) {
    const rows = await this.db
      .select({ model: aiUsageRecords.model, ...this.spendColumns() })
      .from(aiUsageRecords)
      .where(gte(aiUsageRecords.createdAt, since))
      .groupBy(aiUsageRecords.model);
    return TokensRepository.toSpend("model", rows);
  }

  async spendTotals(since: Date) {
    const [row] = await this.db
      .select(this.spendColumns())
      .from(aiUsageRecords)
      .where(gte(aiUsageRecords.createdAt, since));
    return { calls: Number(row?.calls ?? 0), tokens: Number(row?.tokens ?? 0), cost: Number(row?.cost ?? 0) };
  }

  async packRevenueByUsers(userIds: string[], since: Date): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db
      .select({ userId: tokenPackPurchases.userId, paid: sum(tokenPackPurchases.pricePaid) })
      .from(tokenPackPurchases)
      .where(and(
        inArray(tokenPackPurchases.userId, userIds),
        gte(tokenPackPurchases.createdAt, since),
        eq(tokenPackPurchases.status, "paid"),
        ne(tokenPackPurchases.packId, ADMIN_GRANT_PACK_ID),
      ))
      .groupBy(tokenPackPurchases.userId);
    return new Map(
      (rows as Array<{ userId: string; paid: string | null }>).map((r) => [r.userId, Number(r.paid ?? 0)]),
    );
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
