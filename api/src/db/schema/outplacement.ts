/**
 * Outplacement (#100) — employer-paid outplacement packages and the per-seat
 * candidate enrollments they fund. Moved from gapExtensions.ts (2026-10-17).
 */
import { pgTable, uuid, text, varchar, integer, timestamp, jsonb, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";

// ---------------------------------------------------------------------------
// #100 — outplacement product (B2B employer-paid seats)
// ---------------------------------------------------------------------------
export const outplacementPackages = pgTable(
  "outplacement_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employerUserId: uuid("employer_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    employerCompanyId: uuid("employer_company_id").references(() => companyProfiles.id, { onDelete: "set null" }),
    seatCount: integer("seat_count").notNull(),
    seatsAssigned: integer("seats_assigned").notNull().default(0),
    durationDays: integer("duration_days").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    providerPaymentId: text("provider_payment_id"),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_outplacement_packages_employer").on(t.employerUserId, t.status),
    check("outplacement_packages_seat_count_check", sql`${t.seatCount} > 0 AND ${t.seatCount} <= 5000`),
    check("outplacement_packages_check", sql`${t.seatsAssigned} >= 0 AND ${t.seatsAssigned} <= ${t.seatCount}`),
    check("outplacement_packages_duration_days_check", sql`${t.durationDays} IN (90, 180, 365)`),
    check("outplacement_packages_unit_price_cents_check", sql`${t.unitPriceCents} >= 0`),
    check("outplacement_packages_status_check", sql`${t.status} IN ('pending', 'paid', 'cancelled', 'refunded')`),
    index("idx_outplacement_packages_employer_company_id").on(t.employerCompanyId),
  ],
);

export type OutplacementPackage = typeof outplacementPackages.$inferSelect;
export type NewOutplacementPackage = typeof outplacementPackages.$inferInsert;

export const outplacementEnrollments = pgTable(
  "outplacement_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packageId: uuid("package_id").notNull().references(() => outplacementPackages.id, { onDelete: "cascade" }),
    candidateEmail: text("candidate_email").notNull(),
    candidateUserId: uuid("candidate_user_id").references(() => users.id, { onDelete: "set null" }),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: varchar("status", { length: 16 }).notNull().default("invited"),
    completionMetric: jsonb("completion_metric").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_outplacement_enrollments_package_email").on(t.packageId, sql`lower(${t.candidateEmail})`),
    index("idx_outplacement_enrollments_user").on(t.candidateUserId).where(sql`${t.candidateUserId} IS NOT NULL`),
    check("outplacement_enrollments_status_check", sql`${t.status} IN ('invited', 'active', 'completed', 'expired', 'revoked')`),
    index("idx_outplacement_enrollments_package_id").on(t.packageId),
  ],
);

export type OutplacementEnrollment = typeof outplacementEnrollments.$inferSelect;
export type NewOutplacementEnrollment = typeof outplacementEnrollments.$inferInsert;
