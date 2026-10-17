/**
 * Bookings & Reservations — Drizzle schema mirroring migration 0195.
 *
 * The host is a Creator (creator_profiles.bookings_active = true);
 * host identity is `users.id`. No separate booking_hosts table.
 *
 * Naming: `services` is taken by the lead-gen / quote marketplace
 * (routes/services.ts). The bookable-time surface uses `booking_*`
 * tables and the `bookings` creator program.
 *
 * Reference: docs/prd/bookings-and-reservations.md, gap #1648.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  date,
  time,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users } from "./users.js";

// Length tiers allowed at launch — kept in lockstep with the CHECK
// constraint on `duration_minutes` so widening requires a migration.
export const BOOKING_DURATIONS_MINUTES = [30, 60, 90, 120] as const;
export type BookingDurationMinutes = (typeof BOOKING_DURATIONS_MINUTES)[number];

// Reservation lifecycle states — kept in lockstep with the CHECK
// constraint on `status`.
export const RESERVATION_STATUSES = [
  "pending_payment",
  "confirmed",
  "cancelled_by_host",
  "cancelled_by_booker",
  "no_show",
  "completed",
  "refunded",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const AVAILABILITY_OVERRIDE_KINDS = ["add", "block"] as const;
export type AvailabilityOverrideKind = (typeof AVAILABILITY_OVERRIDE_KINDS)[number];

export const BOOKING_AUTHOR_KINDS = ["host", "booker"] as const;
export type BookingAuthorKind = (typeof BOOKING_AUTHOR_KINDS)[number];

export const PAYOUT_RECORD_STATUSES = [
  "pending",
  "in_transit",
  "paid",
  "failed",
  "refunded",
] as const;
export type PayoutRecordStatus = (typeof PAYOUT_RECORD_STATUSES)[number];

// ---------------------------------------------------------------------------
// booking_offerings — host's bookable session catalog
// ---------------------------------------------------------------------------
export const bookingOfferings = pgTable(
  "booking_offerings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 64 }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    priceCents: integer("price_cents").default(0).notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    descriptionMd: text("description_md").default("").notNull(),
    videoConferenceLink: text("video_conference_link"),
    bufferBeforeMinutes: integer("buffer_before_minutes").default(0).notNull(),
    bufferAfterMinutes: integer("buffer_after_minutes").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_booking_offerings_user_slug").on(t.userId, t.slug),
    index("idx_booking_offerings_user_active").on(t.userId, t.isActive),
    // Named as Postgres auto-named the inline CHECKs in 0195_bookings.sql.
    check("booking_offerings_duration_minutes_check", sql`${t.durationMinutes} IN (30, 60, 90, 120)`),
    check("booking_offerings_price_cents_check", sql`${t.priceCents} >= 0`),
    check("booking_offerings_buffer_before_minutes_check", sql`${t.bufferBeforeMinutes} >= 0 AND ${t.bufferBeforeMinutes} <= 240`),
    check("booking_offerings_buffer_after_minutes_check", sql`${t.bufferAfterMinutes} >= 0 AND ${t.bufferAfterMinutes} <= 240`),
  ],
);

export type BookingOffering = typeof bookingOfferings.$inferSelect;
export type NewBookingOffering = typeof bookingOfferings.$inferInsert;

// ---------------------------------------------------------------------------
// booking_availability_rules — recurring weekly availability
// ---------------------------------------------------------------------------
export const bookingAvailabilityRules = pgTable(
  "booking_availability_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    startTimeLocal: time("start_time_local").notNull(),
    endTimeLocal: time("end_time_local").notNull(),
    effectiveFromDate: date("effective_from_date"),
    effectiveUntilDate: date("effective_until_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_booking_avail_rules_user_weekday").on(t.userId, t.weekday),
    check("booking_availability_rules_weekday_check", sql`${t.weekday} BETWEEN 0 AND 6`),
    check("booking_availability_rules_check", sql`${t.endTimeLocal} > ${t.startTimeLocal}`),
  ],
);

export type BookingAvailabilityRule = typeof bookingAvailabilityRules.$inferSelect;
export type NewBookingAvailabilityRule = typeof bookingAvailabilityRules.$inferInsert;

// ---------------------------------------------------------------------------
// booking_availability_overrides — one-off adds + blocks
// ---------------------------------------------------------------------------
export const bookingAvailabilityOverrides = pgTable(
  "booking_availability_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dateLocal: date("date_local").notNull(),
    startTimeLocal: time("start_time_local").notNull(),
    endTimeLocal: time("end_time_local").notNull(),
    kind: varchar("kind", { length: 8 }).notNull(),
    reason: varchar("reason", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_booking_avail_overrides_user_date").on(t.userId, t.dateLocal),
    check("booking_availability_overrides_kind_check", sql`${t.kind} IN ('add', 'block')`),
    check("booking_availability_overrides_check", sql`${t.endTimeLocal} > ${t.startTimeLocal}`),
  ],
);

export type BookingAvailabilityOverride = typeof bookingAvailabilityOverrides.$inferSelect;
export type NewBookingAvailabilityOverride = typeof bookingAvailabilityOverrides.$inferInsert;

// ---------------------------------------------------------------------------
// booking_reservations — each booking
// ---------------------------------------------------------------------------
export const bookingReservations = pgTable(
  "booking_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    offeringId: uuid("offering_id").references(() => bookingOfferings.id, {
      onDelete: "set null",
    }),
    offeringNameSnapshot: varchar("offering_name_snapshot", { length: 120 }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    slotStartUtc: timestamp("slot_start_utc", { withTimezone: true }).notNull(),
    slotEndUtc: timestamp("slot_end_utc", { withTimezone: true }).notNull(),
    bookerEmail: varchar("booker_email", { length: 320 }).notNull(),
    bookerName: varchar("booker_name", { length: 255 }).notNull(),
    bookerPhone: varchar("booker_phone", { length: 40 }),
    bookerUserId: uuid("booker_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 32 }).default("pending_payment").notNull(),
    magicLinkToken: varchar("magic_link_token", { length: 64 }).notNull(),
    paymentIntentId: varchar("payment_intent_id", { length: 255 }),
    amountCents: integer("amount_cents").default(0).notNull(),
    platformFeeCents: integer("platform_fee_cents").default(0).notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_booking_reservations_magic_link").on(t.magicLinkToken),
    index("idx_booking_reservations_user_slot").on(t.userId, t.slotStartUtc),
    index("idx_booking_reservations_user_status").on(t.userId, t.status),
    index("idx_booking_reservations_booker_email").on(t.bookerEmail),
    index("idx_booking_reservations_user_status_slot_partial").on(t.userId, t.slotStartUtc).where(sql`status IN ('pending_payment', 'confirmed', 'completed')`),
    check("booking_reservations_duration_minutes_check", sql`${t.durationMinutes} IN (30, 60, 90, 120)`),
    check("booking_reservations_status_check", sql`${t.status} IN ('pending_payment', 'confirmed', 'cancelled_by_host', 'cancelled_by_booker', 'no_show', 'completed', 'refunded')`),
    check("booking_reservations_amount_cents_check", sql`${t.amountCents} >= 0`),
    check("booking_reservations_platform_fee_cents_check", sql`${t.platformFeeCents} >= 0`),
    check("booking_reservations_check", sql`${t.slotEndUtc} > ${t.slotStartUtc}`),
    index("idx_booking_reservations_booker_user_id").on(t.bookerUserId),
    index("idx_booking_reservations_offering_id").on(t.offeringId),
  ],
);

export type BookingReservation = typeof bookingReservations.$inferSelect;
export type NewBookingReservation = typeof bookingReservations.$inferInsert;

// ---------------------------------------------------------------------------
// booking_comments — threaded comments on a reservation
// ---------------------------------------------------------------------------
export const bookingComments = pgTable(
  "booking_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => bookingReservations.id, { onDelete: "cascade" }),
    authorKind: varchar("author_kind", { length: 8 }).notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    bodyMd: text("body_md").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_booking_comments_reservation").on(t.reservationId, t.createdAt),
    check("booking_comments_author_kind_check", sql`${t.authorKind} IN ('host', 'booker')`),
    index("idx_booking_comments_author_user_id").on(t.authorUserId),
  ],
);

export type BookingComment = typeof bookingComments.$inferSelect;
export type NewBookingComment = typeof bookingComments.$inferInsert;

// ---------------------------------------------------------------------------
// booking_payout_records — per-reservation payout ledger
// ---------------------------------------------------------------------------
export const bookingPayoutRecords = pgTable(
  "booking_payout_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => bookingReservations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    netAmountCents: integer("net_amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    payoutStatus: varchar("payout_status", { length: 32 }).default("pending").notNull(),
    externalTransferId: varchar("external_transfer_id", { length: 255 }),
    transferredAt: timestamp("transferred_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_booking_payout_records_user").on(t.userId),
    index("idx_booking_payout_records_reservation").on(t.reservationId),
    check("booking_payout_records_net_amount_cents_check", sql`${t.netAmountCents} >= 0`),
    check("booking_payout_records_payout_status_check", sql`${t.payoutStatus} IN ('pending', 'in_transit', 'paid', 'failed', 'refunded')`),
  ],
);

export type BookingPayoutRecord = typeof bookingPayoutRecords.$inferSelect;
export type NewBookingPayoutRecord = typeof bookingPayoutRecords.$inferInsert;
