/**
 * #100 — Outplacement product. Employers buy a package of seats at a
 * per-seat unit price for a fixed duration (90/180/365 days). Each
 * seat is assigned to a candidate by email; on first sign-in the
 * candidate's account is linked and a duration-bounded Pro
 * entitlement override is granted.
 *
 *   purchasePackage    — record the employer's purchase (status='pending'
 *                        until payment provider confirms)
 *   markPackagePaid    — provider webhook landed; flip to 'paid' so the
 *                        employer can start assigning seats
 *   assignSeat         — invite a candidate; idempotent on (package, email)
 *   acceptSeat         — candidate signs in / accepts; links userId,
 *                        stamps starts_at + expires_at
 *   revokeSeat         — employer rescinds an unused or active seat; frees
 *                        the slot back to seats_assigned counter
 *   listEmployerPackages / listPackageSeats — dashboard reads
 *
 * Pricing today comes from the SKU table at the route layer; the
 * service is price-agnostic so per-employer negotiated rates can ship
 * later without churn.
 */

import { and, count, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { outplacementPackages, outplacementEnrollments } = schema;

export type OutplacementDuration = 90 | 180 | 365;

export interface PurchaseInput {
  employerUserId: string;
  employerCompanyId?: string | null;
  seatCount: number;
  durationDays: OutplacementDuration;
  unitPriceCents: number;
}

export interface AssignSeatInput {
  packageId: string;
  candidateEmail: string;
}

export class OutplacementService {
  private static readonly MAX_SEATS = 5000;
  private static readonly VALID_DURATIONS: OutplacementDuration[] = [90, 180, 365];

  async purchasePackage(input: PurchaseInput) {
    if (!Number.isInteger(input.seatCount) || input.seatCount <= 0
        || input.seatCount > OutplacementService.MAX_SEATS) {
      throw new Error(`seatCount must be an integer in [1, ${OutplacementService.MAX_SEATS}]`);
    }
    if (!OutplacementService.VALID_DURATIONS.includes(input.durationDays as OutplacementDuration)) {
      throw new Error("durationDays must be 90, 180 or 365");
    }
    if (input.unitPriceCents < 0) {
      throw new Error("unitPriceCents must be >= 0");
    }

    const totalCents = input.seatCount * input.unitPriceCents;
    const db = getDb();
    const [row] = await db
      .insert(outplacementPackages)
      .values({
        employerUserId: input.employerUserId,
        employerCompanyId: input.employerCompanyId ?? null,
        seatCount: input.seatCount,
        durationDays: input.durationDays,
        unitPriceCents: input.unitPriceCents,
        totalCents,
        status: "pending",
      })
      .returning();
    return row;
  }

  async markPackagePaid(packageId: string, providerPaymentId: string) {
    const db = getDb();
    const [row] = await db
      .update(outplacementPackages)
      .set({ status: "paid", providerPaymentId, paidAt: new Date(), updatedAt: new Date() })
      .where(eq(outplacementPackages.id, packageId))
      .returning();
    return row ?? null;
  }

  async assignSeat({ packageId, candidateEmail }: AssignSeatInput) {
    const email = candidateEmail.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("candidateEmail is required and must be a valid email");
    }
    const db = getDb();

    const [pkg] = await db
      .select()
      .from(outplacementPackages)
      .where(eq(outplacementPackages.id, packageId))
      .limit(1);
    if (!pkg) throw new Error("Package not found");
    if (pkg.status !== "paid") throw new Error("Package not in 'paid' state — cannot assign seats");

    const [{ assigned }] = await db
      .select({ assigned: count(outplacementEnrollments.id) })
      .from(outplacementEnrollments)
      .where(
        and(
          eq(outplacementEnrollments.packageId, packageId),
          sql`${outplacementEnrollments.status} != 'revoked'`,
        ),
      );
    if (assigned >= pkg.seatCount) throw new Error("All seats in this package are assigned");

    // Idempotent on (package, lowercased email).
    const [existing] = await db
      .select()
      .from(outplacementEnrollments)
      .where(
        and(
          eq(outplacementEnrollments.packageId, packageId),
          sql`lower(${outplacementEnrollments.candidateEmail}) = ${email}`,
        ),
      )
      .limit(1);
    if (existing) return existing;

    const [row] = await db
      .insert(outplacementEnrollments)
      .values({
        packageId,
        candidateEmail: email,
        status: "invited",
      })
      .returning();

    await db
      .update(outplacementPackages)
      .set({
        seatsAssigned: sql`${outplacementPackages.seatsAssigned} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(outplacementPackages.id, packageId));

    return row;
  }

  async acceptSeat(enrollmentId: string, candidateUserId: string) {
    const db = getDb();
    const [enrollment] = await db
      .select()
      .from(outplacementEnrollments)
      .where(eq(outplacementEnrollments.id, enrollmentId))
      .limit(1);
    if (!enrollment) throw new Error("Enrollment not found");
    if (enrollment.status === "revoked") throw new Error("Enrollment was revoked");
    if (enrollment.status === "expired") throw new Error("Enrollment has expired");

    const [pkg] = await db
      .select({ durationDays: outplacementPackages.durationDays })
      .from(outplacementPackages)
      .where(eq(outplacementPackages.id, enrollment.packageId))
      .limit(1);
    if (!pkg) throw new Error("Package not found");

    const startsAt = enrollment.startsAt ?? new Date();
    const expiresAt = new Date(startsAt.getTime() + pkg.durationDays * 86_400_000);

    const [updated] = await db
      .update(outplacementEnrollments)
      .set({
        candidateUserId,
        acceptedAt: enrollment.acceptedAt ?? new Date(),
        startsAt,
        expiresAt,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(outplacementEnrollments.id, enrollmentId))
      .returning();
    return updated;
  }

  async revokeSeat(enrollmentId: string) {
    const db = getDb();
    const [enrollment] = await db
      .select()
      .from(outplacementEnrollments)
      .where(eq(outplacementEnrollments.id, enrollmentId))
      .limit(1);
    if (!enrollment) return null;
    if (enrollment.status === "revoked") return enrollment;

    const [updated] = await db
      .update(outplacementEnrollments)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(eq(outplacementEnrollments.id, enrollmentId))
      .returning();

    await db
      .update(outplacementPackages)
      .set({
        seatsAssigned: sql`GREATEST(0, ${outplacementPackages.seatsAssigned} - 1)`,
        updatedAt: new Date(),
      })
      .where(eq(outplacementPackages.id, enrollment.packageId));

    return updated;
  }

  async listEmployerPackages(employerUserId: string) {
    const db = getDb();
    return db
      .select()
      .from(outplacementPackages)
      .where(eq(outplacementPackages.employerUserId, employerUserId))
      .orderBy(sql`${outplacementPackages.createdAt} DESC`);
  }

  async listPackageSeats(packageId: string) {
    const db = getDb();
    return db
      .select()
      .from(outplacementEnrollments)
      .where(eq(outplacementEnrollments.packageId, packageId))
      .orderBy(sql`${outplacementEnrollments.createdAt} DESC`);
  }

  /** Surface for the candidate-side entitlement override: is this user
   *  on an active outplacement seat right now? */
  async hasActiveSeat(candidateUserId: string): Promise<boolean> {
    const db = getDb();
    const [row] = await db
      .select({ id: outplacementEnrollments.id })
      .from(outplacementEnrollments)
      .where(
        and(
          eq(outplacementEnrollments.candidateUserId, candidateUserId),
          eq(outplacementEnrollments.status, "active"),
          sql`${outplacementEnrollments.expiresAt} IS NULL OR ${outplacementEnrollments.expiresAt} > now()`,
        ),
      )
      .limit(1);
    return !!row;
  }
}

export const outplacementService = new OutplacementService();

// Standard SKU pricing — kept as constants so the route layer is the only
// place that handles money. Per-employer negotiated rates would override
// these by passing `unitPriceCents` directly to `purchasePackage()`.
export const OUTPLACEMENT_SKUS = {
  starter: { durationDays: 90 as OutplacementDuration, unitPriceCents: 14_900 },
  standard: { durationDays: 180 as OutplacementDuration, unitPriceCents: 19_900 },
  premium: { durationDays: 365 as OutplacementDuration, unitPriceCents: 29_900 },
} as const;

export type OutplacementSku = keyof typeof OUTPLACEMENT_SKUS;
