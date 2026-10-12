/**
 * #773 — Min-payout-threshold release worker.
 *
 * Cron-driven (default: weekly Tuesday 09:00 UTC, configured in
 * wrangler.toml). For every payout-enabled user whose ledger balance
 * is at or above their personal `minPayoutThresholdCents`, this
 * worker:
 *
 *   1. Inserts a `payouts` row in 'queued' status for the available
 *      balance.
 *   2. Calls the configured `PayoutProvider.createPayout(...)`.
 *   3. Transitions the row to 'sent' (or 'failed' + ledger reversal).
 *   4. Emits a structured log line per attempt so ops can grep
 *      `[release-worker]` to audit a run.
 *
 * Idempotency: payouts.providerPayoutId is UNIQUE per provider; if a
 * second tick fires before the provider webhook lands, the existing
 * 'queued'/'attempting'/'sent' rows already debit the ledger via
 * payout_ledger_entries.kind='payout', so getBalance().availableCents
 * naturally drops below threshold and the next tick skips the user.
 *
 * Webhook side: lifecycle transitions (sent → settled / failed) come
 * from applyPayoutWebhook in routes/payouts.ts — this worker is the
 * producer; the webhook is the consumer. The two never write the same
 * column at the same time because:
 *   • worker only writes the initial 'queued' → 'sent' transition
 *   • webhook only writes 'settled' / 'failed' / 'reversed' from there
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { payoutLedgerService } from "./PayoutLedgerService.js";
import { invalidateTaxYearReports } from "./TaxReportingService.js";
import { PayoutBalancesRepository } from "../../repositories/payoutBalancesRepository.js";
import { tryGetPayoutProvider } from "./index.js";
import type { ActivePayoutProvider } from "../../../../shared/payout-profile.js";

const { payouts, payoutProfiles } = schema;

export interface ReleaseTickResult {
  scanned: number;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ userId: string; reason: string }>;
}

export interface ReleaseWorkerOptions {
  env: Record<string, string | undefined>;
  /** Optional dry-run: select-only, no INSERT, no provider call. */
  dryRun?: boolean;
  /** Optional cap to bound a single tick's work. */
  maxPerTick?: number;
}

export class PayoutReleaseWorker {
  async tick(opts: ReleaseWorkerOptions): Promise<ReleaseTickResult> {
    const db = getDb();
    const limit = opts.maxPerTick ?? 500;

    const eligible = await db
      .select({
        userId: payoutProfiles.userId,
        provider: payoutProfiles.payoutProvider,
        providerAccountId: payoutProfiles.payoutAccountId,
        currency: payoutProfiles.payoutCurrency,
        minThreshold: payoutProfiles.minPayoutThresholdCents,
      })
      .from(payoutProfiles)
      .where(
        and(
          eq(payoutProfiles.payoutsEnabled, true),
          sql`${payoutProfiles.payoutProvider} IS NOT NULL`,
          sql`${payoutProfiles.payoutAccountId} IS NOT NULL`,
        ),
      )
      .limit(limit);

    const result: ReleaseTickResult = {
      scanned: eligible.length,
      queued: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    // READ batching only: one 2-query pre-filter for every eligible user
    // (was getBalance = 5 queries per user, and most users sit below
    // threshold). Users that clear the pre-filter still get a fresh,
    // authoritative getBalance() right before any money moves, so the
    // payout amount + ledger debit are never computed from a stale read.
    // All writes (payout row, ledger debit/reversal, status transitions)
    // stay per user inside the per-user try/catch.
    let prefiltered: Map<string, number> | null = null;
    try {
      prefiltered = await new PayoutBalancesRepository(db).availableCentsByUser(
        eligible.map((r) => r.userId),
      );
    } catch (err) {
      console.warn("[release-worker] balance pre-filter failed; falling back to per-user reads", err);
    }

    for (const row of eligible) {
      try {
        if (prefiltered && (prefiltered.get(row.userId) ?? 0) < row.minThreshold) {
          result.skipped += 1;
          continue;
        }
        const balance = await payoutLedgerService.getBalance(row.userId);
        if (balance.availableCents < row.minThreshold) {
          result.skipped += 1;
          continue;
        }

        if (opts.dryRun) {
          result.queued += 1;
          console.info("[release-worker] DRY", {
            userId: row.userId,
            provider: row.provider,
            availableCents: balance.availableCents,
            minThreshold: row.minThreshold,
          });
          continue;
        }

        // Insert in 'queued' first so the ledger debit (next call) is
        // pinned to a real payouts.id even if the provider call later
        // fails — keeps the double-entry tidy.
        const [created] = await db
          .insert(payouts)
          .values({
            userId: row.userId,
            amountCents: balance.availableCents,
            currency: balance.currency,
            provider: row.provider!,
            providerAccountId: row.providerAccountId!,
            status: "queued",
          })
          .returning();
        result.queued += 1;

        await payoutLedgerService.recordPayoutDebit({
          userId: row.userId,
          amountCents: created.amountCents,
          currency: created.currency,
          payoutId: created.id,
        });

        const provider = tryGetPayoutProvider(row.provider as ActivePayoutProvider, opts.env);
        if (!provider) {
          await db
            .update(payouts)
            .set({
              status: "failed",
              failedAt: new Date(),
              failureReason: `provider ${row.provider} not configured`,
              updatedAt: new Date(),
            })
            .where(eq(payouts.id, created.id));
          await payoutLedgerService.recordReversal({
            userId: row.userId,
            amountCents: created.amountCents,
            currency: created.currency,
            payoutId: created.id,
            note: `provider ${row.provider} not configured`,
          });
          result.failed += 1;
          result.errors.push({ userId: row.userId, reason: `provider ${row.provider} not configured` });
          continue;
        }

        // Mark as 'attempting' just before the network call so a
        // concurrent SELECT can't think the row is still freshly queued.
        await db
          .update(payouts)
          .set({ status: "attempting", attemptedAt: new Date(), updatedAt: new Date() })
          .where(eq(payouts.id, created.id));

        try {
          const dispatched = await provider.createPayout({
            payoutId: created.id,
            providerAccountId: created.providerAccountId,
            amountCents: created.amountCents,
            currency: created.currency,
            memo: `hired.video payout ${created.id}`,
          });
          const now = new Date();
          await db
            .update(payouts)
            .set({
              providerPayoutId: dispatched.providerPayoutId,
              providerStatus: dispatched.providerStatus,
              status: dispatched.isSettled ? "settled" : "sent",
              sentAt: now,
              settledAt: dispatched.isSettled ? now : null,
              updatedAt: now,
            })
            .where(eq(payouts.id, created.id));
          result.sent += 1;
          console.info("[release-worker] sent", {
            userId: row.userId,
            payoutId: created.id,
            providerPayoutId: dispatched.providerPayoutId,
            amountCents: created.amountCents,
            isSettled: dispatched.isSettled,
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          await db
            .update(payouts)
            .set({
              status: "failed",
              failedAt: new Date(),
              failureReason: reason,
              updatedAt: new Date(),
            })
            .where(eq(payouts.id, created.id));
          await payoutLedgerService.recordReversal({
            userId: row.userId,
            amountCents: created.amountCents,
            currency: created.currency,
            payoutId: created.id,
            note: `release-worker provider error: ${reason}`,
          });
          result.failed += 1;
          result.errors.push({ userId: row.userId, reason });
          console.warn("[release-worker] failed", { userId: row.userId, payoutId: created.id, reason });
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        result.errors.push({ userId: row.userId, reason });
        console.warn("[release-worker] tick error", { userId: row.userId, reason });
      }
    }

    // New / settled / failed payouts feed the annual tax report.
    if (!opts.dryRun && result.queued > 0) invalidateTaxYearReports();
    console.info("[release-worker] tick complete", result);
    return result;
  }
}

export const payoutReleaseWorker = new PayoutReleaseWorker();
