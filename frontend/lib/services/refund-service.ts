import { z } from 'zod';
import { apiClient } from "@/lib/api-client";
import type { ApiResponse, ApiSuccessResponse } from "@shared/api";

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

/**
 * Service for managing refund and cancellation requests
 */
export class RefundService {
  private baseUrl = '/api/billing';
  private adminBaseUrl = '/api/ProductDashboard';

  // User-facing refund methods
  async createRefundRequest(request: CreateRefundRequest): Promise<{ success: boolean; data?: RefundRequest; error?: any }> {
    const response = await fetch(`${this.baseUrl}/refund-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    const data = await response.json();
    return data;
  }

  async getRefundRequests(): Promise<{ success: boolean; data?: RefundRequest[]; error?: any }> {
    const response = await fetch(`${this.baseUrl}/refund-requests`, {
      method: 'GET',
      credentials: 'include',
    });

    const data = await response.json();
    return data;
  }

  async getRefundRequest(requestId: string): Promise<{ success: boolean; data?: RefundRequest; error?: any }> {
    const response = await fetch(`${this.baseUrl}/refund-requests/${requestId}`, {
      method: 'GET',
      credentials: 'include',
    });

    const data = await response.json();
    return data;
  }

  // User-facing cancellation methods
  async createCancellationRequest(request: CreateCancellationRequest): Promise<{ success: boolean; data?: CancellationRequest; error?: any }> {
    const response = await fetch(`${this.baseUrl}/cancel-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    const data = await response.json();
    return data;
  }

  async getCancellationRequests(): Promise<{ success: boolean; data?: CancellationRequest[]; error?: any }> {
    const response = await fetch(`${this.baseUrl}/cancellation-requests`, {
      method: 'GET',
      credentials: 'include',
    });

    const data = await response.json();
    return data;
  }

  // Utility methods
  async getRefundPolicy(): Promise<{ success: boolean; data?: RefundPolicy; error?: any }> {
    const response = await fetch(`${this.baseUrl}/refund-policy`, {
      method: 'GET',
      credentials: 'include',
    });

    const data = await response.json();
    return data;
  }

  async getRefundReasons(): Promise<{ success: boolean; data?: RefundReasons; error?: any }> {
    const response = await fetch(`${this.baseUrl}/refund-reasons`, {
      method: 'GET',
      credentials: 'include',
    });

    const data = await response.json();
    return data;
  }

  // Admin methods (SuperAdmin only)
  async getAllRefundRequests(
    status?: string,
    fromDate?: Date,
    toDate?: Date
  ): Promise<{ success: boolean; data?: RefundRequest[]; error?: any }> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (fromDate) params.append('fromDate', fromDate.toISOString());
    if (toDate) params.append('toDate', toDate.toISOString());

    const response = await fetch(`${this.adminBaseUrl}/refund-requests?${params}`, {
      method: 'GET',
      credentials: 'include',
    });

    const data = await response.json();
    return data;
  }

  async approveRefundRequest(
    requestId: string,
    adminNotes?: string
  ): Promise<{ success: boolean; data?: RefundRequest; error?: any }> {
    const response = await fetch(`${this.adminBaseUrl}/refund-requests/${requestId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        approve: true,
        adminNotes,
      }),
    });

    const data = await response.json();
    return data;
  }

  async rejectRefundRequest(
    requestId: string,
    rejectionReason: string,
    adminNotes?: string
  ): Promise<{ success: boolean; data?: RefundRequest; error?: any }> {
    const response = await fetch(`${this.adminBaseUrl}/refund-requests/${requestId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        approve: false,
        rejectionReason,
        adminNotes,
      }),
    });

    const data = await response.json();
    return data;
  }

  async getRefundStats(): Promise<{ success: boolean; data?: RefundStats; error?: any }> {
    const response = await fetch(`${this.adminBaseUrl}/refund-stats`, {
      method: 'GET',
      credentials: 'include',
    });

    const data = await response.json();
    return data;
  }

  async getAllCancellationRequests(
    status?: string,
    fromDate?: Date,
    toDate?: Date
  ): Promise<{ success: boolean; data?: CancellationRequest[]; error?: any }> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (fromDate) params.append('fromDate', fromDate.toISOString());
    if (toDate) params.append('toDate', toDate.toISOString());

    const response = await fetch(`${this.adminBaseUrl}/cancellation-requests?${params}`, {
      method: 'GET',
      credentials: 'include',
    });

    const data = await response.json();
    return data;
  }

  async approveCancellationRequest(
    requestId: string,
    adminNotes?: string
  ): Promise<{ success: boolean; data?: CancellationRequest; error?: any }> {
    const response = await fetch(`${this.adminBaseUrl}/cancellation-requests/${requestId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        approve: true,
        adminNotes,
      }),
    });

    const data = await response.json();
    return data;
  }

  async rejectCancellationRequest(
    requestId: string,
    rejectionReason: string,
    adminNotes?: string
  ): Promise<{ success: boolean; data?: CancellationRequest; error?: any }> {
    const response = await fetch(`${this.adminBaseUrl}/cancellation-requests/${requestId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        approve: false,
        rejectionReason,
        adminNotes,
      }),
    });

    const data = await response.json();
    return data;
  }

  async getCancellationStats(): Promise<{ success: boolean; data?: CancellationStats; error?: any }> {
    const response = await fetch(`${this.adminBaseUrl}/cancellation-stats`, {
      method: 'GET',
      credentials: 'include',
    });

    const data = await response.json();
    return data;
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
