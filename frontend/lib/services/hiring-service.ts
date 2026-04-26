// hiring-service.ts — Client for /api/hiring (offer letters + onboarding
// checklists). Backs the Hiring & Onboarding tab in My Services.
//
// Premium-gated server-side via `requirePremium("Hiring & Onboarding")`.

import { apiClient } from "../api-client";

// ─── Offer letters ───────────────────────────────────────────────────────────

export type OfferStatus = "draft" | "sent" | "viewed" | "accepted" | "declined" | "signed";

export interface OfferLetter {
  id: string;
  createdByUserId: string;
  candidateUserId: string | null;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  companyName: string;
  salary: string | null;
  currency: string;
  startDate: string | null;
  expiresAt: string | null;
  bodyHtml: string | null;
  status: OfferStatus;
  signedAt: string | null;
  declineReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOfferInput {
  candidateName: string;
  candidateEmail: string;
  candidateUserId?: string;
  jobTitle: string;
  companyName: string;
  salary?: number;
  currency?: string;
  startDate?: string;
  expiresInDays?: number;
  bodyHtml: string;
}

// ─── Onboarding checklists ───────────────────────────────────────────────────

export type ChecklistStatus = "pending" | "in_progress" | "completed";

export interface OnboardingTask {
  id: string;
  checklistId: string;
  title: string;
  description: string | null;
  category: string;
  dueDate: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  completedByUserId: string | null;
  sortOrder: string;
}

export interface OnboardingChecklist {
  id: string;
  createdByUserId: string;
  candidateUserId: string | null;
  offerLetterId: string | null;
  candidateName: string;
  jobTitle: string | null;
  startDate: string | null;
  status: ChecklistStatus;
  completionPercentage: string;
  createdAt: string;
  updatedAt: string;
  tasks?: OnboardingTask[];
}

export interface CreateChecklistInput {
  candidateName: string;
  candidateUserId?: string;
  offerLetterId?: string;
  jobTitle?: string;
  startDate?: string;
  tasks: Array<{
    title: string;
    description?: string;
    category?: string;
    dueDate?: string;
  }>;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const hiringService = {
  // Offers ─────────────────────────────────────────────────────────────────

  async listOffers(): Promise<OfferLetter[]> {
    const response = await apiClient.get<OfferLetter[]>("/api/hiring/offers");
    return response.data ?? [];
  },

  async createOffer(input: CreateOfferInput): Promise<OfferLetter> {
    const response = await apiClient.post<OfferLetter>("/api/hiring/offers", input);
    if (!response.data) throw new Error("Failed to create offer");
    return response.data;
  },

  async getOffer(id: string): Promise<OfferLetter> {
    const response = await apiClient.get<OfferLetter>(`/api/hiring/offers/${id}`);
    if (!response.data) throw new Error("Offer not found");
    return response.data;
  },

  async sendOffer(id: string): Promise<OfferLetter> {
    const response = await apiClient.patch<OfferLetter>(`/api/hiring/offers/${id}/send`);
    if (!response.data) throw new Error("Failed to send offer");
    return response.data;
  },

  async deleteOffer(id: string): Promise<void> {
    await apiClient.delete(`/api/hiring/offers/${id}`);
  },

  // Checklists ─────────────────────────────────────────────────────────────

  async listChecklists(): Promise<OnboardingChecklist[]> {
    const response = await apiClient.get<OnboardingChecklist[]>("/api/hiring/checklists");
    return response.data ?? [];
  },

  async createChecklist(input: CreateChecklistInput): Promise<OnboardingChecklist> {
    const response = await apiClient.post<OnboardingChecklist>(
      "/api/hiring/checklists",
      input,
    );
    if (!response.data) throw new Error("Failed to create checklist");
    return response.data;
  },

  async getChecklist(id: string): Promise<OnboardingChecklist> {
    const response = await apiClient.get<OnboardingChecklist>(`/api/hiring/checklists/${id}`);
    if (!response.data) throw new Error("Checklist not found");
    return response.data;
  },

  async completeTask(
    checklistId: string,
    taskId: string,
  ): Promise<{ checklist: OnboardingChecklist; completionPercentage: number }> {
    const response = await apiClient.patch<{
      checklist: OnboardingChecklist;
      completionPercentage: number;
    }>(`/api/hiring/checklists/${checklistId}/tasks/${taskId}/complete`);
    if (!response.data) throw new Error("Failed to complete task");
    return response.data;
  },
};
