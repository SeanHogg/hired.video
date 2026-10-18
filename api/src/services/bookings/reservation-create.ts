/** Bookings reservation creation — slot re-verification, fee split, magic-link mint. */

import {
  computePlatformFeeCents,
  encodeMagicLinkToken,
  resolveAvailableSlots,
  type CreateReservationInput,
  type ReservationDetailDTO,
} from "../../../../shared/bookings.js";
import type {
  IBookingAvailabilityReader,
  IBookingHostReader,
  IBookingOfferingReader,
  IBookingReservationReader,
  IBookingReservationWriter,
} from "../../repositories/bookingsRepository.js";
import { BookingsServiceError } from "./errors.js";
import { reservationToDetailDto } from "./dto.js";
import { invalidateHostCaches } from "./cache.js";
import { dateOnlyAddDays, localDate } from "./local-dates.js";

export interface CreateReservationDeps {
  repo: IBookingHostReader &
    IBookingOfferingReader &
    IBookingAvailabilityReader &
    Pick<IBookingReservationReader, "listBusyWindowsForHost"> &
    Pick<IBookingReservationWriter, "insertReservation">;
  now: () => Date;
  randomBytes: (n: number) => Uint8Array;
}

export async function createReservation(
  deps: CreateReservationDeps,
  input: CreateReservationInput,
): Promise<{
  reservation: ReservationDetailDTO;
  magicLinkToken: string;
}> {
  const host = await deps.repo.findHostByHandle(input.hostHandle);
  if (!host || !host.bookingsActive) {
    throw new BookingsServiceError("NOT_FOUND", "Host not found");
  }
  const offering = await deps.repo.findOfferingBySlug(host.userId, input.offeringSlug);
  if (!offering || !offering.isActive) {
    throw new BookingsServiceError("NOT_FOUND", "Offering not found");
  }

  const startMs = Date.parse(input.slotStartUtc);
  if (!Number.isFinite(startMs)) {
    throw new BookingsServiceError("VALIDATION_ERROR", "Invalid slotStartUtc");
  }
  if (startMs < deps.now().getTime()) {
    throw new BookingsServiceError("VALIDATION_ERROR", "Slot is in the past");
  }
  const slotMinutes =
    offering.durationMinutes +
    (offering.bufferBeforeMinutes ?? 0) +
    (offering.bufferAfterMinutes ?? 0);
  const endMs = startMs + slotMinutes * 60_000;

  // Verify the slot is currently available — re-resolve against the
  // host's calendar in a 2-day window around the requested start, so
  // a stale public-slot list can't double-book.
  const verifyFrom = new Date(startMs - 86_400_000);
  const verifyTo = new Date(endMs + 86_400_000);
  const busy = await deps.repo.listBusyWindowsForHost(host.userId, verifyFrom, verifyTo);
  for (const b of busy) {
    if (
      new Date(b.endUtc).getTime() > startMs &&
      new Date(b.startUtc).getTime() < endMs
    ) {
      throw new BookingsServiceError("SLOT_UNAVAILABLE", "Slot is no longer available");
    }
  }
  // Re-run the pure resolver against the requested window so add/block
  // overrides + recurring rules are honoured (no hand-rolled checks).
  const rules = await deps.repo.listAvailabilityRulesForHost(host.userId);
  const padFrom = dateOnlyAddDays(localDate(verifyFrom, host.timezone), -1);
  const padTo = dateOnlyAddDays(localDate(verifyTo, host.timezone), 1);
  const overrides = await deps.repo.listAvailabilityOverridesForHost(
    host.userId,
    padFrom,
    padTo,
  );
  const possible = resolveAvailableSlots({
    timezone: host.timezone,
    rules: rules.map((r) => ({
      weekday: r.weekday,
      startTimeLocal: r.startTimeLocal,
      endTimeLocal: r.endTimeLocal,
      effectiveFromDate: r.effectiveFromDate ?? null,
      effectiveUntilDate: r.effectiveUntilDate ?? null,
    })),
    overrides: overrides.map((o) => ({
      dateLocal: o.dateLocal,
      startTimeLocal: o.startTimeLocal,
      endTimeLocal: o.endTimeLocal,
      kind: o.kind as "add" | "block",
    })),
    busyWindows: [],
    fromUtc: verifyFrom.toISOString(),
    toUtc: verifyTo.toISOString(),
    slotMinutes,
  });
  const startIso = new Date(startMs).toISOString();
  if (!possible.some((s) => s.slotStartUtc === startIso)) {
    throw new BookingsServiceError(
      "SLOT_UNAVAILABLE",
      "Slot is not within the host's availability",
    );
  }

  const token = encodeMagicLinkToken(deps.randomBytes(32));
  const amountCents = offering.priceCents;
  const platformFeeCents = computePlatformFeeCents(amountCents, host.platformFeeBps);

  const row = await deps.repo.insertReservation({
    userId: host.userId,
    offeringId: offering.id,
    offeringNameSnapshot: offering.name,
    durationMinutes: offering.durationMinutes,
    slotStartUtc: new Date(startMs),
    slotEndUtc: new Date(endMs),
    bookerEmail: input.bookerEmail.trim().toLowerCase(),
    bookerName: input.bookerName.trim(),
    bookerPhone: input.bookerPhone?.trim() || null,
    bookerUserId: null,
    // Free sessions confirm immediately; paid sessions wait for the
    // PaymentIntent to succeed (Stripe webhook flips status to
    // 'confirmed'). The pending_payment column captures the gate.
    status: amountCents > 0 ? "pending_payment" : "confirmed",
    magicLinkToken: token,
    paymentIntentId: null,
    amountCents,
    platformFeeCents,
    currency: offering.currency,
    confirmedAt: amountCents > 0 ? null : deps.now(),
  });

  invalidateHostCaches(host);

  return {
    reservation: reservationToDetailDto(row, host, offering),
    magicLinkToken: token,
  };
}
