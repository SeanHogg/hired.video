import { z } from 'zod';
import { apiClient } from "@/lib/api-client";

// Zod schemas for type validation
export const CreateRefundRequestSchema = z.object({
  subscriptionId: z.string().optional(),
  chargeId: z.string().optional(),
  amountCents: z.number().int().positive(),
  reason: z.string().min(1).max(500),
  description: z.string().max(1000).optional(),
});

export const RefundRequestSchema = z.object({
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

export const RefundStatsSchema = z.object({
  totalRequests: z.number(),
  pendingRequests: z.number(),
  approvedRequests: z.number(),
  rejectedRequests: z.number(),
  totalRefundedAmount: z.number(),
  averageProcessingTime: z.number(),
});

export const CancellationStatsSchema = z.object({
  totalRequests: z.number(),
  pendingRequests: z.number(),
  approvedRequests: z.number(),
  rejectedRequests: z.number(),
  averageProcessingTime: z.number(),
});

// TypeScript types derived from schemas
export type CreateRefundRequest = z.infer<typeof CreateRefundRequestSchema>;
export type RefundRequest = z.infer<typeof RefundRequestSchema>;
export type CreateCancellationRequest = z.infer<typeof CreateCancellationRequestSchema>;
export type CancellationRequest = z.infer<typeof CancellationRequestSchema>;
export type RefundPolicy = z.infer<typeof RefundPolicySchema>;
export type RefundReasons = z.infer<typeof RefundReasonsSchema>;
export type RefundStats = z.infer<typeof RefundStatsSchema>;
export type CancellationStats = z.infer<typeof CancellationStatsSchema>;

type ServiceResult<T> = { success: boolean; data?: T; error?: { message: string } };

// Wraps apiClient calls in the legacy { success, data?, error? } envelope that
// existing callers (BillingManagement, RefundRequestModal) check via
// `response.success`. suppressErrorEvent skips the global "API error" toast —
// callers handle user-facing error messaging themselves.
async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<ServiceResult<T>> {
  try {
    const res = await apiClient.request<T>(path, { method, body, suppressErrorEvent: true });
    return { success: true, data: res.data };
  } catch (err) {
    return {
      success: false,
      error: { message: err instanceof Error ? err.message : "Unknown error" },
    };
  }
}

/**
 * Service for managing refund and cancellation requests
 */
export class RefundService {
  private baseUrl = '/api/billing';
  private adminBaseUrl = '/api/ProductDashboard';

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

  // Admin methods (SuperAdmin only)
  getAllRefundRequests(status?: string, fromDate?: Date, toDate?: Date) {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (fromDate) params.append('fromDate', fromDate.toISOString());
    if (toDate) params.append('toDate', toDate.toISOString());
    return call<RefundRequest[]>("GET", `${this.adminBaseUrl}/refund-requests?${params}`);
  }

  approveRefundRequest(requestId: string, adminNotes?: string) {
    return call<RefundRequest>("POST", `${this.adminBaseUrl}/refund-requests/${requestId}/approve`, {
      approve: true,
      adminNotes,
    });
  }

  rejectRefundRequest(requestId: string, rejectionReason: string, adminNotes?: string) {
    return call<RefundRequest>("POST", `${this.adminBaseUrl}/refund-requests/${requestId}/reject`, {
      approve: false,
      rejectionReason,
      adminNotes,
    });
  }

  getRefundStats() {
    return call<RefundStats>("GET", `${this.adminBaseUrl}/refund-stats`);
  }

  getAllCancellationRequests(status?: string, fromDate?: Date, toDate?: Date) {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (fromDate) params.append('fromDate', fromDate.toISOString());
    if (toDate) params.append('toDate', toDate.toISOString());
    return call<CancellationRequest[]>("GET", `${this.adminBaseUrl}/cancellation-requests?${params}`);
  }

  approveCancellationRequest(requestId: string, adminNotes?: string) {
    return call<CancellationRequest>("POST", `${this.adminBaseUrl}/cancellation-requests/${requestId}/approve`, {
      approve: true,
      adminNotes,
    });
  }

  rejectCancellationRequest(requestId: string, rejectionReason: string, adminNotes?: string) {
    return call<CancellationRequest>("POST", `${this.adminBaseUrl}/cancellation-requests/${requestId}/reject`, {
      approve: false,
      rejectionReason,
      adminNotes,
    });
  }

  getCancellationStats() {
    return call<CancellationStats>("GET", `${this.adminBaseUrl}/cancellation-stats`);
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
