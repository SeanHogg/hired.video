/**
 * PartnerProgramRepository — batched persistence for the Partner Program
 * monthly pool close + dispatch (services/articles/partner-pool.ts). The
 * running per-user balance is the `partner_pool` wallet (pending = balance,
 * paid = lifetime_consumed), written through the one WalletRepository.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import { userWallet, WalletRepository } from "./walletRepository.js";
import { partnerProgramBalanceView } from "./walletViews.js";

const { partnerPayouts, partnerProgramOptIns, users } = schema;

export type PartnerProgramOptInRow = typeof partnerProgramOptIns.$inferSelect;
export type PartnerProgramOptInInsert = typeof partnerProgramOptIns.$inferInsert;

const PARTNER_POOL = "partner_pool" as const;

export type DbLike = any;

export interface PeriodShareRow {
  userId: string;
  shareCents: number;
  score: number;
  readSeconds: number;
  claps: number;
  shares: number;
}

export interface IPartnerProgramRepository {
  /** Bump every user's running balance by their period share AND write the
   *  matching partner_payouts row, in ONE statement (data-modifying CTE),
   *  so the balance bump and payout row commit or roll back together for
   *  the whole batch. Status per row is decided from the POST-bump balance
   *  (`>= minPayoutCents` → 'pending', else 'held_until_threshold'). The
   *  (period_id, user_id) unique index still rejects a re-run — and now
   *  rolls back the balance bumps with it. `rows` must have unique userIds. */
  accruePeriodShares(args: {
    periodId: string;
    rows: PeriodShareRow[];
    holdUntil: Date;
    now: Date;
    minPayoutCents: number;
  }): Promise<{ paidCount: number; heldCount: number }>;
  /** name/email for many users in one query. */
  findRecipients(userIds: string[]): Promise<Map<string, { name: string | null; email: string | null }>>;
  /** Move a dispatched share from pending to paid. */
  markShareDispatched(userId: string, shareCents: number): Promise<void>;
  /** The user's running balance in the pre-merge partner_program_balances
   *  shape, or null when they never accrued. */
  findBalance(userId: string): Promise<ReturnType<typeof partnerProgramBalanceView> | null>;
  /** Deactivate the user's active opt-in row(s) with a reason. */
  deactivateActiveOptIns(userId: string, reason: string, now: Date): Promise<void>;
  insertOptIn(values: PartnerProgramOptInInsert): Promise<PartnerProgramOptInRow>;
  findActiveOptIn(userId: string): Promise<PartnerProgramOptInRow | null>;
}

export class PartnerProgramRepository implements IPartnerProgramRepository {
  private readonly wallets: WalletRepository;

  constructor(private readonly db: DbLike) {
    this.wallets = new WalletRepository(db);
  }

  async accruePeriodShares(args: {
    periodId: string;
    rows: PeriodShareRow[];
    holdUntil: Date;
    now: Date;
    minPayoutCents: number;
  }): Promise<{ paidCount: number; heldCount: number }> {
    const { periodId, rows, holdUntil, now, minPayoutCents } = args;
    if (rows.length === 0) return { paidCount: 0, heldCount: 0 };
    const values = sql.join(
      rows.map(
        (r) =>
          sql`(${r.userId}::uuid, ${r.shareCents}::int, ${r.score}::real, ${r.readSeconds}::int, ${r.claps}::int, ${r.shares}::int)`,
      ),
      sql`, `,
    );
    // `now` is the wallet's updated_at (WalletRepository is built per call
    // so the batch shares one timestamp).
    const credit = new WalletRepository(this.db, () => now).creditFromSelectSql({
      ownerKind: "user",
      currency: PARTNER_POOL,
      source: sql`SELECT user_id AS owner_id, share_cents AS amount FROM input`,
      lastPeriodId: periodId,
    });
    const returned = (await this.wallets.execute(sql`
      WITH input(user_id, share_cents, score, read_seconds, claps, shares) AS (
        VALUES ${values}
      ),
      bal AS (${credit})
      INSERT INTO ${partnerPayouts}
        (period_id, user_id, engagement_score, read_seconds, claps, shares, user_share_cents, hold_until, status)
      SELECT ${periodId}::uuid, i.user_id, i.score, i.read_seconds, i.claps, i.shares, i.share_cents, ${holdUntil},
             CASE WHEN bal.balance >= ${minPayoutCents}::int THEN 'pending' ELSE 'held_until_threshold' END
      FROM input i
      JOIN bal ON bal.owner_id = i.user_id
      RETURNING status
    `)) as Array<{ status: string }>;
    let paidCount = 0;
    let heldCount = 0;
    for (const r of returned) {
      if (r.status === "pending") paidCount++;
      else heldCount++;
    }
    return { paidCount, heldCount };
  }

  async markShareDispatched(userId: string, shareCents: number): Promise<void> {
    await this.wallets.applyDelta(userWallet(userId), PARTNER_POOL, {
      delta: -shareCents,
      consumedAdd: shareCents,
      createIfMissing: false,
    });
  }

  async findBalance(userId: string) {
    const row = await this.wallets.find(userWallet(userId), PARTNER_POOL);
    return row ? partnerProgramBalanceView(row) : null;
  }

  async findRecipients(userIds: string[]): Promise<Map<string, { name: string | null; email: string | null }>> {
    const out = new Map<string, { name: string | null; email: string | null }>();
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return out;
    const rows: Array<{ id: string; name: string | null; email: string | null }> = await this.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, unique));
    for (const r of rows) out.set(r.id, { name: r.name, email: r.email });
    return out;
  }

  async deactivateActiveOptIns(userId: string, reason: string, now: Date): Promise<void> {
    await this.db.update(partnerProgramOptIns)
      .set({ isActive: false, deactivatedAt: now, deactivatedReason: reason })
      .where(and(
        eq(partnerProgramOptIns.userId, userId),
        eq(partnerProgramOptIns.isActive, true),
      ));
  }

  async insertOptIn(values: PartnerProgramOptInInsert): Promise<PartnerProgramOptInRow> {
    const [inserted] = await this.db.insert(partnerProgramOptIns).values(values).returning();
    return inserted;
  }

  async findActiveOptIn(userId: string): Promise<PartnerProgramOptInRow | null> {
    const [optIn] = await this.db.select().from(partnerProgramOptIns)
      .where(and(
        eq(partnerProgramOptIns.userId, userId),
        eq(partnerProgramOptIns.isActive, true),
      ))
      .limit(1);
    return optIn ?? null;
  }
}
