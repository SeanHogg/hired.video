/**
 * Platform-admin affiliate operations (gap #1684): set an affiliate's status
 * and move payouts through their lifecycle. `:userId` params are the
 * affiliate's USER id, resolved to their profile here.
 */
import { DomainError } from "../../domains/errors.js";
import {
  creditTotalPaid,
  findPayoutStatus,
  listPayoutsByStatus,
  markPendingConversionsPaid,
  updatePayout,
  updateProfileStatusByUserId,
  type AffiliatePayoutPatch,
} from "../../repositories/affiliatesRepository.js";

export type AffiliateStatus = "active" | "disabled" | "suspended";
export type PayoutStatus = "approved" | "rejected" | "processed";

export async function setAffiliateStatus(userId: string, status: AffiliateStatus) {
  const row = await updateProfileStatusByUserId(userId, status);
  if (!row) throw new DomainError(404, "NOT_FOUND", "Affiliate profile not found");
  return row;
}

export function listPendingPayouts() {
  return listPayoutsByStatus("pending", 200);
}

/** Move a payout through its lifecycle. `processed` also credits the
 *  affiliate's totalPaid and marks their pending conversions paid. */
export async function setPayoutStatus(payoutId: string, status: PayoutStatus) {
  const patch: AffiliatePayoutPatch = { status, updatedAt: new Date() };
  if (status === "processed") patch.processedAt = new Date();
  const payout = await updatePayout(payoutId, patch);
  if (!payout) throw new DomainError(404, "NOT_FOUND", "Payout not found");
  if (status === "processed") {
    await creditTotalPaid(payout.affiliateId, payout.amount);
    // Mark the affiliate's pending conversions as paid so they aren't paid twice.
    await markPendingConversionsPaid(payout.affiliateId);
  }
  return payout;
}

export async function getPayoutStatus(payoutId: string): Promise<{ status: string }> {
  const status = await findPayoutStatus(payoutId);
  if (status === null) throw new DomainError(404, "NOT_FOUND", "Payout not found");
  return { status };
}
