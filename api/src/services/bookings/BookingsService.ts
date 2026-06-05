/**
 * BookingsService — the single domain seam every API route + frontend
 * consumer calls. Owns:
 *
 *   - Host identity resolution (handle → host or null) with owner-only
 *     visibility built into the return shape (PublicHostDTO vs
 *     ReservationDetailDTO).
 *   - Offering CRUD with slug uniqueness.
 *   - Availability rule + override CRUD.
 *   - Slot-grid resolution, CACHED via getOrSetCached with a
 *     version-token key so writes invalidate without scanning the
 *     unbounded keyspace.
 *   - Reservation lifecycle: pending_payment → confirmed → completed,
 *     cancellation by host or booker, reschedule.
 *   - Magic-link token mint + verify.
 *   - Comment threads with author-kind gating.
 *
 * Errors use BookingsServiceError so the route layer can translate
 * to the right HTTP status without leaking implementation detail.
 */

import {
  BOOKING_DURATIONS_MINUTES,
  BookingDurationMinutes,
  RESERVATION_STATUSES,
  ReservationStatus,
  AvailabilityOverrideInput,
  AvailabilityRuleInput,
  AddCommentInput,
  BookingAuthorKind,
  BookingCommentDTO,
  BookingOfferingDTO,
  BookingOfferingInput,
  CancelReservationInput,
  CreateReservationInput,
  MAX_AVAILABILITY_WINDOW_DAYS,
  PublicHostProfileDTO,
  PublicSlotDTO,
  RescheduleReservationInput,
  ReservationDetailDTO,
  ReservationSummaryDTO,
  computePlatformFeeCents,
  encodeMagicLinkToken,
  resolveAvailableSlots,
} from "../../../../shared/bookings.js";
import type {
  BookingHostIdentity,
  BookingOfferingRow,
  BookingReservationRow,
  IBookingsRepository,
} from "../../repositories/bookingsRepository.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";

export interface BookingsServiceDeps {
  repo: IBookingsRepository;
  now: () => Date;
  randomBytes: (n: number) => Uint8Array;
}

export type BookingsErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "NOT_ENROLLED"
  | "SLOT_UNAVAILABLE"
  | "INVALID_STATE";

export class BookingsServiceError extends Error {
  constructor(public readonly code: BookingsErrorCode, message: string) {
    super(message);
    this.name = "BookingsServiceError";
  }
}

export class BookingsService {
  constructor(private readonly deps: BookingsServiceDeps) {}

  // ── Host identity ──────────────────────────────────────────────────────
  async getPublicHostByHandle(handle: string): Promise<PublicHostProfileDTO> {
    const host = await this.deps.repo.findHostByHandle(handle);
    if (!host || !host.bookingsActive) {
      throw new BookingsServiceError("NOT_FOUND", "Host not found");
    }
    const offerings = await this.deps.repo.listOfferingsForHost(host.userId);
    return {
      handle: host.handle,
      displayName: host.displayName,
      bio: host.bio,
      timezone: host.timezone,
      avatarUrl: host.avatarUrl,
      offerings: offerings.map(offeringToDto),
    };
  }

  async requireOwnHost(userId: string): Promise<BookingHostIdentity> {
    const host = await this.deps.repo.findHostByUserId(userId);
    if (!host) throw new BookingsServiceError("NOT_FOUND", "User has no profile");
    if (!host.bookingsActive) {
      throw new BookingsServiceError(
        "NOT_ENROLLED",
        "Bookings program is not active for this user",
      );
    }
    return host;
  }

  // ── Offerings ──────────────────────────────────────────────────────────
  async listOwnedOfferings(userId: string): Promise<BookingOfferingDTO[]> {
    const host = await this.requireOwnHost(userId);
    const rows = await this.deps.repo.listOfferingsForHost(host.userId, true);
    return rows.map(offeringToDto);
  }

  async upsertOffering(
    userId: string,
    input: BookingOfferingInput,
    existingId?: string,
  ): Promise<BookingOfferingDTO> {
    const host = await this.requireOwnHost(userId);
    if (!BOOKING_DURATIONS_MINUTES.includes(input.durationMinutes as BookingDurationMinutes)) {
      throw new BookingsServiceError(
        "VALIDATION_ERROR",
        `durationMinutes must be one of ${BOOKING_DURATIONS_MINUTES.join(", ")}`,
      );
    }
    // Slug uniqueness scoped to host.
    const slugOwner = await this.deps.repo.findOfferingBySlug(host.userId, input.slug);
    if (slugOwner && slugOwner.id !== existingId) {
      throw new BookingsServiceError("CONFLICT", "Slug already in use");
    }
    if (existingId) {
      const cur = await this.deps.repo.findOfferingById(existingId);
      if (!cur || cur.userId !== host.userId) {
        throw new BookingsServiceError("NOT_FOUND", "Offering not found");
      }
      const updated = await this.deps.repo.updateOffering(existingId, {
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
      this.invalidateHostCaches(host);
      return offeringToDto(updated);
    }
    const created = await this.deps.repo.insertOffering({
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
    this.invalidateHostCaches(host);
    return offeringToDto(created);
  }

  async deleteOffering(userId: string, offeringId: string): Promise<void> {
    const host = await this.requireOwnHost(userId);
    const cur = await this.deps.repo.findOfferingById(offeringId);
    if (!cur || cur.userId !== host.userId) {
      throw new BookingsServiceError("NOT_FOUND", "Offering not found");
    }
    // Soft delete by deactivating — preserves historic reservation snapshots.
    await this.deps.repo.updateOffering(offeringId, { isActive: false });
    this.invalidateHostCaches(host);
  }

  // ── Availability rules ─────────────────────────────────────────────────
  async listAvailabilityRules(userId: string) {
    const host = await this.requireOwnHost(userId);
    return this.deps.repo.listAvailabilityRulesForHost(host.userId);
  }

  async addAvailabilityRule(userId: string, input: AvailabilityRuleInput) {
    const host = await this.requireOwnHost(userId);
    const row = await this.deps.repo.insertAvailabilityRule({
      userId: host.userId,
      weekday: input.weekday,
      startTimeLocal: input.startTimeLocal,
      endTimeLocal: input.endTimeLocal,
      effectiveFromDate: input.effectiveFromDate ?? null,
      effectiveUntilDate: input.effectiveUntilDate ?? null,
    });
    this.invalidateHostCaches(host);
    return row;
  }

  async deleteAvailabilityRule(userId: string, ruleId: string): Promise<void> {
    const host = await this.requireOwnHost(userId);
    const ok = await this.deps.repo.deleteAvailabilityRule(ruleId, host.userId);
    if (!ok) throw new BookingsServiceError("NOT_FOUND", "Rule not found");
    this.invalidateHostCaches(host);
  }

  // ── Availability overrides ─────────────────────────────────────────────
  async addAvailabilityOverride(userId: string, input: AvailabilityOverrideInput) {
    const host = await this.requireOwnHost(userId);
    const row = await this.deps.repo.insertAvailabilityOverride({
      userId: host.userId,
      dateLocal: input.dateLocal,
      startTimeLocal: input.startTimeLocal,
      endTimeLocal: input.endTimeLocal,
      kind: input.kind,
      reason: input.reason ?? null,
    });
    this.invalidateHostCaches(host);
    return row;
  }

  async deleteAvailabilityOverride(userId: string, overrideId: string): Promise<void> {
    const host = await this.requireOwnHost(userId);
    const ok = await this.deps.repo.deleteAvailabilityOverride(overrideId, host.userId);
    if (!ok) throw new BookingsServiceError("NOT_FOUND", "Override not found");
    this.invalidateHostCaches(host);
  }

  // ── Public slot grid (cached) ──────────────────────────────────────────
  /**
   * Resolves the bookable slot grid for `handle` × `offeringSlug` over
   * `[fromUtc, toUtc)`. Cached for `ttlSeconds` per the standing
   * caching rule — keyed by host version-token so writes invalidate
   * cheap (no scan of the unbounded date keyspace).
   */
  async listPublicSlots(args: {
    handle: string;
    offeringSlug: string;
    fromUtc: string;
    toUtc: string;
  }): Promise<{
    host: PublicHostProfileDTO;
    offering: BookingOfferingDTO;
    slots: PublicSlotDTO[];
  }> {
    const host = await this.deps.repo.findHostByHandle(args.handle);
    if (!host || !host.bookingsActive) {
      throw new BookingsServiceError("NOT_FOUND", "Host not found");
    }
    const offeringRow = await this.deps.repo.findOfferingBySlug(host.userId, args.offeringSlug);
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

    const cacheVersion = await this.getHostCacheVersion(host.userId);
    const cacheKey = `bookings:slots:v1:${host.userId}:${offeringRow.id}:${args.fromUtc}:${args.toUtc}:${cacheVersion}`;
    const slots = await getOrSetCached<PublicSlotDTO[]>({
      key: cacheKey,
      ttlSeconds: 60, // short — write invalidates the version token immediately
      loader: () => this.computeSlotsUncached(host, offeringRow, args.fromUtc, args.toUtc),
    });

    return {
      host: {
        handle: host.handle,
        displayName: host.displayName,
        bio: host.bio,
        timezone: host.timezone,
        avatarUrl: host.avatarUrl,
        offerings: (await this.deps.repo.listOfferingsForHost(host.userId)).map(offeringToDto),
      },
      offering: offeringToDto(offeringRow),
      slots,
    };
  }

  private async computeSlotsUncached(
    host: BookingHostIdentity,
    offering: BookingOfferingRow,
    fromUtc: string,
    toUtc: string,
  ): Promise<PublicSlotDTO[]> {
    const fromDate = new Date(fromUtc);
    const toDate = new Date(toUtc);
    const rules = await this.deps.repo.listAvailabilityRulesForHost(host.userId);
    // Overrides bounded to the local-date window (with a 1-day pad on
    // each side to cover timezone offsets).
    const padFrom = dateOnlyAddDays(localDate(fromDate, host.timezone), -1);
    const padTo = dateOnlyAddDays(localDate(toDate, host.timezone), 1);
    const overrides = await this.deps.repo.listAvailabilityOverridesForHost(
      host.userId,
      padFrom,
      padTo,
    );
    const busy = await this.deps.repo.listBusyWindowsForHost(host.userId, fromDate, toDate);

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

  // ── Reservations ───────────────────────────────────────────────────────
  async createReservation(input: CreateReservationInput): Promise<{
    reservation: ReservationDetailDTO;
    magicLinkToken: string;
  }> {
    const host = await this.deps.repo.findHostByHandle(input.hostHandle);
    if (!host || !host.bookingsActive) {
      throw new BookingsServiceError("NOT_FOUND", "Host not found");
    }
    const offering = await this.deps.repo.findOfferingBySlug(host.userId, input.offeringSlug);
    if (!offering || !offering.isActive) {
      throw new BookingsServiceError("NOT_FOUND", "Offering not found");
    }

    const startMs = Date.parse(input.slotStartUtc);
    if (!Number.isFinite(startMs)) {
      throw new BookingsServiceError("VALIDATION_ERROR", "Invalid slotStartUtc");
    }
    if (startMs < this.deps.now().getTime()) {
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
    const busy = await this.deps.repo.listBusyWindowsForHost(host.userId, verifyFrom, verifyTo);
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
    const rules = await this.deps.repo.listAvailabilityRulesForHost(host.userId);
    const padFrom = dateOnlyAddDays(localDate(verifyFrom, host.timezone), -1);
    const padTo = dateOnlyAddDays(localDate(verifyTo, host.timezone), 1);
    const overrides = await this.deps.repo.listAvailabilityOverridesForHost(
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

    const token = encodeMagicLinkToken(this.deps.randomBytes(32));
    const amountCents = offering.priceCents;
    const platformFeeCents = computePlatformFeeCents(amountCents, host.platformFeeBps);

    const row = await this.deps.repo.insertReservation({
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
      confirmedAt: amountCents > 0 ? null : this.deps.now(),
    });

    this.invalidateHostCaches(host);

    return {
      reservation: reservationToDetailDto(row, host, offering),
      magicLinkToken: token,
    };
  }

  async getReservationByMagicToken(token: string): Promise<ReservationDetailDTO> {
    const row = await this.deps.repo.findReservationByMagicToken(token);
    if (!row) throw new BookingsServiceError("NOT_FOUND", "Reservation not found");
    const host = await this.deps.repo.findHostByUserId(row.userId);
    if (!host) throw new BookingsServiceError("NOT_FOUND", "Host not found");
    const offering = row.offeringId
      ? await this.deps.repo.findOfferingById(row.offeringId)
      : null;
    return reservationToDetailDto(row, host, offering);
  }

  async getReservationForHost(
    hostUserId: string,
    reservationId: string,
  ): Promise<ReservationDetailDTO> {
    const host = await this.requireOwnHost(hostUserId);
    const row = await this.deps.repo.findReservationById(reservationId);
    if (!row || row.userId !== host.userId) {
      throw new BookingsServiceError("NOT_FOUND", "Reservation not found");
    }
    const offering = row.offeringId
      ? await this.deps.repo.findOfferingById(row.offeringId)
      : null;
    return reservationToDetailDto(row, host, offering);
  }

  async listReservationsForHost(hostUserId: string): Promise<ReservationSummaryDTO[]> {
    const host = await this.requireOwnHost(hostUserId);
    const rows = await this.deps.repo.listReservationsForHost(host.userId);
    return rows.map(reservationToSummaryDto);
  }

  async cancelReservation(args: {
    actor: "host" | "booker";
    actorUserId?: string;
    magicLinkToken?: string;
    reservationId?: string;
    input: CancelReservationInput;
  }): Promise<ReservationDetailDTO> {
    const { row, host } = await this.resolveActorReservation(args);
    if (!terminalStatusAllowsCancel(row.status as ReservationStatus)) {
      throw new BookingsServiceError(
        "INVALID_STATE",
        `Reservation in status ${row.status} cannot be cancelled`,
      );
    }
    const updated = await this.deps.repo.updateReservation(row.id, {
      status: args.actor === "host" ? "cancelled_by_host" : "cancelled_by_booker",
      cancelledAt: this.deps.now(),
      cancellationReason: args.input.reason ?? null,
    });
    if (!updated) throw new BookingsServiceError("NOT_FOUND", "Reservation vanished");
    this.invalidateHostCaches(host);
    const offering = row.offeringId
      ? await this.deps.repo.findOfferingById(row.offeringId)
      : null;
    return reservationToDetailDto(updated, host, offering);
  }

  async rescheduleReservation(args: {
    actor: "host" | "booker";
    actorUserId?: string;
    magicLinkToken?: string;
    reservationId?: string;
    input: RescheduleReservationInput;
  }): Promise<ReservationDetailDTO> {
    const { row, host } = await this.resolveActorReservation(args);
    if (!terminalStatusAllowsCancel(row.status as ReservationStatus)) {
      throw new BookingsServiceError(
        "INVALID_STATE",
        `Reservation in status ${row.status} cannot be rescheduled`,
      );
    }
    const offering = row.offeringId
      ? await this.deps.repo.findOfferingById(row.offeringId)
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
    if (startMs < this.deps.now().getTime()) {
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
    const busy = await this.deps.repo.listBusyWindowsForHost(host.userId, verifyFrom, verifyTo);
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

    const updated = await this.deps.repo.updateReservation(row.id, {
      slotStartUtc: new Date(startMs),
      slotEndUtc: new Date(endMs),
    });
    if (!updated) throw new BookingsServiceError("NOT_FOUND", "Reservation vanished");
    this.invalidateHostCaches(host);
    return reservationToDetailDto(updated, host, offering);
  }

  // ── Comments ───────────────────────────────────────────────────────────
  async listComments(args: {
    actor: BookingAuthorKind;
    actorUserId?: string;
    magicLinkToken?: string;
    reservationId?: string;
  }): Promise<BookingCommentDTO[]> {
    const { row, host } = await this.resolveActorReservation(args);
    const rows = await this.deps.repo.listCommentsForReservation(row.id);
    return rows.map((c) => ({
      id: c.id,
      reservationId: c.reservationId,
      authorKind: c.authorKind as BookingAuthorKind,
      authorDisplayName: c.authorKind === "host" ? host.displayName : row.bookerName,
      bodyMd: c.bodyMd,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async addComment(args: {
    actor: BookingAuthorKind;
    actorUserId?: string;
    magicLinkToken?: string;
    reservationId?: string;
    input: AddCommentInput;
  }): Promise<BookingCommentDTO> {
    const { row, host } = await this.resolveActorReservation(args);
    const c = await this.deps.repo.insertComment({
      reservationId: row.id,
      authorKind: args.actor,
      authorUserId: args.actor === "host" ? host.userId : null,
      bodyMd: args.input.bodyMd.trim(),
    });
    return {
      id: c.id,
      reservationId: c.reservationId,
      authorKind: c.authorKind as BookingAuthorKind,
      authorDisplayName: c.authorKind === "host" ? host.displayName : row.bookerName,
      bodyMd: c.bodyMd,
      createdAt: c.createdAt.toISOString(),
    };
  }

  // ── Stripe payment hook (called from webhook) ──────────────────────────
  /**
   * Mark a reservation confirmed once a PaymentIntent succeeds.
   * Idempotent: re-calling on a confirmed reservation is a no-op.
   */
  async markPaid(args: {
    reservationId: string;
    paymentIntentId: string;
  }): Promise<ReservationDetailDTO | null> {
    const row = await this.deps.repo.findReservationById(args.reservationId);
    if (!row) return null;
    if (row.status === "confirmed" || row.status === "completed") {
      const host = await this.deps.repo.findHostByUserId(row.userId);
      const offering = row.offeringId
        ? await this.deps.repo.findOfferingById(row.offeringId)
        : null;
      return host ? reservationToDetailDto(row, host, offering) : null;
    }
    const updated = await this.deps.repo.updateReservation(args.reservationId, {
      status: "confirmed",
      confirmedAt: this.deps.now(),
      paymentIntentId: args.paymentIntentId,
    });
    if (!updated) return null;
    const host = await this.deps.repo.findHostByUserId(updated.userId);
    if (!host) return null;
    // Mint the payout-ledger entry; reconciliation happens via cron.
    await this.deps.repo.insertPayoutRecord({
      reservationId: updated.id,
      userId: host.userId,
      netAmountCents: Math.max(0, updated.amountCents - updated.platformFeeCents),
      currency: updated.currency,
      payoutStatus: "pending",
      externalTransferId: null,
    });
    this.invalidateHostCaches(host);
    const offering = updated.offeringId
      ? await this.deps.repo.findOfferingById(updated.offeringId)
      : null;
    return reservationToDetailDto(updated, host, offering);
  }

  // ── Internals ──────────────────────────────────────────────────────────

  /** Single seam for host-side cache invalidation. Bumps the host's
   *  version token so every cached slot-grid key for that host becomes
   *  unreachable on the next read. Cheap (one KV delete). */
  private invalidateHostCaches(host: BookingHostIdentity): void {
    invalidateCachedKey(this.versionKey(host.userId));
  }

  private versionKey(userId: string): string {
    return `bookings:version:${userId}`;
  }

  private async getHostCacheVersion(userId: string): Promise<string> {
    // Token is a UUID-like string that rotates every time the host
    // writes; we use getOrSetCached to give it a 10-minute TTL so the
    // L2 KV layer hands the same token out across isolates between
    // writes. Invalidation drops the token; next read computes a new one.
    return await getOrSetCached<string>({
      key: this.versionKey(userId),
      ttlSeconds: 600,
      loader: async () => `${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    });
  }

  private async resolveActorReservation(args: {
    actor: BookingAuthorKind | "host" | "booker";
    actorUserId?: string;
    magicLinkToken?: string;
    reservationId?: string;
  }): Promise<{ row: BookingReservationRow; host: BookingHostIdentity }> {
    let row: BookingReservationRow | null = null;
    if (args.magicLinkToken) {
      row = await this.deps.repo.findReservationByMagicToken(args.magicLinkToken);
    } else if (args.reservationId) {
      row = await this.deps.repo.findReservationById(args.reservationId);
    }
    if (!row) throw new BookingsServiceError("NOT_FOUND", "Reservation not found");
    const host = await this.deps.repo.findHostByUserId(row.userId);
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
}

// ---------------------------------------------------------------------------
// DTO projection helpers — owner-only visibility is encoded HERE so consumers
// never see a wide shape they shouldn't.
// ---------------------------------------------------------------------------

function offeringToDto(row: BookingOfferingRow): BookingOfferingDTO {
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

function reservationToDetailDto(
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

function reservationToSummaryDto(row: BookingReservationRow): ReservationSummaryDTO {
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

function terminalStatusAllowsCancel(s: ReservationStatus): boolean {
  return s === "pending_payment" || s === "confirmed";
}

function localDate(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function dateOnlyAddDays(yyyymmdd: string, days: number): string {
  const [y, m, d] = yyyymmdd.split("-").map((x) => Number.parseInt(x, 10));
  const t = Date.UTC(y, (m ?? 1) - 1, d ?? 1) + days * 86_400_000;
  const out = new Date(t);
  const yy = out.getUTCFullYear().toString().padStart(4, "0");
  const mm = (out.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = out.getUTCDate().toString().padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Re-export for tests.
export const __test = { offeringToDto, reservationToDetailDto, reservationToSummaryDto };
// Tagging the unused RESERVATION_STATUSES + AddCommentInput + AvailabilityOverrideInput
// + AvailabilityRuleInput + BookingOfferingInput + Cancel/Reschedule re-export so
// downstream tree-shakers keep them; the type aliases above are the actual surface.
export type { ReservationStatus, BookingAuthorKind };
void RESERVATION_STATUSES;
