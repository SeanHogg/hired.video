/**
 * BookingsRepository — bookings & reservations storage layer.
 *
 * Owns six tables that compose the bookable-session aggregate:
 *   booking_offerings          — host's session catalog
 *   booking_availability_rules — recurring weekly availability
 *   booking_availability_overrides — one-off adds / blocks
 *   booking_reservations       — each booking
 *   comments (subject 'booking_reservation') — reservation comments
 *   booking_payout_records     — per-reservation payout ledger
 *
 * Plus reads on creator_profiles + users for handle / display-name /
 * timezone resolution. The repo never reads business logic — that
 * lives in services/bookings/.
 *
 * Reference: docs/prd/bookings-and-reservations.md, gap #1648.
 */

import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import { commentsOn } from "./engagementSubjectFilters.js";

const {
  bookingOfferings,
  bookingAvailabilityRules,
  bookingAvailabilityOverrides,
  bookingReservations,
  comments,
  bookingPayoutRecords,
  creatorProfiles,
  users,
  userProfiles,
  accountPreferences,
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

const bookingCommentColumns = {
  id: comments.id,
  reservationId: comments.subjectId,
  authorKind: sql<string>`${comments.authorKind}`,
  authorUserId: comments.authorUserId,
  bodyMd: comments.body,
  createdAt: comments.createdAt,
};

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

export class BookingsRepository implements IBookingsRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ── Host identity ──────────────────────────────────────────────────────
  async findHostByUserId(userId: string): Promise<BookingHostIdentity | null> {
    const [row] = await this.db
      .select({
        userId: users.id,
        handle: users.externalPublicHandle,
        displayName: users.name,
        bio: creatorProfiles.bio,
        timezone: accountPreferences.timezone,
        avatarUrl: userProfiles.avatarUrl,
        platformFeeBps: creatorProfiles.platformFeeBps,
        bookingsActive: creatorProfiles.bookingsActive,
        endedAt: creatorProfiles.endedAt,
      })
      .from(users)
      .leftJoin(
        creatorProfiles,
        and(eq(creatorProfiles.userId, users.id), sql`${creatorProfiles.endedAt} IS NULL`),
      )
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .leftJoin(accountPreferences, eq(accountPreferences.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    return rowToHostIdentity(row);
  }

  async findHostByHandle(handle: string): Promise<BookingHostIdentity | null> {
    const [row] = await this.db
      .select({
        userId: users.id,
        handle: users.externalPublicHandle,
        displayName: users.name,
        bio: creatorProfiles.bio,
        timezone: accountPreferences.timezone,
        avatarUrl: userProfiles.avatarUrl,
        platformFeeBps: creatorProfiles.platformFeeBps,
        bookingsActive: creatorProfiles.bookingsActive,
        endedAt: creatorProfiles.endedAt,
      })
      .from(users)
      .leftJoin(
        creatorProfiles,
        and(eq(creatorProfiles.userId, users.id), sql`${creatorProfiles.endedAt} IS NULL`),
      )
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .leftJoin(accountPreferences, eq(accountPreferences.userId, users.id))
      .where(eq(users.externalPublicHandle, handle))
      .limit(1);
    return rowToHostIdentity(row);
  }

  // ── Offerings ──────────────────────────────────────────────────────────
  async listOfferingsForHost(
    userId: string,
    includeInactive = false,
  ): Promise<BookingOfferingRow[]> {
    const where = includeInactive
      ? eq(bookingOfferings.userId, userId)
      : and(eq(bookingOfferings.userId, userId), eq(bookingOfferings.isActive, true));
    return (await this.db
      .select()
      .from(bookingOfferings)
      .where(where)
      .orderBy(asc(bookingOfferings.displayOrder), asc(bookingOfferings.createdAt))) as BookingOfferingRow[];
  }

  async findOfferingBySlug(userId: string, slug: string): Promise<BookingOfferingRow | null> {
    const [row] = await this.db
      .select()
      .from(bookingOfferings)
      .where(and(eq(bookingOfferings.userId, userId), eq(bookingOfferings.slug, slug)))
      .limit(1);
    return (row as BookingOfferingRow | undefined) ?? null;
  }

  async findOfferingById(id: string): Promise<BookingOfferingRow | null> {
    const [row] = await this.db
      .select()
      .from(bookingOfferings)
      .where(eq(bookingOfferings.id, id))
      .limit(1);
    return (row as BookingOfferingRow | undefined) ?? null;
  }

  async insertOffering(input: BookingOfferingInsert): Promise<BookingOfferingRow> {
    const [row] = await this.db
      .insert(bookingOfferings)
      .values({ ...input, updatedAt: this.now() } as any)
      .returning();
    return row as BookingOfferingRow;
  }

  async updateOffering(
    id: string,
    patch: BookingOfferingPatch,
  ): Promise<BookingOfferingRow | null> {
    const [row] = await this.db
      .update(bookingOfferings)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(bookingOfferings.id, id))
      .returning();
    return (row as BookingOfferingRow | undefined) ?? null;
  }

  async deleteOffering(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(bookingOfferings)
      .where(eq(bookingOfferings.id, id))
      .returning({ id: bookingOfferings.id });
    return Array.isArray(rows) && rows.length > 0;
  }

  // ── Availability rules ─────────────────────────────────────────────────
  async listAvailabilityRulesForHost(userId: string): Promise<BookingAvailabilityRuleRow[]> {
    return (await this.db
      .select()
      .from(bookingAvailabilityRules)
      .where(eq(bookingAvailabilityRules.userId, userId))
      .orderBy(
        asc(bookingAvailabilityRules.weekday),
        asc(bookingAvailabilityRules.startTimeLocal),
      )) as BookingAvailabilityRuleRow[];
  }

  async insertAvailabilityRule(
    input: BookingAvailabilityRuleInsert,
  ): Promise<BookingAvailabilityRuleRow> {
    const [row] = await this.db
      .insert(bookingAvailabilityRules)
      .values(input as any)
      .returning();
    return row as BookingAvailabilityRuleRow;
  }

  async deleteAvailabilityRule(id: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .delete(bookingAvailabilityRules)
      .where(
        and(eq(bookingAvailabilityRules.id, id), eq(bookingAvailabilityRules.userId, userId)),
      )
      .returning({ id: bookingAvailabilityRules.id });
    return Array.isArray(rows) && rows.length > 0;
  }

  // ── Availability overrides ─────────────────────────────────────────────
  async listAvailabilityOverridesForHost(
    userId: string,
    fromLocalDate: string,
    toLocalDate: string,
  ): Promise<BookingAvailabilityOverrideRow[]> {
    return (await this.db
      .select()
      .from(bookingAvailabilityOverrides)
      .where(
        and(
          eq(bookingAvailabilityOverrides.userId, userId),
          gte(bookingAvailabilityOverrides.dateLocal, fromLocalDate),
          lte(bookingAvailabilityOverrides.dateLocal, toLocalDate),
        ),
      )
      .orderBy(asc(bookingAvailabilityOverrides.dateLocal))) as BookingAvailabilityOverrideRow[];
  }

  async insertAvailabilityOverride(
    input: BookingAvailabilityOverrideInsert,
  ): Promise<BookingAvailabilityOverrideRow> {
    const [row] = await this.db
      .insert(bookingAvailabilityOverrides)
      .values(input as any)
      .returning();
    return row as BookingAvailabilityOverrideRow;
  }

  async deleteAvailabilityOverride(id: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .delete(bookingAvailabilityOverrides)
      .where(
        and(
          eq(bookingAvailabilityOverrides.id, id),
          eq(bookingAvailabilityOverrides.userId, userId),
        ),
      )
      .returning({ id: bookingAvailabilityOverrides.id });
    return Array.isArray(rows) && rows.length > 0;
  }

  // ── Reservations ───────────────────────────────────────────────────────
  async listReservationsForHost(userId: string): Promise<BookingReservationRow[]> {
    return (await this.db
      .select()
      .from(bookingReservations)
      .where(eq(bookingReservations.userId, userId))
      .orderBy(desc(bookingReservations.slotStartUtc))) as BookingReservationRow[];
  }

  async listBusyWindowsForHost(
    userId: string,
    fromUtc: Date,
    toUtc: Date,
  ): Promise<Array<{ startUtc: Date; endUtc: Date }>> {
    const rows = (await this.db
      .select({
        startUtc: bookingReservations.slotStartUtc,
        endUtc: bookingReservations.slotEndUtc,
      })
      .from(bookingReservations)
      .where(
        and(
          eq(bookingReservations.userId, userId),
          inArray(bookingReservations.status, [
            "pending_payment",
            "confirmed",
            "completed",
          ]),
          gte(bookingReservations.slotEndUtc, fromUtc),
          lte(bookingReservations.slotStartUtc, toUtc),
        ),
      )) as Array<{ startUtc: Date; endUtc: Date }>;
    return rows;
  }

  async findReservationById(id: string): Promise<BookingReservationRow | null> {
    const [row] = await this.db
      .select()
      .from(bookingReservations)
      .where(eq(bookingReservations.id, id))
      .limit(1);
    return (row as BookingReservationRow | undefined) ?? null;
  }

  async findReservationByMagicToken(
    token: string,
  ): Promise<BookingReservationRow | null> {
    const [row] = await this.db
      .select()
      .from(bookingReservations)
      .where(eq(bookingReservations.magicLinkToken, token))
      .limit(1);
    return (row as BookingReservationRow | undefined) ?? null;
  }

  async insertReservation(
    input: BookingReservationInsert,
  ): Promise<BookingReservationRow> {
    const [row] = await this.db
      .insert(bookingReservations)
      .values({ ...input, updatedAt: this.now() } as any)
      .returning();
    return row as BookingReservationRow;
  }

  async updateReservation(
    id: string,
    patch: BookingReservationPatch,
  ): Promise<BookingReservationRow | null> {
    const [row] = await this.db
      .update(bookingReservations)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(bookingReservations.id, id))
      .returning();
    return (row as BookingReservationRow | undefined) ?? null;
  }

  // ── Comments ───────────────────────────────────────────────────────────
  async listCommentsForReservation(reservationId: string): Promise<BookingCommentRow[]> {
    return (await this.db
      .select(bookingCommentColumns)
      .from(comments)
      .where(commentsOn("booking_reservation", reservationId))
      .orderBy(asc(comments.createdAt))) as BookingCommentRow[];
  }

  async insertComment(input: BookingCommentInsert): Promise<BookingCommentRow> {
    const [row] = await this.db
      .insert(comments)
      .values({
        subjectType: "booking_reservation",
        subjectId: input.reservationId,
        authorKind: input.authorKind,
        authorUserId: input.authorUserId,
        body: input.bodyMd,
      })
      .returning(bookingCommentColumns);
    return row as BookingCommentRow;
  }

  // ── Payout ledger ──────────────────────────────────────────────────────
  async insertPayoutRecord(
    input: BookingPayoutRecordInsert,
  ): Promise<BookingPayoutRecordRow> {
    const [row] = await this.db
      .insert(bookingPayoutRecords)
      .values({ ...input, updatedAt: this.now() } as any)
      .returning();
    return row as BookingPayoutRecordRow;
  }

  async listPayoutRecordsForHost(userId: string): Promise<BookingPayoutRecordRow[]> {
    return (await this.db
      .select()
      .from(bookingPayoutRecords)
      .where(eq(bookingPayoutRecords.userId, userId))
      .orderBy(desc(bookingPayoutRecords.createdAt))) as BookingPayoutRecordRow[];
  }
}

function rowToHostIdentity(row: any): BookingHostIdentity | null {
  if (!row || !row.userId) return null;
  if (!row.handle) return null;
  const displayName = (row.displayName ?? "").toString().trim() || (row.handle as string);
  return {
    userId: row.userId,
    handle: row.handle,
    displayName,
    bio: row.bio ?? null,
    timezone: row.timezone ?? "UTC",
    avatarUrl: row.avatarUrl ?? null,
    platformFeeBps: row.platformFeeBps ?? 500,
    bookingsActive: !!row.bookingsActive,
  };
}
