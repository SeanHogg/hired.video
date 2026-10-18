/** Bookings host identity — public profile by handle + owner enrollment gate. */

import type { PublicHostProfileDTO } from "../../../../shared/bookings.js";
import type {
  BookingHostIdentity,
  IBookingHostReader,
  IBookingOfferingReader,
} from "../../repositories/bookingsRepository.js";
import { BookingsServiceError } from "./errors.js";
import { offeringToDto } from "./dto.js";

export interface HostReaderDeps {
  repo: IBookingHostReader;
}

export async function getPublicHostByHandle(
  deps: { repo: IBookingHostReader & IBookingOfferingReader },
  handle: string,
): Promise<PublicHostProfileDTO> {
  const host = await deps.repo.findHostByHandle(handle);
  if (!host || !host.bookingsActive) {
    throw new BookingsServiceError("NOT_FOUND", "Host not found");
  }
  const offerings = await deps.repo.listOfferingsForHost(host.userId);
  return {
    handle: host.handle,
    displayName: host.displayName,
    bio: host.bio,
    timezone: host.timezone,
    avatarUrl: host.avatarUrl,
    offerings: offerings.map(offeringToDto),
  };
}

export async function requireOwnHost(
  deps: HostReaderDeps,
  userId: string,
): Promise<BookingHostIdentity> {
  const host = await deps.repo.findHostByUserId(userId);
  if (!host) throw new BookingsServiceError("NOT_FOUND", "User has no profile");
  if (!host.bookingsActive) {
    throw new BookingsServiceError(
      "NOT_ENROLLED",
      "Bookings program is not active for this user",
    );
  }
  return host;
}
