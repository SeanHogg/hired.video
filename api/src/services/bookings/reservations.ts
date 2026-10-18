/** Bookings reservation reads + lifecycle transitions (cancel, reschedule). */

import type {
  CancelReservationInput,
  RescheduleReservationInput,
  ReservationDetailDTO,
  ReservationStatus,
  ReservationSummaryDTO,
} from "../../../../shared/bookings.js";
import type {
  IBookingHostReader,
  IBookingOfferingReader,
  IBookingReservationReader,
  IBookingReservationWriter,
} from "../../repositories/bookingsRepository.js";
import { BookingsServiceError } from "./errors.js";
import {
  reservationToDetailDto,
  reservationToSummaryDto,
  terminalStatusAllowsCancel,
} from "./dto.js";
import { invalidateHostCaches } from "./cache.js";
import { requireOwnHost } from "./host.js";
import { resolveActorReservation } from "./actor.js";

export interface ReservationReadDeps {
  repo: IBookingHostReader &
    Pick<IBookingOfferingReader, "findOfferingById"> &
    IBookingReservationReader;
}

export interface ReservationLifecycleDeps {
  repo: ReservationReadDeps["repo"] & Pick<IBookingReservationWriter, "updateReservation">;
  now: () => Date;
}

export async function getReservationByMagicToken(
  deps: ReservationReadDeps,
  token: string,
): Promise<ReservationDetailDTO> {
  const row = await deps.repo.findReservationByMagicToken(token);
  if (!row) throw new BookingsServiceError("NOT_FOUND", "Reservation not found");
  const host = await deps.repo.findHostByUserId(row.userId);
  if (!host) throw new BookingsServiceError("NOT_FOUND", "Host not found");
  const offering = row.offeringId
    ? await deps.repo.findOfferingById(row.offeringId)
    : null;
  return reservationToDetailDto(row, host, offering);
}

export async function getReservationForHost(
  deps: ReservationReadDeps,
  hostUserId: string,
  reservationId: string,
): Promise<ReservationDetailDTO> {
  const host = await requireOwnHost(deps, hostUserId);
  const row = await deps.repo.findReservationById(reservationId);
  if (!row || row.userId !== host.userId) {
    throw new BookingsServiceError("NOT_FOUND", "Reservation not found");
  }
  const offering = row.offeringId
    ? await deps.repo.findOfferingById(row.offeringId)
    : null;
  return reservationToDetailDto(row, host, offering);
}

export async function listReservationsForHost(
  deps: { repo: IBookingHostReader & Pick<IBookingReservationReader, "listReservationsForHost"> },
  hostUserId: string,
): Promise<ReservationSummaryDTO[]> {
  const host = await requireOwnHost(deps, hostUserId);
  const rows = await deps.repo.listReservationsForHost(host.userId);
  return rows.map(reservationToSummaryDto);
}

export async function cancelReservation(
  deps: ReservationLifecycleDeps,
  args: {
    actor: "host" | "booker";
    actorUserId?: string;
    magicLinkToken?: string;
    reservationId?: string;
    input: CancelReservationInput;
  },
): Promise<ReservationDetailDTO> {
  const { row, host } = await resolveActorReservation(deps, args);
  if (!terminalStatusAllowsCancel(row.status as ReservationStatus)) {
    throw new BookingsServiceError(
      "INVALID_STATE",
      `Reservation in status ${row.status} cannot be cancelled`,
    );
  }
  const updated = await deps.repo.updateReservation(row.id, {
    status: args.actor === "host" ? "cancelled_by_host" : "cancelled_by_booker",
    cancelledAt: deps.now(),
    cancellationReason: args.input.reason ?? null,
  });
  if (!updated) throw new BookingsServiceError("NOT_FOUND", "Reservation vanished");
  invalidateHostCaches(host);
  const offering = row.offeringId
    ? await deps.repo.findOfferingById(row.offeringId)
    : null;
  return reservationToDetailDto(updated, host, offering);
}

export async function rescheduleReservation(
  deps: ReservationLifecycleDeps,
  args: {
    actor: "host" | "booker";
    actorUserId?: string;
    magicLinkToken?: string;
    reservationId?: string;
    input: RescheduleReservationInput;
  },
): Promise<ReservationDetailDTO> {
  const { row, host } = await resolveActorReservation(deps, args);
  if (!terminalStatusAllowsCancel(row.status as ReservationStatus)) {
    throw new BookingsServiceError(
      "INVALID_STATE",
      `Reservation in status ${row.status} cannot be rescheduled`,
    );
  }
  const offering = row.offeringId
    ? await deps.repo.findOfferingById(row.offeringId)
    : null;
  if (!offering) {
    throw new BookingsServiceError(
      "INVALID_STATE",
      "Offering no longer exists; cannot reschedule",
    );
  }
  const startMs = Date.parse(args.input.slotStartUtc);
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

  // Conflict check against every OTHER reservation.
  const verifyFrom = new Date(startMs - 86_400_000);
  const verifyTo = new Date(endMs + 86_400_000);
  const busy = await deps.repo.listBusyWindowsForHost(host.userId, verifyFrom, verifyTo);
  for (const b of busy) {
    const bs = new Date(b.startUtc).getTime();
    const be = new Date(b.endUtc).getTime();
    if (bs === new Date(row.slotStartUtc).getTime() && be === new Date(row.slotEndUtc).getTime()) {
      continue;
    }
    if (be > startMs && bs < endMs) {
      throw new BookingsServiceError("SLOT_UNAVAILABLE", "Slot is no longer available");
    }
  }

  const updated = await deps.repo.updateReservation(row.id, {
    slotStartUtc: new Date(startMs),
    slotEndUtc: new Date(endMs),
  });
  if (!updated) throw new BookingsServiceError("NOT_FOUND", "Reservation vanished");
  invalidateHostCaches(host);
  return reservationToDetailDto(updated, host, offering);
}
