/**
 * Bookings DTO projection helpers — owner-only visibility is encoded HERE so
 * consumers never see a wide shape they shouldn't.
 */

import type {
  BookingDurationMinutes,
  BookingOfferingDTO,
  ReservationDetailDTO,
  ReservationStatus,
  ReservationSummaryDTO,
} from "../../../../shared/bookings.js";
import type {
  BookingHostIdentity,
  BookingOfferingRow,
  BookingReservationRow,
} from "../../repositories/bookingsRepository.js";

export function offeringToDto(row: BookingOfferingRow): BookingOfferingDTO {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    durationMinutes: row.durationMinutes as BookingDurationMinutes,
    priceCents: row.priceCents,
    currency: row.currency,
    descriptionMd: row.descriptionMd,
    bufferBeforeMinutes: row.bufferBeforeMinutes,
    bufferAfterMinutes: row.bufferAfterMinutes,
    isActive: row.isActive,
    displayOrder: row.displayOrder,
  };
}

export function reservationToDetailDto(
  row: BookingReservationRow,
  host: BookingHostIdentity,
  offering: BookingOfferingRow | null,
): ReservationDetailDTO {
  return {
    id: row.id,
    hostUserId: host.userId,
    hostHandle: host.handle,
    hostDisplayName: host.displayName,
    offeringId: row.offeringId ?? null,
    offeringName: row.offeringNameSnapshot,
    durationMinutes: row.durationMinutes as BookingDurationMinutes,
    slotStartUtc: row.slotStartUtc.toISOString(),
    slotEndUtc: row.slotEndUtc.toISOString(),
    bookerEmail: row.bookerEmail,
    bookerName: row.bookerName,
    bookerPhone: row.bookerPhone ?? null,
    status: row.status as ReservationStatus,
    amountCents: row.amountCents,
    platformFeeCents: row.platformFeeCents,
    currency: row.currency,
    videoConferenceLink: offering?.videoConferenceLink ?? null,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    cancellationReason: row.cancellationReason ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function reservationToSummaryDto(row: BookingReservationRow): ReservationSummaryDTO {
  return {
    id: row.id,
    offeringName: row.offeringNameSnapshot,
    durationMinutes: row.durationMinutes as BookingDurationMinutes,
    slotStartUtc: row.slotStartUtc.toISOString(),
    slotEndUtc: row.slotEndUtc.toISOString(),
    bookerName: row.bookerName,
    bookerEmail: row.bookerEmail,
    status: row.status as ReservationStatus,
    amountCents: row.amountCents,
    currency: row.currency,
  };
}

export function terminalStatusAllowsCancel(s: ReservationStatus): boolean {
  return s === "pending_payment" || s === "confirmed";
}
