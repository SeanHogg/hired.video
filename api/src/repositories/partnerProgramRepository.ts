/**
 * PartnerProgramRepository — batched persistence for the Partner Program
 * monthly pool close + dispatch (services/articles/partner-pool.ts).
 */

import { inArray, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { partnerProgramBalances, partnerPayouts, users } = schema;

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
}

export class PartnerProgramRepository implements IPartnerProgramRepository {
  constructor(private readonly db: DbLike) {}

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
    const result = await this.db.execute(sql`
      WITH input(user_id, share_cents, score, read_seconds, claps, shares) AS (
        VALUES ${values}
      ),
      bal AS (
        INSERT INTO ${partnerProgramBalances} (user_id, pending_cents, last_period_id)
        SELECT user_id, share_cents, ${periodId}::uuid FROM input
        ON CONFLICT (user_id) DO UPDATE SET
          pending_cents = ${partnerProgramBalances}.pending_cents + excluded.pending_cents,
          last_period_id = excluded.last_period_id,
          updated_at = ${now}
        RETURNING user_id, pending_cents
      )
      INSERT INTO ${partnerPayouts}
        (period_id, user_id, engagement_score, read_seconds, claps, shares, user_share_cents, hold_until, status)
      SELECT ${periodId}::uuid, i.user_id, i.score, i.read_seconds, i.claps, i.shares, i.share_cents, ${holdUntil},
             CASE WHEN bal.pending_cents >= ${minPayoutCents}::int THEN 'pending' ELSE 'held_until_threshold' END
      FROM input i
      JOIN bal ON bal.user_id = i.user_id
      RETURNING status
    `);
    const returned: Array<{ status: string }> = Array.isArray(result) ? result : (result?.rows ?? []);
    let paidCount = 0;
    let heldCount = 0;
    for (const r of returned) {
      if (r.status === "pending") paidCount++;
      else heldCount++;
    }
    return { paidCount, heldCount };
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
}
