// sourcing-bid-service — recruiter sourcing marketplace.
// Companies post a job with a sourcing fee + terms; external recruiters
// browse + bid to win the assignment. Backed by api/src/routes/sourcing-bids.ts.

import { apiClient } from "@/lib/api-client";

export interface SourcingJobSummary {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  isRemote: boolean;
  salaryMin: string | null;
  salaryMax: string | null;
  sourcingFeeCents: number | null;
  sourcingDeadline: string | null;
  sourcingTerms: string | null;
  createdAt: string;
}

export interface SourcingBid {
  id: string;
  boardId: string | null;
  jobId: string | null;
  bidderId: string;
  bidAmount: string;
  currency: string;
  durationDays: number;
  status: string;
  message: string | null;
  proposalText: string | null;
  candidatesSubmittedCount: number | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourcingConfig {
  acceptsBids: boolean;
  feeCents: number | null;
  deadline: string | null;
  terms: string | null;
}

export const sourcingBidService = {
  async browseOpenJobs(): Promise<{ jobs: SourcingJobSummary[]; count: number }> {
    const response = await apiClient.get<{ jobs: SourcingJobSummary[]; count: number }>(
      "/api/sourcing/jobs",
    );
    return response.data;
  },

  async listMyBids(): Promise<{ bids: { bid: SourcingBid; job: SourcingJobSummary | null }[]; count: number }> {
    const response = await apiClient.get<{
      bids: { bid: SourcingBid; job: SourcingJobSummary | null }[];
      count: number;
    }>("/api/sourcing/my-bids");
    return response.data;
  },

  async listBidsForJob(jobId: string): Promise<{ bids: SourcingBid[]; count: number }> {
    const response = await apiClient.get<{ bids: SourcingBid[]; count: number }>(
      `/api/jobs/${jobId}/sourcing-bids`,
    );
    return response.data;
  },

  async placeBid(
    jobId: string,
    input: { bidAmount: number; proposalText: string; durationDays?: number },
  ): Promise<SourcingBid> {
    const response = await apiClient.post<SourcingBid>(
      `/api/jobs/${jobId}/sourcing-bids`,
      input,
    );
    return response.data;
  },

  async accept(bidId: string): Promise<SourcingBid> {
    const response = await apiClient.patch<SourcingBid>(`/api/sourcing-bids/${bidId}/accept`, {});
    return response.data;
  },

  async reject(bidId: string, rejectionReason?: string): Promise<SourcingBid> {
    const response = await apiClient.patch<SourcingBid>(`/api/sourcing-bids/${bidId}/reject`, {
      ...(rejectionReason ? { rejectionReason } : {}),
    });
    return response.data;
  },

  async withdraw(bidId: string): Promise<SourcingBid> {
    const response = await apiClient.patch<SourcingBid>(`/api/sourcing-bids/${bidId}/withdraw`, {});
    return response.data;
  },

  async getConfig(jobId: string): Promise<SourcingConfig> {
    const response = await apiClient.get<SourcingConfig>(
      `/api/jobs/${jobId}/sourcing-bids/config`,
    );
    return response.data;
  },

  async updateConfig(jobId: string, config: SourcingConfig): Promise<SourcingConfig> {
    const response = await apiClient.patch<SourcingConfig>(
      `/api/jobs/${jobId}/sourcing-bids/config`,
      config,
    );
    return response.data;
  },
};
