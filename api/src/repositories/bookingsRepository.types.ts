/**
 * Bookings repository types + role interfaces (ISP). Split out of
 * bookingsRepository.ts so the implementation file stays focused on SQL.
 * Re-exported from bookingsRepository.ts — existing imports keep working.
 */

import { schema } from "../db/index.js";

const {
  bookingOfferings,
  bookingAvailabilityRules,
  bookingAvailabilityOverrides,
  bookingReservations,
  bookingPayoutRecords,
} = schema;

export type DbLike = any;

export type BookingOfferingRow = typeof bookingOfferings.$inferSelect;
export type BookingOfferingInsert = typeof bookingOfferings.$inferInsert;
export type BookingOfferingPatch = Partial<BookingOfferingInsert>;

export type BookingAvailabilityRuleRow = typeof bookingAvailabilityRules.$inferSelect;
export type BookingAvailabilityRuleInsert = typeof bookingAvailabilityRules.$inferInsert;

export type BookingAvailabilityOverrideRow = typeof bookingAvailabilityOverrides.$inferSelect;
export type BookingAvailabilityOverrideInsert = typeof bookingAvailabilityOverrides.$inferInsert;

export type BookingReservationRow = typeof bookingReservations.$inferSelect;
export type BookingReservationInsert = typeof bookingReservations.$inferInsert;
export type BookingReservationPatch = Partial<BookingReservationInsert>;

/** A reservation comment, projected from `comments` in the legacy shape. */
export interface BookingCommentRow {
  id: string;
  reservationId: string;
  authorKind: string;
  authorUserId: string | null;
  bodyMd: string;
  createdAt: Date;
}
export type BookingCommentInsert = Omit<BookingCommentRow, "id" | "createdAt">;

export type BookingPayoutRecordRow = typeof bookingPayoutRecords.$inferSelect;
export type BookingPayoutRecordInsert = typeof bookingPayoutRecords.$inferInsert;

/** Minimum host identity surface the service layer needs. */
export interface BookingHostIdentity {
  userId: string;
  handle: string;
  displayName: string;
  bio: string | null;
  timezone: string;
  avatarUrl: string | null;
  platformFeeBps: number;
  bookingsActive: boolean;
}

// ── Role interfaces (ISP) ───────────────────────────────────────────────────
// Consumers depend on the narrowest role they use; `IBookingsRepository`
// composes them so the implementation + DI wiring stay unchanged.

/** Host identity (read-only). */
export interface IBookingHostReader {
  findHostByUserId(userId: string): Promise<BookingHostIdentity | null>;
  findHostByHandle(handle: string): Promise<BookingHostIdentity | null>;
}

/** Offering catalog reads. */
export interface IBookingOfferingReader {
  listOfferingsForHost(userId: string, includeInactive?: boolean): Promise<BookingOfferingRow[]>;
  findOfferingBySlug(userId: string, slug: string): Promise<BookingOfferingRow | null>;
  findOfferingById(id: string): Promise<BookingOfferingRow | null>;
}

/** Offering catalog writes. */
export interface IBookingOfferingWriter {
  insertOffering(input: BookingOfferingInsert): Promise<BookingOfferingRow>;
  updateOffering(id: string, patch: BookingOfferingPatch): Promise<BookingOfferingRow | null>;
  deleteOffering(id: string): Promise<boolean>;
}

/** Availability rule + override reads. */
export interface IBookingAvailabilityReader {
  listAvailabilityRulesForHost(userId: string): Promise<BookingAvailabilityRuleRow[]>;
  listAvailabilityOverridesForHost(
    userId: string,
    fromLocalDate: string,
    toLocalDate: string,
  ): Promise<BookingAvailabilityOverrideRow[]>;
}

/** Availability rule + override writes. */
export interface IBookingAvailabilityWriter {
  insertAvailabilityRule(input: BookingAvailabilityRuleInsert): Promise<BookingAvailabilityRuleRow>;
  deleteAvailabilityRule(id: string, userId: string): Promise<boolean>;
  insertAvailabilityOverride(
    input: BookingAvailabilityOverrideInsert,
  ): Promise<BookingAvailabilityOverrideRow>;
  deleteAvailabilityOverride(id: string, userId: string): Promise<boolean>;
}

/** Reservation reads (incl. busy-window projection for slot resolution). */
export interface IBookingReservationReader {
  listReservationsForHost(userId: string): Promise<BookingReservationRow[]>;
  listBusyWindowsForHost(
    userId: string,
    fromUtc: Date,
    toUtc: Date,
  ): Promise<Array<{ startUtc: Date; endUtc: Date }>>;
  findReservationById(id: string): Promise<BookingReservationRow | null>;
  findReservationByMagicToken(token: string): Promise<BookingReservationRow | null>;
}

/** Reservation writes. */
export interface IBookingReservationWriter {
  /** Concurrency-safe insert — fails on slot collision via the partial index. */
  insertReservation(input: BookingReservationInsert): Promise<BookingReservationRow>;
  updateReservation(id: string, patch: BookingReservationPatch): Promise<BookingReservationRow | null>;
}

/** Reservation comment thread. */
export interface IBookingCommentStore {
  listCommentsForReservation(reservationId: string): Promise<BookingCommentRow[]>;
  insertComment(input: BookingCommentInsert): Promise<BookingCommentRow>;
}

/** Per-reservation payout ledger. */
export interface IBookingPayoutLedger {
  insertPayoutRecord(input: BookingPayoutRecordInsert): Promise<BookingPayoutRecordRow>;
  listPayoutRecordsForHost(userId: string): Promise<BookingPayoutRecordRow[]>;
}

export interface IBookingsRepository
  extends IBookingHostReader,
    IBookingOfferingReader,
    IBookingOfferingWriter,
    IBookingAvailabilityReader,
    IBookingAvailabilityWriter,
    IBookingReservationReader,
    IBookingReservationWriter,
    IBookingCommentStore,
    IBookingPayoutLedger {}
