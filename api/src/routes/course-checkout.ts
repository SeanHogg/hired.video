/**
 * Paid-course checkout (#1400 build-strategy "Course payment / cart
 * wiring"). Sits between the public course detail page's enrol button
 * and the existing `/api/payment` provider chain (Stripe / Helcim).
 *
 * Flow mirrors boost-checkout:
 *   1. POST /api/course-checkout/start { courseId }
 *      → mints a `course_checkouts` row in `pending` status with the
 *        course's priceCents + platform-fee split.
 *      → returns `{checkoutId, totalCents, platformFeeCents, creatorCutCents}`.
 *        The frontend then opens the existing payment widget against
 *        that total — same path the boost surface uses.
 *   2. POST /api/course-checkout/:id/confirm-payment { providerPaymentId }
 *      → called from the existing payment webhook OR by the frontend's
 *        success handler with the confirmed providerPaymentId.
 *      → flips status='paid', stamps paidAt, and creates the
 *        course_enrollments row (idempotent via uq_course_enrollments
 *        on (userId, courseId)).
 *
 * Why a separate route + table instead of mutating /enroll's 402: paid
 * enrolment has its own state machine (pending → paid → enrollment
 * created) and the payment provider's webhook needs a stable id to
 * round-trip on. The existing free-enrolment path stays untouched —
 * `priceCents === 0` keeps hitting POST /api/courses/:id/enroll.
 */

import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { UuidLikeSchema } from "../../../shared/validation.js";

const { courses, courseCheckouts, courseEnrollments } = schema;

export const courseCheckoutRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const StartSchema = z.object({
  courseId: UuidLikeSchema,
});

courseCheckoutRoutes.post("/start", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = StartSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);

  const db = getDb();
  const [course] = await db.select().from(courses)
    .where(and(eq(courses.id, parsed.data.courseId), eq(courses.status, "published")))
    .limit(1);
  if (!course) return c.json(error("NOT_FOUND", "Course not found"), 404);
  if (course.priceCents <= 0) {
    return c.json(
      error("FREE_COURSE", "This course is free — use POST /api/courses/:id/enroll instead."),
      409,
    );
  }

  // Idempotent — if a pending checkout already exists for this user/course
  // pair, return it instead of minting a duplicate (partial unique index
  // would catch the dup anyway, but a clean 200 keeps the UI flow simple).
  const [existing] = await db.select().from(courseCheckouts)
    .where(and(
      eq(courseCheckouts.userId, userId),
      eq(courseCheckouts.courseId, course.id),
      eq(courseCheckouts.status, "pending"),
    ))
    .limit(1);
  if (existing) return c.json(success(existing), 200);

  // Pre-existing enrolment short-circuits — paid enrolees already have
  // a row.
  const [enrolled] = await db.select({ id: courseEnrollments.id }).from(courseEnrollments)
    .where(and(eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, course.id)))
    .limit(1);
  if (enrolled) {
    return c.json(error("ALREADY_ENROLLED", "You're already enrolled in this course."), 409);
  }

  const platformFeeBps = course.platformFeeBps ?? 500;
  const platformFeeCents = Math.floor((course.priceCents * platformFeeBps) / 10000);
  const creatorCutCents = course.priceCents - platformFeeCents;
  // 24-hour expiry on the pending checkout. Webhook reconciliation
  // re-flips status on a late confirm; the expiry just lets the UI
  // surface a stale checkout vs. a fresh one.
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

  const [created] = await db.insert(courseCheckouts).values({
    userId,
    courseId: course.id,
    totalCents: course.priceCents,
    platformFeeCents,
    creatorCutCents,
    status: "pending",
    expiresAt,
  } as never).returning();

  return c.json(success(created), 201);
});

const ConfirmSchema = z.object({
  providerPaymentId: z.string().min(1).max(255),
});

/** Called by the payment webhook OR by the frontend's success handler
 *  after the existing Stripe/Helcim flow returns. Idempotent — re-running
 *  with the same providerPaymentId is a no-op. */
courseCheckoutRoutes.post("/:id/confirm-payment", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = ConfirmSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);

  const db = getDb();
  const [checkout] = await db.select().from(courseCheckouts)
    .where(and(eq(courseCheckouts.id, c.req.param("id")), eq(courseCheckouts.userId, userId)))
    .limit(1);
  if (!checkout) return c.json(error("NOT_FOUND", "Checkout not found"), 404);
  if (checkout.status === "paid" && checkout.enrollmentId) {
    return c.json(success({ checkout, enrollmentId: checkout.enrollmentId }), 200);
  }
  if (checkout.status === "refunded") {
    return c.json(error("CHECKOUT_REFUNDED", "This checkout has been refunded"), 409);
  }

  // Create / fetch the enrolment row first. The unique index on
  // (userId, courseId) makes this idempotent — re-running the confirm
  // returns the same enrolment.
  let enrollmentId: string;
  const [existingEnroll] = await db.select({ id: courseEnrollments.id }).from(courseEnrollments)
    .where(and(eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, checkout.courseId)))
    .limit(1);
  if (existingEnroll) {
    enrollmentId = existingEnroll.id;
  } else {
    const now = new Date();
    const [created] = await db.insert(courseEnrollments).values({
      courseId: checkout.courseId,
      userId,
      paymentRef: parsed.data.providerPaymentId,
      paidAmountCents: checkout.totalCents,
      paidAt: now,
      platformFeeCents: checkout.platformFeeCents,
      creatorCutCents: checkout.creatorCutCents,
    } as never).returning({ id: courseEnrollments.id });
    enrollmentId = created!.id;
    // Best-effort aggregate bump on courses.enrollmentCount.
    await db.update(courses)
      .set({ enrollmentCount: schema.courses.enrollmentCount } as never)
      .where(eq(courses.id, checkout.courseId))
      .catch(() => undefined);
  }

  const now = new Date();
  await db.update(courseCheckouts).set({
    providerPaymentId: parsed.data.providerPaymentId,
    status: "paid",
    enrollmentId,
    paidAt: now,
    updatedAt: now,
  } as never).where(eq(courseCheckouts.id, checkout.id));

  return c.json(success({ enrollmentId }), 200);
});

courseCheckoutRoutes.get("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [row] = await db.select().from(courseCheckouts)
    .where(and(eq(courseCheckouts.id, c.req.param("id")), eq(courseCheckouts.userId, userId)))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Checkout not found"), 404);
  return c.json(success(row), 200);
});
