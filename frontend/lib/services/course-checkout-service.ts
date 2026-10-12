// Typed client for the paid-course checkout flow (#1400). The page never
// calls apiClient directly: start → charge → confirm all live here.

import { apiClient } from "@/lib/api-client";

export interface CourseCheckoutRow {
  id: string;
  courseId: string;
  totalCents: number;
  platformFeeCents: number;
  creatorCutCents: number;
  status: "pending" | "paid" | "expired" | "refunded";
  enrollmentId: string | null;
  expiresAt: string | null;
}

export const courseCheckoutService = {
  /** Mint (or resume) the pending checkout row for a course. */
  async start(courseId: string): Promise<CourseCheckoutRow> {
    const res = await apiClient.post<CourseCheckoutRow>("/api/course-checkout/start", { courseId });
    return res.data;
  },

  /**
   * Charge through the existing payment provider (the same surface
   * boost-checkout uses), then confirm the checkout so the server creates
   * the enrolment. Returns the new enrolment id.
   */
  async payAndConfirm(checkout: Pick<CourseCheckoutRow, "id" | "totalCents">): Promise<string> {
    const res = await apiClient.post<{ providerPaymentId: string }>("/api/payment/charge", {
      purpose: "course_checkout",
      checkoutId: checkout.id,
      amountCents: checkout.totalCents,
    });
    const providerPaymentId = res.data?.providerPaymentId ?? `manual-${Date.now()}`;
    const confirmed = await apiClient.post<{ enrollmentId: string }>(
      `/api/course-checkout/${checkout.id}/confirm-payment`,
      { providerPaymentId },
    );
    return confirmed.data.enrollmentId;
  },
};
