/**
 * Shared payout webhook applier — called from routes/payouts.ts (Tremendous)
 * AND routes/payment.ts when a Helcim webhook turns out to be a payout event.
 * One function keeps the payout state machine in ONE place regardless of how
 * the event arrived.
 */
import { getDb } from "../../db/index.js";
import { InvoicesRepository } from "../../repositories/invoicesRepository.js";
import { findPayoutByProviderPayoutId, updatePayout, type PayoutPatch } from "../../repositories/payoutsRepository.js";
import { payoutLedgerService } from "./PayoutLedgerService.js";
import { invalidateTaxYearReports } from "./TaxReportingService.js";
import type { NormalizedPayoutWebhookPayload } from "./types.js";
import type { ActivePayoutProvider } from "../../../../shared/payout-profile.js";

export async function applyPayoutWebhook(
  payload: NormalizedPayoutWebhookPayload,
  providerKey: ActivePayoutProvider,
): Promise<void> {
  const events = new InvoicesRepository(getDb());

  // Idempotency — billing_events stores both inbound and outbound provider
  // events keyed by stripeEventId (column name is legacy / provider-agnostic).
  if (await events.hasBillingEvent(payload.eventId)) return;

  await events.insertBillingEvent({
    stripeEventId: payload.eventId,
    eventType: payload.eventType,
    payload: payload.raw as Record<string, unknown>,
  });

  // Event arrived but we can't reconcile to a payouts row — record it and
  // move on; admins can audit billing_events directly.
  if (!payload.providerPayoutId) return;

  const row = await findPayoutByProviderPayoutId(providerKey, payload.providerPayoutId);
  if (!row) return;

  const now = new Date();
  const patch: PayoutPatch = { updatedAt: now, providerStatus: payload.providerStatus };
  switch (payload.eventType) {
    case "payout.sent":
      patch.status = "sent";
      patch.sentAt = row.sentAt ?? now;
      break;
    case "payout.settled":
      patch.status = "settled";
      patch.settledAt = row.settledAt ?? now;
      break;
    case "payout.failed":
      patch.status = "failed";
      patch.failedAt = row.failedAt ?? now;
      patch.failureReason = payload.failureReason ?? null;
      await payoutLedgerService.recordReversal({
        userId: row.userId,
        amountCents: row.amountCents,
        currency: row.currency,
        payoutId: row.id,
        note: `payout failed: ${payload.failureReason ?? "unknown"}`,
      });
      break;
    case "payout.reversed":
      patch.status = "reversed";
      patch.reversedAt = row.reversedAt ?? now;
      patch.failureReason = payload.failureReason ?? null;
      await payoutLedgerService.recordReversal({
        userId: row.userId,
        amountCents: row.amountCents,
        currency: row.currency,
        payoutId: row.id,
        note: `payout reversed: ${payload.failureReason ?? "unknown"}`,
      });
      break;
    case "unknown":
    default:
      break;
  }

  await updatePayout(row.id, patch);
  // Settlement / reversal can move a payout in or out of a (possibly closed)
  // tax year — orphan the cached annual reports.
  invalidateTaxYearReports();
  await events.markBillingEventProcessed(payload.eventId);
}
