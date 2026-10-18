/**
 * BookingsService — the single domain seam every API route + frontend
 * consumer calls. Thin facade over cohesive use-case modules:
 *
 *   - host.ts               — host identity resolution (handle → host or
 *                             null) with owner-only visibility built into the
 *                             return shape (PublicHostDTO vs ReservationDetailDTO).
 *   - offerings.ts          — offering CRUD with slug uniqueness.
 *   - availability.ts       — availability rule + override CRUD.
 *   - slots.ts              — slot-grid resolution, CACHED via getOrSetCached
 *                             with a version-token key (cache.ts) so writes
 *                             invalidate without scanning the unbounded keyspace.
 *   - reservation-create.ts — booking + magic-link token mint.
 *   - reservations.ts       — lifecycle: pending_payment → confirmed →
 *                             completed, cancellation by host or booker,
 *                             reschedule.
 *   - comments.ts           — comment threads with author-kind gating.
 *   - payments.ts           — Stripe payment hook.
 *
 * Errors use BookingsServiceError (errors.ts) so the route layer can
 * translate to the right HTTP status without leaking implementation detail.
 */

import {
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
  PublicHostProfileDTO,
  PublicSlotDTO,
  RescheduleReservationInput,
  ReservationDetailDTO,
  ReservationSummaryDTO,
} from "../../../../shared/bookings.js";
import type {
  BookingHostIdentity,
  IBookingsRepository,
} from "../../repositories/bookingsRepository.js";
import { offeringToDto, reservationToDetailDto, reservationToSummaryDto } from "./dto.js";
import * as hostUseCases from "./host.js";
import * as offeringUseCases from "./offerings.js";
import * as availabilityUseCases from "./availability.js";
import * as slotUseCases from "./slots.js";
import { createReservation } from "./reservation-create.js";
import * as reservationUseCases from "./reservations.js";
import * as commentUseCases from "./comments.js";
import { markPaid } from "./payments.js";

export { BookingsServiceError } from "./errors.js";
export type { BookingsErrorCode } from "./errors.js";

export interface BookingsServiceDeps {
  repo: IBookingsRepository;
  now: () => Date;
  randomBytes: (n: number) => Uint8Array;
}

export class BookingsService {
  constructor(private readonly deps: BookingsServiceDeps) {}

  // ── Host identity ──────────────────────────────────────────────────────
  getPublicHostByHandle(handle: string): Promise<PublicHostProfileDTO> {
    return hostUseCases.getPublicHostByHandle(this.deps, handle);
  }

  requireOwnHost(userId: string): Promise<BookingHostIdentity> {
    return hostUseCases.requireOwnHost(this.deps, userId);
  }

  // ── Offerings ──────────────────────────────────────────────────────────
  listOwnedOfferings(userId: string): Promise<BookingOfferingDTO[]> {
    return offeringUseCases.listOwnedOfferings(this.deps, userId);
  }

  upsertOffering(
    userId: string,
    input: BookingOfferingInput,
    existingId?: string,
  ): Promise<BookingOfferingDTO> {
    return offeringUseCases.upsertOffering(this.deps, userId, input, existingId);
  }

  deleteOffering(userId: string, offeringId: string): Promise<void> {
    return offeringUseCases.deleteOffering(this.deps, userId, offeringId);
  }

  // ── Availability rules + overrides ─────────────────────────────────────
  listAvailabilityRules(userId: string) {
    return availabilityUseCases.listAvailabilityRules(this.deps, userId);
  }

  addAvailabilityRule(userId: string, input: AvailabilityRuleInput) {
    return availabilityUseCases.addAvailabilityRule(this.deps, userId, input);
  }

  deleteAvailabilityRule(userId: string, ruleId: string): Promise<void> {
    return availabilityUseCases.deleteAvailabilityRule(this.deps, userId, ruleId);
  }

  addAvailabilityOverride(userId: string, input: AvailabilityOverrideInput) {
    return availabilityUseCases.addAvailabilityOverride(this.deps, userId, input);
  }

  deleteAvailabilityOverride(userId: string, overrideId: string): Promise<void> {
    return availabilityUseCases.deleteAvailabilityOverride(this.deps, userId, overrideId);
  }

  // ── Public slot grid (cached) ──────────────────────────────────────────
  listPublicSlots(args: {
    handle: string;
    offeringSlug: string;
    fromUtc: string;
    toUtc: string;
  }): Promise<{
    host: PublicHostProfileDTO;
    offering: BookingOfferingDTO;
    slots: PublicSlotDTO[];
  }> {
    return slotUseCases.listPublicSlots(this.deps, args);
  }

  // ── Reservations ───────────────────────────────────────────────────────
  createReservation(input: CreateReservationInput): Promise<{
    reservation: ReservationDetailDTO;
    magicLinkToken: string;
  }> {
    return createReservation(this.deps, input);
  }

  getReservationByMagicToken(token: string): Promise<ReservationDetailDTO> {
    return reservationUseCases.getReservationByMagicToken(this.deps, token);
  }

  getReservationForHost(
    hostUserId: string,
    reservationId: string,
  ): Promise<ReservationDetailDTO> {
    return reservationUseCases.getReservationForHost(this.deps, hostUserId, reservationId);
  }

  listReservationsForHost(hostUserId: string): Promise<ReservationSummaryDTO[]> {
    return reservationUseCases.listReservationsForHost(this.deps, hostUserId);
  }

  cancelReservation(args: {
    actor: "host" | "booker";
    actorUserId?: string;
    magicLinkToken?: string;
    reservationId?: string;
    input: CancelReservationInput;
  }): Promise<ReservationDetailDTO> {
    return reservationUseCases.cancelReservation(this.deps, args);
  }

  rescheduleReservation(args: {
    actor: "host" | "booker";
    actorUserId?: string;
    magicLinkToken?: string;
    reservationId?: string;
    input: RescheduleReservationInput;
  }): Promise<ReservationDetailDTO> {
    return reservationUseCases.rescheduleReservation(this.deps, args);
  }

  // ── Comments ───────────────────────────────────────────────────────────
  listComments(args: {
    actor: BookingAuthorKind;
    actorUserId?: string;
    magicLinkToken?: string;
    reservationId?: string;
  }): Promise<BookingCommentDTO[]> {
    return commentUseCases.listComments(this.deps, args);
  }

  addComment(args: {
    actor: BookingAuthorKind;
    actorUserId?: string;
    magicLinkToken?: string;
    reservationId?: string;
    input: AddCommentInput;
  }): Promise<BookingCommentDTO> {
    return commentUseCases.addComment(this.deps, args);
  }

  // ── Stripe payment hook (called from webhook) ──────────────────────────
  /**
   * Mark a reservation confirmed once a PaymentIntent succeeds.
   * Idempotent: re-calling on a confirmed reservation is a no-op.
   */
  markPaid(args: {
    reservationId: string;
    paymentIntentId: string;
  }): Promise<ReservationDetailDTO | null> {
    return markPaid(this.deps, args);
  }
}

// Re-export for tests.
export const __test = { offeringToDto, reservationToDetailDto, reservationToSummaryDto };
// Tagging the unused RESERVATION_STATUSES + AddCommentInput + AvailabilityOverrideInput
// + AvailabilityRuleInput + BookingOfferingInput + Cancel/Reschedule re-export so
// downstream tree-shakers keep them; the type aliases above are the actual surface.
export type { ReservationStatus, BookingAuthorKind };
void RESERVATION_STATUSES;
