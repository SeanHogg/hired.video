/** Bookings public slot grid — resolved from rules/overrides/busy windows, cached per host version token. */

import {
  MAX_AVAILABILITY_WINDOW_DAYS,
  resolveAvailableSlots,
  type BookingOfferingDTO,
  type PublicHostProfileDTO,
  type PublicSlotDTO,
} from "../../../../shared/bookings.js";
import type {
  BookingHostIdentity,
  BookingOfferingRow,
  IBookingAvailabilityReader,
  IBookingHostReader,
  IBookingOfferingReader,
  IBookingReservationReader,
} from "../../repositories/bookingsRepository.js";
import { getOrSetCached } from "../../utils/edge-cache.js";
import { BookingsServiceError } from "./errors.js";
import { offeringToDto } from "./dto.js";
import { getHostCacheVersion } from "./cache.js";
import { dateOnlyAddDays, localDate } from "./local-dates.js";

export interface SlotsDeps {
  repo: IBookingHostReader &
    IBookingOfferingReader &
    IBookingAvailabilityReader &
    Pick<IBookingReservationReader, "listBusyWindowsForHost">;
}

/**
 * Resolves the bookable slot grid for `handle` × `offeringSlug` over
 * `[fromUtc, toUtc)`. Cached for `ttlSeconds` per the standing
 * caching rule — keyed by host version-token so writes invalidate
 * cheap (no scan of the unbounded date keyspace).
 */
export async function listPublicSlots(
  deps: SlotsDeps,
  args: {
    handle: string;
    offeringSlug: string;
    fromUtc: string;
    toUtc: string;
  },
): Promise<{
  host: PublicHostProfileDTO;
  offering: BookingOfferingDTO;
  slots: PublicSlotDTO[];
}> {
  const host = await deps.repo.findHostByHandle(args.handle);
  if (!host || !host.bookingsActive) {
    throw new BookingsServiceError("NOT_FOUND", "Host not found");
  }
  const offeringRow = await deps.repo.findOfferingBySlug(host.userId, args.offeringSlug);
  if (!offeringRow || !offeringRow.isActive) {
    throw new BookingsServiceError("NOT_FOUND", "Offering not found");
  }
  const fromMs = Date.parse(args.fromUtc);
  const toMs = Date.parse(args.toUtc);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    throw new BookingsServiceError("VALIDATION_ERROR", "Invalid date range");
  }
  if (toMs - fromMs > MAX_AVAILABILITY_WINDOW_DAYS * 86_400_000) {
    throw new BookingsServiceError(
      "VALIDATION_ERROR",
      `Window exceeds ${MAX_AVAILABILITY_WINDOW_DAYS} days`,
    );
  }

  const cacheVersion = await getHostCacheVersion(host.userId);
  const cacheKey = `bookings:slots:v1:${host.userId}:${offeringRow.id}:${args.fromUtc}:${args.toUtc}:${cacheVersion}`;
  const slots = await getOrSetCached<PublicSlotDTO[]>({
    key: cacheKey,
    ttlSeconds: 60, // short — write invalidates the version token immediately
    loader: () => computeSlotsUncached(deps, host, offeringRow, args.fromUtc, args.toUtc),
  });

  return {
    host: {
      handle: host.handle,
      displayName: host.displayName,
      bio: host.bio,
      timezone: host.timezone,
      avatarUrl: host.avatarUrl,
      offerings: (await deps.repo.listOfferingsForHost(host.userId)).map(offeringToDto),
    },
    offering: offeringToDto(offeringRow),
    slots,
  };
}

async function computeSlotsUncached(
  deps: SlotsDeps,
  host: BookingHostIdentity,
  offering: BookingOfferingRow,
  fromUtc: string,
  toUtc: string,
): Promise<PublicSlotDTO[]> {
  const fromDate = new Date(fromUtc);
  const toDate = new Date(toUtc);
  const rules = await deps.repo.listAvailabilityRulesForHost(host.userId);
  // Overrides bounded to the local-date window (with a 1-day pad on
  // each side to cover timezone offsets).
  const padFrom = dateOnlyAddDays(localDate(fromDate, host.timezone), -1);
  const padTo = dateOnlyAddDays(localDate(toDate, host.timezone), 1);
  const overrides = await deps.repo.listAvailabilityOverridesForHost(
    host.userId,
    padFrom,
    padTo,
  );
  const busy = await deps.repo.listBusyWindowsForHost(host.userId, fromDate, toDate);

  const slotMinutes =
    offering.durationMinutes +
    (offering.bufferBeforeMinutes ?? 0) +
    (offering.bufferAfterMinutes ?? 0);

  const available = resolveAvailableSlots({
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
    busyWindows: busy.map((b) => ({
      startUtc: new Date(b.startUtc).toISOString(),
      endUtc: new Date(b.endUtc).toISOString(),
    })),
    fromUtc,
    toUtc,
    slotMinutes,
  });

  return available.map((s) => ({
    slotStartUtc: s.slotStartUtc,
    slotEndUtc: s.slotEndUtc,
    status: "available" as const,
  }));
}
