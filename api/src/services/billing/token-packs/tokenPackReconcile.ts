/**
 * Token-pack reconcile — the paid-but-unconfirmed safety net (gap #2352).
 *
 * A purchase is recorded `pending` before the provider check
 * (confirmTokenPackPurchase). If that check couldn't answer — provider
 * outage, the transaction not visible yet, the request died — the row stays
 * pending and this step, run from the existing 5-minute cron, re-checks a
 * small batch per run through the SAME `checkPendingPurchase` the confirm
 * route uses, so a row settles identically from either path and is credited
 * at most once.
 *
 * Workers Free: each row costs ~2 provider subrequests + 2 queries, so the
 * batch is capped (TOKEN_PACK_RECONCILE_BATCH); the rest wait for the next
 * tick, stalest first.
 */
import type { TokenPackPurchaseRow } from "../../../repositories/tokensRepository.js";
import { checkPendingPurchase, type PendingCheckOutcome, type TokenPackDeps } from "./tokenPackUseCases.js";

/** Rows re-checked per cron run (plan: ≤ 10; 5 keeps the subrequest budget). */
export const TOKEN_PACK_RECONCILE_BATCH = 5;
/** A confirm that is still running owns its row for this long. */
export const TOKEN_PACK_RECONCILE_MIN_AGE_MS = 2 * 60 * 1000;
/** Gap between two checks of the same row. */
export const TOKEN_PACK_RECHECK_GAP_MS = 4 * 60 * 1000;

export interface PendingPurchaseSource {
  listPending(input: { limit: number; createdBefore: Date; checkedBefore: Date }): Promise<TokenPackPurchaseRow[]>;
}

export type ReconcileSummary = Record<PendingCheckOutcome, number> & { scanned: number };

export async function reconcilePendingTokenPacks(
  deps: TokenPackDeps & { pending: PendingPurchaseSource },
  opts: { now?: Date; limit?: number } = {},
): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = {
    scanned: 0,
    credited: 0,
    already_credited: 0,
    pending: 0,
    rejected: 0,
    expired: 0,
  };
  const payments = deps.payments;
  // No provider configured: nothing can be verified; leave rows pending.
  if (!payments || !payments.supportsOneOffPurchases) return summary;
  const now = opts.now ?? new Date();
  const rows = await deps.pending.listPending({
    limit: Math.min(opts.limit ?? TOKEN_PACK_RECONCILE_BATCH, TOKEN_PACK_RECONCILE_BATCH),
    createdBefore: new Date(now.getTime() - TOKEN_PACK_RECONCILE_MIN_AGE_MS),
    checkedBefore: new Date(now.getTime() - TOKEN_PACK_RECHECK_GAP_MS),
  });
  for (const row of rows) {
    summary.scanned += 1;
    try {
      summary[await checkPendingPurchase({ ...deps, payments }, row)] += 1;
    } catch (err) {
      // One bad row must not stop the batch; it is retried next tick.
      console.error("[token-packs] reconcile failed for a purchase", { purchaseId: row.id, err: String(err) });
    }
  }
  return summary;
}
