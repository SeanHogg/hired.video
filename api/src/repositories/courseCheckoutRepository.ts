/**
 * CourseCheckoutRepository — table access for paid-course checkouts
 * (course_checkouts + the course_enrollments row a paid checkout creates).
 * The use case (services/billing/checkout/kinds/course.ts) decides; this file
 * only reads and writes rows.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { courses, courseCheckouts, courseEnrollments, boostCheckouts, tokenPackPurchases, jobBoosts } = schema;

export type DbLike = any;
export type CourseRow = typeof courses.$inferSelect;
export type CourseCheckoutRow = typeof courseCheckouts.$inferSelect;

export interface CourseReceiptRow {
  id: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string | null;
  totalCents: number;
  status: string;
  paidAt: Date | null;
  enrollmentId: string | null;
  createdAt: Date;
}

export class CourseCheckoutRepository {
  constructor(private readonly db: DbLike) {}

  async findPublishedCourse(courseId: string): Promise<CourseRow | null> {
    const [row] = await this.db
      .select()
      .from(courses)
      .where(and(eq(courses.id, courseId), eq(courses.status, "published")))
      .limit(1);
    return row ?? null;
  }

  async findPendingCheckout(userId: string, courseId: string): Promise<CourseCheckoutRow | null> {
    const [row] = await this.db
      .select()
      .from(courseCheckouts)
      .where(and(
        eq(courseCheckouts.userId, userId),
        eq(courseCheckouts.courseId, courseId),
        eq(courseCheckouts.status, "pending"),
      ))
      .limit(1);
    return row ?? null;
  }

  async findCheckout(checkoutId: string): Promise<CourseCheckoutRow | null> {
    const [row] = await this.db.select().from(courseCheckouts).where(eq(courseCheckouts.id, checkoutId)).limit(1);
    return row ?? null;
  }

  async findEnrollmentId(userId: string, courseId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: courseEnrollments.id })
      .from(courseEnrollments)
      .where(and(eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, courseId)))
      .limit(1);
    return row?.id ?? null;
  }

  async insertPendingCheckout(row: {
    userId: string;
    courseId: string;
    totalCents: number;
    platformFeeCents: number;
    creatorCutCents: number;
    expiresAt: Date;
  }): Promise<CourseCheckoutRow> {
    const [created] = await this.db
      .insert(courseCheckouts)
      .values({ ...row, status: "pending" })
      .returning();
    return created;
  }

  /** pending → paid with this provider payment id, in ONE statement, only
   *  when the id isn't already used by any course checkout, boost checkout,
   *  job boost or token pack. True only for the call that claimed it. */
  async claimPayment(checkoutId: string, providerPaymentId: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(courseCheckouts)
      .set({ providerPaymentId, status: "paid", paidAt: at, updatedAt: at })
      .where(and(
        eq(courseCheckouts.id, checkoutId),
        eq(courseCheckouts.status, "pending"),
        sql`NOT EXISTS (SELECT 1 FROM ${courseCheckouts} AS used WHERE used.provider_payment_id = ${providerPaymentId})`,
        sql`NOT EXISTS (SELECT 1 FROM ${boostCheckouts} WHERE ${boostCheckouts.providerPaymentId} = ${providerPaymentId})`,
        sql`NOT EXISTS (SELECT 1 FROM ${tokenPackPurchases} WHERE ${tokenPackPurchases.stripePaymentIntentId} = ${providerPaymentId})`,
        sql`NOT EXISTS (SELECT 1 FROM ${jobBoosts} WHERE ${jobBoosts.stripePaymentIntentId} = ${providerPaymentId})`,
      ))
      .returning({ id: courseCheckouts.id });
    return rows.length > 0;
  }

  /** Create the paid enrolment (idempotent on uq_course_enrollments_user_course);
   *  bumps courses.enrollment_count only when this call created the row. */
  async ensurePaidEnrollment(checkout: CourseCheckoutRow, paymentRef: string, at: Date): Promise<string> {
    const [created] = await this.db
      .insert(courseEnrollments)
      .values({
        courseId: checkout.courseId,
        userId: checkout.userId,
        paymentRef,
        paidAmountCents: checkout.totalCents,
        paidAt: at,
        platformFeeCents: checkout.platformFeeCents,
        creatorCutCents: checkout.creatorCutCents,
      })
      .onConflictDoNothing()
      .returning({ id: courseEnrollments.id });
    if (created) {
      await this.db
        .update(courses)
        .set({ enrollmentCount: sql`${courses.enrollmentCount} + 1` })
        .where(eq(courses.id, checkout.courseId));
      return created.id;
    }
    const existing = await this.findEnrollmentId(checkout.userId, checkout.courseId);
    if (!existing) throw new Error(`course checkout ${checkout.id}: enrolment insert conflicted but no row found`);
    return existing;
  }

  async linkEnrollment(checkoutId: string, enrollmentId: string, at: Date): Promise<void> {
    await this.db
      .update(courseCheckouts)
      .set({ enrollmentId, updatedAt: at })
      .where(eq(courseCheckouts.id, checkoutId));
  }

  async listPaidForUser(userId: string): Promise<CourseReceiptRow[]> {
    return this.db
      .select({
        id: courseCheckouts.id,
        courseId: courseCheckouts.courseId,
        courseTitle: courses.title,
        courseSlug: courses.slug,
        totalCents: courseCheckouts.totalCents,
        status: courseCheckouts.status,
        paidAt: courseCheckouts.paidAt,
        enrollmentId: courseCheckouts.enrollmentId,
        createdAt: courseCheckouts.createdAt,
      })
      .from(courseCheckouts)
      .innerJoin(courses, eq(courses.id, courseCheckouts.courseId))
      .where(and(eq(courseCheckouts.userId, userId), eq(courseCheckouts.status, "paid")))
      .orderBy(desc(courseCheckouts.paidAt));
  }
}
