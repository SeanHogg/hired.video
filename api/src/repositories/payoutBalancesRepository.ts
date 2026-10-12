/**
 * PayoutBalancesRepository — batched, read-only balance projection for
 * many creators at once. Mirrors `PayoutLedgerService.getBalance`'s
 * arithmetic exactly:
 *
 *   available = SUM(ledger accrual)
 *             + SUM(ledger adjustment|reversal)
 *             − SUM(payouts queued|attempting|sent)
 *             − SUM(payouts settled)
 *
 * in TWO grouped queries regardless of user count (getBalance is 5 queries
 * per user). Used as a PRE-FILTER only (e.g. the release worker skipping
 * users below threshold); anything that moves money must re-read the
 * authoritative per-user balance right before writing.
 */

import { inArray, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { payoutLedgerEntries, payouts } = schema;

export type DbLike = any;

export interface IPayoutBalancesRepository {
  availableCentsByUser(userIds: string[]): Promise<Map<string, number>>;
}

export class PayoutBalancesRepository implements IPayoutBalancesRepository {
  constructor(private readonly db: DbLike) {}

  async availableCentsByUser(userIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return out;
    const [ledgerRows, payoutRows] = await Promise.all([
      this.db
        .select({
          userId: payoutLedgerEntries.userId,
          accrued: sql<number>`coalesce(sum(${payoutLedgerEntries.amountCents}) FILTER (WHERE ${payoutLedgerEntries.kind} = 'accrual'), 0)::int`,
          adjustments: sql<number>`coalesce(sum(${payoutLedgerEntries.amountCents}) FILTER (WHERE ${payoutLedgerEntries.kind} IN ('adjustment','reversal')), 0)::int`,
        })
        .from(payoutLedgerEntries)
        .where(inArray(payoutLedgerEntries.userId, unique))
        .groupBy(payoutLedgerEntries.userId) as Promise<Array<{ userId: string; accrued: number; adjustments: number }>>,
      this.db
        .select({
          userId: payouts.userId,
          inFlight: sql<number>`coalesce(sum(${payouts.amountCents}) FILTER (WHERE ${payouts.status} IN ('queued','attempting','sent')), 0)::int`,
          paid: sql<number>`coalesce(sum(${payouts.amountCents}) FILTER (WHERE ${payouts.status} = 'settled'), 0)::int`,
        })
        .from(payouts)
        .where(inArray(payouts.userId, unique))
        .groupBy(payouts.userId) as Promise<Array<{ userId: string; inFlight: number; paid: number }>>,
    ]);
    for (const id of unique) out.set(id, 0);
    for (const r of ledgerRows) {
      out.set(r.userId, (out.get(r.userId) ?? 0) + Number(r.accrued ?? 0) + Number(r.adjustments ?? 0));
    }
    for (const r of payoutRows) {
      out.set(r.userId, (out.get(r.userId) ?? 0) - Number(r.inFlight ?? 0) - Number(r.paid ?? 0));
    }
    return out;
  }
}
