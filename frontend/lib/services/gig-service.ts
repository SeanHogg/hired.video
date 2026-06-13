// gig-service — freelance / gig marketplace (#101). Any user posts a brief
// with deliverable items; others bid; the owner awards one. On award the
// items become the winning creator's tasks (Content Creator → Gigs board).
// Backed by api/src/routes/gigs.ts + GigService.

import { apiClient } from "@/lib/api-client";
import type { TaskDTO } from "@/types/task";

export type GigProjectStatus = "draft" | "open" | "in_progress" | "completed" | "cancelled";
export type GigMilestoneStatus =
  | "pending"
  | "in_progress"
  | "submitted"
  | "approved"
  | "disputed"
  | "released";
export type GigBidStatus = "submitted" | "shortlisted" | "awarded" | "rejected" | "withdrawn";

export interface GigProject {
  id: string;
  ownerUserId: string;
  title: string;
  description: string;
  requiredSkills: string[];
  budgetKind: "fixed" | "hourly";
  budgetMinCents: number;
  budgetMaxCents: number;
  estimatedDurationDays: number | null;
  status: GigProjectStatus;
  awardedBidId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GigMilestone {
  id: string;
  projectId: string;
  ordinal: number;
  title: string;
  amountCents: number;
  description: string | null;
  status: GigMilestoneStatus;
  approvedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GigBid {
  id: string;
  projectId: string;
  bidderUserId: string;
  coverLetter: string;
  proposedAmountCents: number;
  proposedDurationDays: number | null;
  status: GigBidStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GigBidWithBidder {
  bid: GigBid;
  bidderName: string | null;
  bidderAvatarUrl: string | null;
}

export interface GigItemInput {
  title: string;
  description?: string;
  amountCents: number;
}

export interface CreateGigInput {
  title: string;
  description: string;
  requiredSkills?: string[];
  budgetKind?: "fixed" | "hourly";
  budgetMinCents: number;
  budgetMaxCents: number;
  estimatedDurationDays?: number;
  items?: GigItemInput[];
}

export const gigService = {
  async listOpen(): Promise<GigProject[]> {
    const res = await apiClient.get<{ items: GigProject[] }>("/api/gigs");
    return res.data.items;
  },

  async create(input: CreateGigInput): Promise<{ project: GigProject; milestones: GigMilestone[] }> {
    const res = await apiClient.post<{ project: GigProject; milestones: GigMilestone[] }>("/api/gigs", input);
    return res.data;
  },

  async listMine(): Promise<GigProject[]> {
    const res = await apiClient.get<{ items: GigProject[] }>("/api/gigs/me");
    return res.data.items;
  },

  async listMyBids(): Promise<{ bid: GigBid; project: GigProject }[]> {
    const res = await apiClient.get<{ items: { bid: GigBid; project: GigProject }[] }>("/api/gigs/me/bids");
    return res.data.items;
  },

  async listMyWork(): Promise<{ tasks: TaskDTO[]; projects: { id: string; title: string; status: GigProjectStatus }[] }> {
    const res = await apiClient.get<{
      tasks: TaskDTO[];
      projects: { id: string; title: string; status: GigProjectStatus }[];
    }>("/api/gigs/me/work");
    return res.data;
  },

  async updateWorkStatus(taskId: string, status: number): Promise<TaskDTO> {
    const res = await apiClient.patch<{ task: TaskDTO }>(`/api/gigs/work/${taskId}/status`, { status });
    return res.data.task;
  },

  async getProject(id: string): Promise<{ project: GigProject; milestones: GigMilestone[] }> {
    const res = await apiClient.get<{ project: GigProject; milestones: GigMilestone[] }>(`/api/gigs/${id}`);
    return res.data;
  },

  async placeBid(
    projectId: string,
    input: { coverLetter: string; proposedAmountCents: number; proposedDurationDays?: number },
  ): Promise<GigBid> {
    const res = await apiClient.post<{ bid: GigBid }>(`/api/gigs/${projectId}/bids`, input);
    return res.data.bid;
  },

  async listBids(projectId: string): Promise<GigBidWithBidder[]> {
    const res = await apiClient.get<{ items: GigBidWithBidder[] }>(`/api/gigs/${projectId}/bids`);
    return res.data.items;
  },

  async award(bidId: string): Promise<{ awarded: boolean; projectId: string; tasksCreated: number }> {
    const res = await apiClient.post<{ awarded: boolean; projectId: string; tasksCreated: number }>(
      `/api/gigs/bids/${bidId}/award`,
      {},
    );
    return res.data;
  },

  async approveMilestone(milestoneId: string): Promise<GigMilestone> {
    const res = await apiClient.post<{ milestone: GigMilestone }>(`/api/gigs/milestones/${milestoneId}/approve`, {});
    return res.data.milestone;
  },

  async releaseMilestone(milestoneId: string): Promise<GigMilestone> {
    const res = await apiClient.post<{ milestone: GigMilestone }>(`/api/gigs/milestones/${milestoneId}/release`, {});
    return res.data.milestone;
  },
};
