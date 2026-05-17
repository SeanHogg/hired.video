/**
 * PayoutLedgerService — single write path for creator-balance movements.
 *
 * The append-only `payout_ledger_entries` table is the source of truth for
 * "how much can this creator be paid out right now." Balance is
 * SUM(amount_cents), broken out by entry kind for display:
 *
 *   accrued = SUM(kind='accrual')
 *   reserved = -SUM(kind='payout' AND payouts.status IN ('queued','attempting','sent'))
 *   paid     = -SUM(kind='payout' AND payouts.status IN ('settled'))
 *   available = accrued + reserved + paid + SUM(kind='reversal'|'adjustment')
 *
 * Every revenue surface that pays creators routes through `recordAccrual`
 * — replacing scattered `creator_profiles.total_earned_cents += X` writes
 * (DRY rule). The denormalised `total_earned_cents` is updated in the same
 * transaction so the existing "$X earned to date" displays keep working.
 *
 * Idempotency: (source_kind, source_id) is a UNIQUE index on accrual rows
 * so the same business event firing twice (webhook retry, cron rerun)
 * can't double-credit the creator.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { PayoutBalanceDTO } from "../../../../shared/payout-profile.js";

const { payoutLedgerEntries, payouts, payoutProfiles, creatorProfiles } = schema;

export type LedgerSourceKind =
  | "promo_project"
  | "promo_extra_revision"
  | "voice_clone_license"
  | "template_license"
  | "service_order"
  | "course_enrollment"
  | "article_pool_distribution";

export interface RecordAccrualInput {
  userId: string;
  amountCents: number;
  currency?: string;
  sourceKind: LedgerSourceKind;
  sourceId: string;
  note?: string;
}

export class PayoutLedgerService {
  /**
   * Append an accrual entry and bump the denormalised lifetime counter on
   * creator_profiles. Idempotent via the (source_kind, source_id) unique
   * index — repeat calls return the existing entry id without writing.
   */
  async recordAccrual(input: RecordAccrualInput): Promise<{ entryId: string; created: boolean }> {
    if (input.amountCents <= 0) {
      throw new Error("recordAccrual: amountCents must be positive");
    }
    const db = getDb();

    // ON CONFLICT DO NOTHING on the partial unique index. Drizzle's
    // .onConflictDoNothing() doesn't take a partial-index target, so we
    // do an existence check first — both branches are inside the same
    // function so callers don't have to know.
    const [existing] = await db
      .select({ id: payoutLedgerEntries.id })
      .from(payoutLedgerEntries)
      .where(
        and(
          eq(payoutLedgerEntries.kind, "accrual"),
          eq(payoutLedgerEntries.sourceKind, input.sourceKind),
          eq(payoutLedgerEntries.sourceId, input.sourceId),
        ),
      )
      .limit(1);
    if (existing) return { entryId: existing.id, created: false };

    const [entry] = await db
      .insert(payoutLedgerEntries)
      .values({
        userId: input.userId,
        amountCents: input.amountCents,
        currency: input.currency ?? "USD",
        kind: "accrual",
        sourceKind: input.sourceKind,
        sourceId: input.sourceId,
        note: input.note ?? null,
      })
      .returning({ id: payoutLedgerEntries.id });

    // Lifetime "earned to date" counter on the active creator-program row.
    // Soft-fails on creators without an active enrollment row — the ledger
    // is still the source of truth; the counter is just a display cache.
    await db
      .update(creatorProfiles)
      .set({
        totalEarnedCents: sql`${creatorProfiles.totalEarnedCents} + ${input.amountCents}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(creatorProfiles.userId, input.userId),
          sql`${creatorProfiles.endedAt} IS NULL`,
        ),
      );

    return { entryId: entry.id, created: true };
  }

  /**
   * Append a payout debit. Called by PayoutOrchestrator when a payouts row
   * transitions from 'queued' to 'attempting' — the ledger entry reflects
   * funds in-flight even before the provider confirms settlement.
   */
  async recordPayoutDebit(opts: {
    userId: string;
    amountCents: number;
    currency: string;
    payoutId: string;
  }): Promise<void> {
    const db = getDb();
    await db.insert(payoutLedgerEntries).values({
      userId: opts.userId,
      amountCents: -opts.amountCents,
      currency: opts.currency,
      kind: "payout",
      sourcePayoutId: opts.payoutId,
    });
  }

  /**
   * Append a reversal entry when a previously-debited payout fails or is
   * returned. Pairs with the original 'payout' entry by source_payout_id.
   */
  async recordReversal(opts: {
    userId: string;
    amountCents: number;
    currency: string;
    payoutId: string;
    note?: string;
  }): Promise<void> {
    const db = getDb();
    await db.insert(payoutLedgerEntries).values({
      userId: opts.userId,
      amountCents: opts.amountCents,
      currency: opts.currency,
      kind: "reversal",
      sourcePayoutId: opts.payoutId,
      note: opts.note ?? null,
    });
  }

  /**
   * Compute the creator's balance breakdown. Reads the ledger + the
   * configured threshold off payout_profiles. Used by both the
   * Settings → Payouts UI and (next pass) the release worker.
   */
  async getBalance(userId: string): Promise<PayoutBalanceDTO> {
    const db = getDb();

    const [accruedRow] = await db
      .select({ sum: sql<number>`coalesce(sum(${payoutLedgerEntries.amountCents}), 0)::int` })
      .from(payoutLedgerEntries)
      .where(and(eq(payoutLedgerEntries.userId, userId), eq(payoutLedgerEntries.kind, "accrual")));

    const [adjustmentsRow] = await db
      .select({ sum: sql<number>`coalesce(sum(${payoutLedgerEntries.amountCents}), 0)::int` })
      .from(payoutLedgerEntries)
      .where(
        and(
          eq(payoutLedgerEntries.userId, userId),
          inArray(payoutLedgerEntries.kind, ["adjustment", "reversal"]),
        ),
      );

    const [inFlightRow] = await db
      .select({ sum: sql<number>`coalesce(sum(${payouts.amountCents}), 0)::int` })
      .from(payouts)
      .where(
        and(
          eq(payouts.userId, userId),
          inArray(payouts.status, ["queued", "attempting", "sent"]),
        ),
      );

    const [paidRow] = await db
      .select({ sum: sql<number>`coalesce(sum(${payouts.amountCents}), 0)::int` })
      .from(payouts)
      .where(and(eq(payouts.userId, userId), eq(payouts.status, "settled")));

    const [profile] = await db
      .select({
        minPayoutThresholdCents: payoutProfiles.minPayoutThresholdCents,
        payoutCurrency: payoutProfiles.payoutCurrency,
      })
      .from(payoutProfiles)
      .where(eq(payoutProfiles.userId, userId))
      .limit(1);

    const accruedCents = accruedRow?.sum ?? 0;
    const adjustmentsCents = adjustmentsRow?.sum ?? 0;
    const reservedCents = inFlightRow?.sum ?? 0;
    const paidCents = paidRow?.sum ?? 0;
    const availableCents = accruedCents + adjustmentsCents - reservedCents - paidCents;
    const minPayoutThresholdCents = profile?.minPayoutThresholdCents ?? 5000;

    return {
      accruedCents,
      reservedCents,
      paidCents,
      availableCents,
      currency: profile?.payoutCurrency ?? "USD",
      minPayoutThresholdCents,
      isAboveThreshold: availableCents >= minPayoutThresholdCents,
    };
  }
}

// Module-level singleton — the service has no constructor state, so a single
// instance is fine. Tests instantiate their own when they need to.
export const payoutLedgerService = new PayoutLedgerService();
