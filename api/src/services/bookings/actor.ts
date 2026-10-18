/** Bookings reservation actor resolution — host (by user id) or booker (magic link). */

import type { BookingAuthorKind } from "../../../../shared/bookings.js";
import type {
  BookingHostIdentity,
  BookingReservationRow,
  IBookingHostReader,
  IBookingReservationReader,
} from "../../repositories/bookingsRepository.js";
import { BookingsServiceError } from "./errors.js";

export interface ActorReservationDeps {
  repo: IBookingHostReader &
    Pick<IBookingReservationReader, "findReservationById" | "findReservationByMagicToken">;
}

export async function resolveActorReservation(
  deps: ActorReservationDeps,
  args: {
    actor: BookingAuthorKind | "host" | "booker";
    actorUserId?: string;
    magicLinkToken?: string;
    reservationId?: string;
  },
): Promise<{ row: BookingReservationRow; host: BookingHostIdentity }> {
  let row: BookingReservationRow | null = null;
  if (args.magicLinkToken) {
    row = await deps.repo.findReservationByMagicToken(args.magicLinkToken);
  } else if (args.reservationId) {
    row = await deps.repo.findReservationById(args.reservationId);
  }
  if (!row) throw new BookingsServiceError("NOT_FOUND", "Reservation not found");
  const host = await deps.repo.findHostByUserId(row.userId);
  if (!host) throw new BookingsServiceError("NOT_FOUND", "Host not found");
  if (args.actor === "host") {
    if (!args.actorUserId || args.actorUserId !== host.userId) {
      throw new BookingsServiceError("FORBIDDEN", "Not the reservation host");
    }
  } else {
    // booker actor must have arrived via magic-link token.
    if (!args.magicLinkToken) {
      throw new BookingsServiceError("FORBIDDEN", "Magic-link required for booker actions");
    }
  }
  return { row, host };
}
