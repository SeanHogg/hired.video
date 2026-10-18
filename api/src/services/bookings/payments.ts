/** Bookings Stripe payment hook — confirm reservation + mint payout-ledger entry. */

import type { ReservationDetailDTO } from "../../../../shared/bookings.js";
import type {
  IBookingHostReader,
  IBookingOfferingReader,
  IBookingPayoutLedger,
  IBookingReservationReader,
  IBookingReservationWriter,
} from "../../repositories/bookingsRepository.js";
import { reservationToDetailDto } from "./dto.js";
import { invalidateHostCaches } from "./cache.js";

export interface MarkPaidDeps {
  repo: IBookingHostReader &
    Pick<IBookingOfferingReader, "findOfferingById"> &
    Pick<IBookingReservationReader, "findReservationById"> &
    Pick<IBookingReservationWriter, "updateReservation"> &
    Pick<IBookingPayoutLedger, "insertPayoutRecord">;
  now: () => Date;
}

/**
 * Mark a reservation confirmed once a PaymentIntent succeeds.
 * Idempotent: re-calling on a confirmed reservation is a no-op.
 */
export async function markPaid(
  deps: MarkPaidDeps,
  args: {
    reservationId: string;
    paymentIntentId: string;
  },
): Promise<ReservationDetailDTO | null> {
  const row = await deps.repo.findReservationById(args.reservationId);
  if (!row) return null;
  if (row.status === "confirmed" || row.status === "completed") {
    const host = await deps.repo.findHostByUserId(row.userId);
    const offering = row.offeringId
      ? await deps.repo.findOfferingById(row.offeringId)
      : null;
    return host ? reservationToDetailDto(row, host, offering) : null;
  }
  const updated = await deps.repo.updateReservation(args.reservationId, {
    status: "confirmed",
    confirmedAt: deps.now(),
    paymentIntentId: args.paymentIntentId,
  });
  if (!updated) return null;
  const host = await deps.repo.findHostByUserId(updated.userId);
  if (!host) return null;
  // Mint the payout-ledger entry; reconciliation happens via cron.
  await deps.repo.insertPayoutRecord({
    reservationId: updated.id,
    userId: host.userId,
    netAmountCents: Math.max(0, updated.amountCents - updated.platformFeeCents),
    currency: updated.currency,
    payoutStatus: "pending",
    externalTransferId: null,
  });
  invalidateHostCaches(host);
  const offering = updated.offeringId
    ? await deps.repo.findOfferingById(updated.offeringId)
    : null;
  return reservationToDetailDto(updated, host, offering);
}
