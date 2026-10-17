/**
 * Checkout kind "course" — paid-course enrolment (#1400).
 *
 *   start    published + priced course → mint (or resume) the caller's
 *            pending course_checkouts row with the platform-fee split.
 *            Free courses keep POST /api/courses/:id/enroll.
 *   pay      open the one-off payment widget for exactly the course price.
 *   confirm  re-read the transaction from the provider (shared one-off
 *            verifier, same as boosts and token packs); only an approved,
 *            exact-amount USD charge on this user's customer, not already
 *            used by any checkout or pack, flips the row to paid and creates
 *            the enrolment. Replaying the same transaction is idempotent and
 *            repairs a missing enrolment; a provider outage leaves the
 *            checkout pending.
 *
 * Table access is behind CourseCheckoutStore (CourseCheckoutRepository in
 * production) and money behind OneOffPaymentsPort.
 */
import { checkoutIdFor, type CheckoutDTO } from "../../../../../../shared/checkout.js";
import { CourseCheckoutRepository, type CourseCheckoutRow } from "../../../../repositories/courseCheckoutRepository.js";
import { getDb } from "../../../../db/index.js";
import { invalidateLearnerDashboard } from "../../../learning/learner-dashboard.js";
import { isApprovedOneOffPayment } from "../../payment/oneOffPayments.js";
import type { ProviderTransaction } from "../../payment/types.js";
import {
  CHECKOUT_CURRENCY,
  CheckoutError,
  requireOneOffPayments,
  type CheckoutContext,
  type CheckoutKindHandler,
} from "../types.js";

/** Pending checkouts are shown as stale after a day; a late confirm still lands. */
const PENDING_TTL_MS = 24 * 3600 * 1000;
const DEFAULT_PLATFORM_FEE_BPS = 500;

export type CourseCheckoutStore = Pick<
  CourseCheckoutRepository,
  | "findPublishedCourse"
  | "findPendingCheckout"
  | "findCheckout"
  | "findEnrollmentId"
  | "insertPendingCheckout"
  | "claimPayment"
  | "ensurePaidEnrollment"
  | "linkEnrollment"
  | "listPaidForUser"
>;

function toDTO(row: CourseCheckoutRow): CheckoutDTO<"course"> {
  const status = row.status as CheckoutDTO<"course">["status"];
  return {
    id: checkoutIdFor("course", row.id),
    kind: "course",
    status,
    totalCents: row.totalCents,
    amountDueCents: status === "pending" ? row.totalCents : 0,
    currency: CHECKOUT_CURRENCY,
    details: {
      courseId: row.courseId,
      platformFeeCents: row.platformFeeCents,
      creatorCutCents: row.creatorCutCents,
      enrollmentId: row.enrollmentId ?? null,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    },
  };
}

async function ownedCheckout(store: CourseCheckoutStore, userId: string, checkoutId: string): Promise<CourseCheckoutRow> {
  const row = await store.findCheckout(checkoutId);
  if (!row) throw new CheckoutError("NOT_FOUND", "Checkout not found");
  if (row.userId !== userId) throw new CheckoutError("FORBIDDEN", "Not owner of this checkout");
  return row;
}

/** Paid → make sure the enrolment exists and is linked (idempotent). */
async function fulfil(store: CourseCheckoutStore, row: CourseCheckoutRow, paymentRef: string, at: Date): Promise<string> {
  const enrollmentId = await store.ensurePaidEnrollment(row, paymentRef, at);
  if (row.enrollmentId !== enrollmentId) await store.linkEnrollment(row.id, enrollmentId, at);
  invalidateLearnerDashboard(row.userId);
  return enrollmentId;
}

export function createCourseCheckoutKind(
  store: () => CourseCheckoutStore = () => new CourseCheckoutRepository(getDb()),
  now: () => Date = () => new Date(),
): CheckoutKindHandler<"course"> {
  return {
    kind: "course",

    async start(ctx, input) {
      const s = store();
      const course = await s.findPublishedCourse(input.courseId);
      if (!course) throw new CheckoutError("NOT_FOUND", "Course not found");
      if (course.priceCents <= 0) {
        throw new CheckoutError("FREE_COURSE", "This course is free — enrol directly instead.");
      }
      const pending = await s.findPendingCheckout(ctx.userId, course.id);
      if (pending) return toDTO(pending);
      if (await s.findEnrollmentId(ctx.userId, course.id)) {
        throw new CheckoutError("ALREADY_ENROLLED", "You're already enrolled in this course.");
      }
      const platformFeeBps = course.platformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS;
      const platformFeeCents = Math.floor((course.priceCents * platformFeeBps) / 10000);
      const created = await s.insertPendingCheckout({
        userId: ctx.userId,
        courseId: course.id,
        totalCents: course.priceCents,
        platformFeeCents,
        creatorCutCents: course.priceCents - platformFeeCents,
        expiresAt: new Date(now().getTime() + PENDING_TTL_MS),
      });
      return toDTO(created);
    },

    async get(ctx, key) {
      return toDTO(await ownedCheckout(store(), ctx.userId, key));
    },

    async pay(ctx, key, urls) {
      const row = await ownedCheckout(store(), ctx.userId, key);
      if (row.status !== "pending") throw new CheckoutError("NOTHING_DUE", "Nothing is owed on this checkout");
      const payments = requireOneOffPayments(ctx.payments);
      const customerId = await payments.customerIdFor(ctx.userId);
      const collection = await payments.initPurchase({
        customerId,
        amount: row.totalCents / 100,
        currency: CHECKOUT_CURRENCY,
        ...urls,
      });
      return { id: checkoutIdFor("course", row.id), amountDueCents: row.totalCents, collection };
    },

    async confirm(ctx, key, transactionId) {
      const s = store();
      const row = await ownedCheckout(s, ctx.userId, key);
      const id = checkoutIdFor("course", row.id);
      if (row.status === "refunded") throw new CheckoutError("CHECKOUT_REFUNDED", "This checkout has been refunded");
      if (row.status === "paid") {
        // Replaying the same payment is idempotent (and repairs a missing
        // enrolment); any other transaction id is refused.
        if (row.providerPaymentId !== transactionId) {
          throw new CheckoutError("NOTHING_DUE", "This checkout is already paid");
        }
        const enrollmentId = await fulfil(s, row, transactionId, now());
        return { id, kind: "course", pending: false, outcome: { enrollmentId } };
      }
      if (row.status !== "pending") throw new CheckoutError("NOTHING_DUE", "This checkout has expired");
      const payments = requireOneOffPayments(ctx.payments);

      let tx: ProviderTransaction | null;
      let customerId: string;
      try {
        [tx, customerId] = await Promise.all([payments.getTransaction(transactionId), payments.customerIdFor(ctx.userId)]);
      } catch (err) {
        console.warn("[checkout:course] provider check failed; checkout stays pending", { checkoutId: row.id, err: String(err) });
        return { id, kind: "course", pending: true, outcome: { enrollmentId: null } };
      }
      if (!tx || !isApprovedOneOffPayment(tx, { amountCents: row.totalCents, currency: CHECKOUT_CURRENCY, customerId })) {
        throw new CheckoutError("PAYMENT_NOT_VERIFIED", "We couldn't verify that payment");
      }
      const paymentRef = tx.id || transactionId;
      const at = now();
      if (!(await s.claimPayment(row.id, paymentRef, at))) {
        throw new CheckoutError("PAYMENT_ALREADY_USED", "That payment was already used");
      }
      const enrollmentId = await fulfil(s, row, paymentRef, at);
      return { id, kind: "course", pending: false, outcome: { enrollmentId } };
    },

    async listMine(ctx: CheckoutContext) {
      const rows = await store().listPaidForUser(ctx.userId);
      return rows.map((r) => ({
        id: checkoutIdFor("course", r.id),
        kind: "course" as const,
        courseId: r.courseId,
        courseTitle: r.courseTitle,
        courseSlug: r.courseSlug,
        totalCents: r.totalCents,
        status: r.status as CheckoutDTO<"course">["status"],
        paidAt: r.paidAt ? r.paidAt.toISOString() : null,
        enrollmentId: r.enrollmentId,
        createdAt: r.createdAt.toISOString(),
      }));
    },
  };
}
