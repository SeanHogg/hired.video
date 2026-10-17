import { z } from 'zod';
import { apiClient } from "@/lib/api-client";
import { RefundRequestSchema as SharedRefundRequestSchema } from "@shared/billing";

// Zod schemas for type validation
// POST /api/billing/refund-request body — derived from the shared wire
// schema (@shared/billing RefundRequestSchema); the modal additionally
// requires a positive amount and caps free text.
export const CreateRefundRequestSchema = SharedRefundRequestSchema.extend({
  subscriptionId: z.string().optional(),
  chargeId: z.string().optional(),
  amountCents: z.number().int().positive(),
  reason: z.string().min(1).max(500),
  description: z.string().max(1000).optional(),
});

/** A stored refund request row (read shape) — not the POST body. */
export const RefundRequestRecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
  subscriptionId: z.string().optional(),
  chargeId: z.string().optional(),
  amountCents: z.number(),
  reason: z.string(),
  description: z.string().optional(),
  status: z.string(),
  requestedAt: z.string(),
  processedAt: z.string().optional(),
  adminUserId: z.string().optional(),
  adminNotes: z.string().optional(),
  rejectionReason: z.string().optional(),
  refundId: z.string().optional(),
});

export const CreateCancellationRequestSchema = z.object({
  reason: z.string().min(1).max(500),
  feedback: z.string().max(1000).optional(),
  requestRefund: z.boolean().default(false),
});

export const CancellationRequestSchema = z.object({
  id: z.string(),
  userId: z.string(),
  reason: z.string(),
  feedback: z.string().optional(),
  requestRefund: z.boolean(),
  status: z.string(),
  requestedAt: z.string(),
  processedAt: z.string().optional(),
  adminUserId: z.string().optional(),
  adminNotes: z.string().optional(),
  rejectionReason: z.string().optional(),
});

export const RefundPolicySchema = z.object({
  refundPeriodDays: z.number(),
  eligiblePlans: z.array(z.string()),
  excludedReasons: z.array(z.string()),
  policyText: z.string(),
  lastUpdated: z.string(),
});

export const RefundReasonsSchema = z.object({
  reasons: z.array(z.object({
    value: z.string(),
    label: z.string(),
    description: z.string().optional(),
  })),
});

// TypeScript types derived from schemas
export type CreateRefundRequest = z.infer<typeof CreateRefundRequestSchema>;
export type RefundRequest = z.infer<typeof RefundRequestRecordSchema>;
export type CreateCancellationRequest = z.infer<typeof CreateCancellationRequestSchema>;
export type CancellationRequest = z.infer<typeof CancellationRequestSchema>;
export type RefundPolicy = z.infer<typeof RefundPolicySchema>;
export type RefundReasons = z.infer<typeof RefundReasonsSchema>;

// The unwrapped payload; throws the typed apiClient error on failure.
// suppressErrorEvent skips the global "API error" toast — callers
// (BillingManagement, RefundRequestModal) own their error messaging.
function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  return apiClient.fetchData<T>(path, { method, body, suppressErrorEvent: true });
}

/**
 * Service for managing refund and cancellation requests
 */
export class RefundService {
  private baseUrl = '/api/billing';

  // User-facing refund methods
  createRefundRequest(request: CreateRefundRequest) {
    return call<RefundRequest>("POST", `${this.baseUrl}/refund-request`, request);
  }

  getRefundRequests() {
    return call<RefundRequest[]>("GET", `${this.baseUrl}/refund-requests`);
  }

  getRefundRequest(requestId: string) {
    return call<RefundRequest>("GET", `${this.baseUrl}/refund-requests/${requestId}`);
  }

  // User-facing cancellation methods
  createCancellationRequest(request: CreateCancellationRequest) {
    return call<CancellationRequest>("POST", `${this.baseUrl}/cancel-account`, request);
  }

  getCancellationRequests() {
    return call<CancellationRequest[]>("GET", `${this.baseUrl}/cancellation-requests`);
  }

  // Utility methods
  getRefundPolicy() {
    return call<RefundPolicy>("GET", `${this.baseUrl}/refund-policy`);
  }

  getRefundReasons() {
    return call<RefundReasons>("GET", `${this.baseUrl}/refund-reasons`);
  }

  // Helper methods
  formatAmount(amountCents: number): string {
    return `$${(amountCents / 100).toFixed(2)}`;
  }

  getStatusColor(status: string): string {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      case 'approved':
        return 'text-green-600 bg-green-100';
      case 'rejected':
        return 'text-red-600 bg-red-100';
      case 'processed':
        return 'text-blue-600 bg-blue-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  }

  getStatusIcon(status: string): string {
    switch (status.toLowerCase()) {
      case 'pending':
        return '⏳';
      case 'approved':
        return '✅';
      case 'rejected':
        return '❌';
      case 'processed':
        return '💰';
      default:
        return '📄';
    }
  }
}

// Export singleton instance
export const refundService = new RefundService();
