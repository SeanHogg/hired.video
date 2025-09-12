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
  paidAt: z.string().nullable().optional(),
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
  updateDateTime: z.string().nullable().optional(),
});
export type AffiliateProfile = z.infer<typeof AffiliateProfileSchema>;

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
}

export const affiliateService = new AffiliateService();
export default affiliateService;

