/** Bookings offering CRUD (host-owned session catalog, slug unique per host). */

import {
  BOOKING_DURATIONS_MINUTES,
  type BookingDurationMinutes,
  type BookingOfferingDTO,
  type BookingOfferingInput,
} from "../../../../shared/bookings.js";
import type {
  IBookingHostReader,
  IBookingOfferingReader,
  IBookingOfferingWriter,
} from "../../repositories/bookingsRepository.js";
import { BookingsServiceError } from "./errors.js";
import { offeringToDto } from "./dto.js";
import { invalidateHostCaches } from "./cache.js";
import { requireOwnHost } from "./host.js";

export interface OfferingsDeps {
  repo: IBookingHostReader & IBookingOfferingReader & IBookingOfferingWriter;
}

export async function listOwnedOfferings(
  deps: { repo: IBookingHostReader & IBookingOfferingReader },
  userId: string,
): Promise<BookingOfferingDTO[]> {
  const host = await requireOwnHost(deps, userId);
  const rows = await deps.repo.listOfferingsForHost(host.userId, true);
  return rows.map(offeringToDto);
}

export async function upsertOffering(
  deps: OfferingsDeps,
  userId: string,
  input: BookingOfferingInput,
  existingId?: string,
): Promise<BookingOfferingDTO> {
  const host = await requireOwnHost(deps, userId);
  if (!BOOKING_DURATIONS_MINUTES.includes(input.durationMinutes as BookingDurationMinutes)) {
    throw new BookingsServiceError(
      "VALIDATION_ERROR",
      `durationMinutes must be one of ${BOOKING_DURATIONS_MINUTES.join(", ")}`,
    );
  }
  // Slug uniqueness scoped to host.
  const slugOwner = await deps.repo.findOfferingBySlug(host.userId, input.slug);
  if (slugOwner && slugOwner.id !== existingId) {
    throw new BookingsServiceError("CONFLICT", "Slug already in use");
  }
  if (existingId) {
    const cur = await deps.repo.findOfferingById(existingId);
    if (!cur || cur.userId !== host.userId) {
      throw new BookingsServiceError("NOT_FOUND", "Offering not found");
    }
    const updated = await deps.repo.updateOffering(existingId, {
      name: input.name,
      slug: input.slug,
      durationMinutes: input.durationMinutes,
      priceCents: input.priceCents,
      currency: input.currency,
      descriptionMd: input.descriptionMd,
      videoConferenceLink: input.videoConferenceLink ?? null,
      bufferBeforeMinutes: input.bufferBeforeMinutes,
      bufferAfterMinutes: input.bufferAfterMinutes,
      displayOrder: input.displayOrder,
      isActive: input.isActive,
    });
    if (!updated) throw new BookingsServiceError("NOT_FOUND", "Offering vanished");
    invalidateHostCaches(host);
    return offeringToDto(updated);
  }
  const created = await deps.repo.insertOffering({
    userId: host.userId,
    name: input.name,
    slug: input.slug,
    durationMinutes: input.durationMinutes,
    priceCents: input.priceCents,
    currency: input.currency,
    descriptionMd: input.descriptionMd,
    videoConferenceLink: input.videoConferenceLink ?? null,
    bufferBeforeMinutes: input.bufferBeforeMinutes,
    bufferAfterMinutes: input.bufferAfterMinutes,
    displayOrder: input.displayOrder,
    isActive: input.isActive,
  });
  invalidateHostCaches(host);
  return offeringToDto(created);
}

export async function deleteOffering(
  deps: OfferingsDeps,
  userId: string,
  offeringId: string,
): Promise<void> {
  const host = await requireOwnHost(deps, userId);
  const cur = await deps.repo.findOfferingById(offeringId);
  if (!cur || cur.userId !== host.userId) {
    throw new BookingsServiceError("NOT_FOUND", "Offering not found");
  }
  // Soft delete by deactivating — preserves historic reservation snapshots.
  await deps.repo.updateOffering(offeringId, { isActive: false });
  invalidateHostCaches(host);
}
