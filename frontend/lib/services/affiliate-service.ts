import { z } from "zod";
/*
  Affiliate service client for frontend.
  Follows ApiResponse pattern and tolerates enum values as number or string.
*/

import { apiClient } from "../api-client";
import type { ApiSuccessResponse } from "@shared/api";

// Schemas for affiliate dashboard data
const ReferralSchema = z.object({
  id: z.string(),
  referredUserId: z.string(),
  referralCode: z.string(),
  createdAt: z.string(),
});

const ConversionSchema = z.object({
  id: z.string(),
  referredUserId: z.string(),
  subscriptionAmountCents: z.number(),
  commissionAmountCents: z.number(),
  status: z.union([z.number(), z.string()]),
  createdAt: z.string(),
});

const TotalsSchema = z.object({
  pendingCents: z.number(),
  paidCents: z.number(),
});

const PayoutSchema = z.object({
  id: z.string(),
  amountCents: z.number(),
  status: z.union([z.number(), z.string()]),
  requestedAt: z.string(),
  paidAt: z.string().nullish().optional(),
});

const DashboardSchema = z.object({
  referrals: z.array(ReferralSchema),
  conversions: z.array(ConversionSchema),
  payouts: z.array(PayoutSchema).optional().default([]),
  totals: TotalsSchema,
});

export type Referral = z.infer<typeof ReferralSchema>;
export type Conversion = z.infer<typeof ConversionSchema>;
export type DashboardData = z.infer<typeof DashboardSchema>;

const AffiliateProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  referralCode: z.string(),
  isActive: z.boolean().optional().default(true),
  creationDateTime: z.string().optional(),
  updateDateTime: z.string().nullish().optional(),
});
export type AffiliateProfile = z.infer<typeof AffiliateProfileSchema>;

// Admin stats schemas
const TopAffiliateSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  email: z.string(),
  referralCode: z.string(),
  totalReferrals: z.number(),
  totalConversions: z.number(),
  totalCommissionCents: z.number(),
  conversionRate: z.number(),
});

const AffiliatePayoutSummarySchema = z.object({
  payoutId: z.string(),
  affiliateUserId: z.string(),
  affiliateUserName: z.string(),
  affiliateEmail: z.string(),
  amountCents: z.number(),
  status: z.string(),
  requestedAt: z.string(),
  paidAt: z.string().nullish().optional(),
  providerReferenceId: z.string().nullish().optional(),
});

const AffiliateAdminStatsSchema = z.object({
  totalAffiliates: z.number(),
  activeAffiliates: z.number(),
  newAffiliatesThisMonth: z.number(),
  totalCommissionsPaidCents: z.number(),
  pendingPayoutsCents: z.number(),
  totalReferrals: z.number(),
  totalConversions: z.number(),
  conversionRate: z.number(),
  pendingPayouts: z.number(),
  completedPayouts: z.number(),
  topPerformers: z.array(TopAffiliateSchema),
  recentPayouts: z.array(AffiliatePayoutSummarySchema),
});

export type TopAffiliate = z.infer<typeof TopAffiliateSchema>;
export type AffiliatePayoutSummary = z.infer<typeof AffiliatePayoutSummarySchema>;
export type AffiliateAdminStats = z.infer<typeof AffiliateAdminStatsSchema>;

// Additional schemas for admin functionality
const AffiliateManagementSchema = z.object({
  userId: z.string(),
  email: z.string(),
  firstName: z.string().nullish().optional(),
  lastName: z.string().nullish().optional(),
  referralCode: z.string(),
  isActive: z.boolean(),
  isSuspended: z.boolean(),
  totalReferrals: z.number(),
  totalConversions: z.number(),
  totalCommissionCents: z.number(),
  pendingCommissionCents: z.number(),
  createdAt: z.string(),
});

const AffiliateDetailSchema = z.object({
  userId: z.string(),
  email: z.string(),
  firstName: z.string().nullish().optional(),
  lastName: z.string().nullish().optional(),
  referralCode: z.string(),
  isActive: z.boolean(),
  isSuspended: z.boolean(),
  totalReferrals: z.number(),
  totalConversions: z.number(),
  totalCommissionCents: z.number(),
  pendingCommissionCents: z.number(),
  createdAt: z.string(),
  recentReferrals: z.array(z.object({
    referredUserId: z.string(),
    referredUserEmail: z.string(),
    createdAt: z.string(),
    hasConverted: z.boolean(),
  })),
  recentConversions: z.array(z.object({
    referredUserId: z.string(),
    referredUserEmail: z.string(),
    subscriptionAmountCents: z.number(),
    commissionAmountCents: z.number(),
    createdAt: z.string(),
  })),
  recentPayouts: z.array(AffiliatePayoutSummarySchema),
});

const PaginatedAffiliatesSchema = z.object({
  affiliates: z.array(AffiliateManagementSchema),
  totalCount: z.number(),
  pageNumber: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

const AffiliateReferralSchema = z.object({
  id: z.string(),
  affiliateUserId: z.string(),
  referredUserId: z.string(),
  referredUserEmail: z.string(),
  referralCode: z.string(),
  createdAt: z.string(),
  hasConverted: z.boolean(),
});

const AffiliateConversionSchema = z.object({
  id: z.string(),
  affiliateUserId: z.string(),
  referredUserId: z.string(),
  referredUserEmail: z.string(),
  subscriptionAmountCents: z.number(),
  commissionAmountCents: z.number(),
  status: z.string(),
  createdAt: z.string(),
});

export type AffiliateManagement = z.infer<typeof AffiliateManagementSchema>;
export type AffiliateDetail = z.infer<typeof AffiliateDetailSchema>;
export type PaginatedAffiliates = z.infer<typeof PaginatedAffiliatesSchema>;
export type AffiliateReferral = z.infer<typeof AffiliateReferralSchema>;
export type AffiliateConversion = z.infer<typeof AffiliateConversionSchema>;

export class AffiliateService {
  async getProfile(): Promise<AffiliateProfile> {
    const response = await apiClient.get<AffiliateProfile>("/api/Affiliate/profile", AffiliateProfileSchema);
    return response.data;
  }

  async getDashboard(): Promise<DashboardData> {
    const response: ApiSuccessResponse<DashboardData> = await apiClient.get(
      "/api/Affiliate/dashboard",
      DashboardSchema,
    );
    return response.data;
  }

  async requestPayout(): Promise<{ payoutId?: string; amountCents?: number }> {
    const response = await apiClient.post<{ payoutId?: string; amountCents?: number }>(
      "/api/Affiliate/payout/request",
      undefined,
    );
    return response.data;
  }

  // Admin methods for SuperAdmin dashboard
  async getAdminStats(): Promise<AffiliateAdminStats> {
    const response: ApiSuccessResponse<AffiliateAdminStats> = await apiClient.get(
      "/api/ProductDashboard/affiliate-stats",
      AffiliateAdminStatsSchema,
    );
    return response.data;
  }

  // Admin methods for affiliate management
  async getAllAffiliates(params: {
    pageNumber?: number;
    pageSize?: number;
    searchTerm?: string;
    isActive?: boolean;
    isSuspended?: boolean;
    sortBy?: string;
    sortDirection?: string;
  } = {}): Promise<PaginatedAffiliates> {
    const queryParams = new URLSearchParams();
    if (params.pageNumber) queryParams.append('pageNumber', params.pageNumber.toString());
    if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params.searchTerm) queryParams.append('searchTerm', params.searchTerm);
    if (params.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());
    if (params.isSuspended !== undefined) queryParams.append('isSuspended', params.isSuspended.toString());
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortDirection) queryParams.append('sortDirection', params.sortDirection);

    const response: ApiSuccessResponse<PaginatedAffiliates> = await apiClient.get(
      `/api/Affiliate/admin/all?${queryParams.toString()}`,
      PaginatedAffiliatesSchema,
    );
    return response.data;
  }

  async getAffiliateDetail(userId: string): Promise<AffiliateDetail> {
    const response: ApiSuccessResponse<AffiliateDetail> = await apiClient.get(
      `/api/Affiliate/admin/${userId}/details`,
      AffiliateDetailSchema,
    );
    return response.data;
  }

  async activateAffiliate(userId: string, reason?: string): Promise<void> {
    await apiClient.post(`/api/Affiliate/admin/${userId}/activate`, { reason });
  }

  async deactivateAffiliate(userId: string, reason?: string): Promise<void> {
    await apiClient.post(`/api/Affiliate/admin/${userId}/deactivate`, { reason });
  }

  async suspendAffiliate(userId: string, reason: string): Promise<void> {
    await apiClient.post(`/api/Affiliate/admin/${userId}/suspend`, { reason });
  }

  async unsuspendAffiliate(userId: string, reason?: string): Promise<void> {
    await apiClient.post(`/api/Affiliate/admin/${userId}/unsuspend`, { reason });
  }

  async getAffiliateReferrals(userId: string): Promise<AffiliateReferral[]> {
    const response: ApiSuccessResponse<AffiliateReferral[]> = await apiClient.get(
      `/api/Affiliate/admin/${userId}/referrals`,
      z.array(AffiliateReferralSchema),
    );
    return response.data;
  }

  async getAffiliateConversions(userId: string): Promise<AffiliateConversion[]> {
    const response: ApiSuccessResponse<AffiliateConversion[]> = await apiClient.get(
      `/api/Affiliate/admin/${userId}/conversions`,
      z.array(AffiliateConversionSchema),
    );
    return response.data;
  }

  // Admin methods for payout management
  async getPendingPayouts(): Promise<AffiliatePayoutSummary[]> {
    const response: ApiSuccessResponse<AffiliatePayoutSummary[]> = await apiClient.get(
      "/api/Affiliate/admin/pending-payouts",
      z.array(AffiliatePayoutSummarySchema),
    );
    return response.data;
  }

  async approvePayout(payoutId: string, notes?: string): Promise<void> {
    await apiClient.post(`/api/Affiliate/admin/payout/${payoutId}/approve`, { notes });
  }

  async rejectPayout(payoutId: string, reason: string): Promise<void> {
    await apiClient.post(`/api/Affiliate/admin/payout/${payoutId}/reject`, { reason });
  }

  async processPayout(payoutId: string): Promise<void> {
    await apiClient.post(`/api/Affiliate/admin/payout/${payoutId}/process`, {});
  }

  async getPayoutStatus(payoutId: string): Promise<AffiliatePayoutSummary> {
    const response: ApiSuccessResponse<AffiliatePayoutSummary> = await apiClient.get(
      `/api/Affiliate/admin/payout/${payoutId}/status`,
      AffiliatePayoutSummarySchema,
    );
    return response.data;
  }
}

export const affiliateService = new AffiliateService();
export default affiliateService;

