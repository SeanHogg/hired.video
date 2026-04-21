// recruit-service.ts — Client for the agency recruiting routes mounted at
// /api/recruit and /api/public/candidate-resume | /api/public/pitch-deck.
//
// MVP scope: the endpoints needed by the candidate-resumes list + detail,
// brand kit + redaction profile CRUD, share creation/revoke, pitch deck
// builder, and the two public reviewer views. Types are intentionally
// loose (plain object shapes) so the UI can iterate without heavy schema
// plumbing — backend Zod guards validate on the server.

import { apiClient } from "../api-client";

// ─── Types (UI-side mirror of the DB rows) ───────────────────────────────────

export interface CandidateResumeRow {
  id: string;
  companyId: string;
  importedByUserId: string | null;
  talentPoolCandidateId: string | null;
  linkedUserId: string | null;
  mergedFromUserResumeId: string | null;
  parentId: string | null;
  isActive: boolean;
  label: string | null;
  content: Record<string, unknown>;
  recruiterNotes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RedactionProfileRow {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  hideName: boolean;
  hideEmail: boolean;
  hidePhone: boolean;
  hideAddress: boolean;
  hideLinkedin: boolean;
  hideOtherUrls: boolean;
  hideAvatar: boolean;
  replacementName: string;
  hideCompanyNames: boolean;
  hideSchoolNames: boolean;
  extraStripPaths: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CandidateResumeShareRow {
  id: string;
  companyId: string;
  candidateResumeId: string;
  redactionProfileId: string | null;
  whitelabelTenantId: string | null;
  sharedByUserId: string | null;
  shareToken: string;
  name: string | null;
  recipientEmail: string | null;
  expiresAt: string | null;
  isActive: boolean;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PitchDeckRow {
  id: string;
  companyId: string;
  createdByUserId: string | null;
  name: string;
  description: string | null;
  jobId: string | null;
  whitelabelTenantId: string | null;
  redactionProfileId: string | null;
  status: "draft" | "sent" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface PitchDeckSlideRow {
  id: string;
  deckId: string;
  candidateResumeId: string;
  displayOrder: number;
  redactionProfileId: string | null;
  fitSummary: string | null;
  matchScore: number | null;
  recruiterNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PitchDeckShareRow {
  id: string;
  deckId: string;
  sharedByUserId: string | null;
  shareToken: string;
  recipientName: string | null;
  recipientEmail: string | null;
  expiresAt: string | null;
  isActive: boolean;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Whitelabel brand kit summary returned inside public views.
export interface PublicBrandKit {
  name: string;
  subdomain: string;
  primaryColor: string | null;
  logoUrl: string | null;
  heroHeadline: string | null;
  website: string | null;
  contactEmail: string | null;
}

export interface PublicCandidateResumeShare {
  share: { id: string; name: string | null; createdAt: string };
  brand: PublicBrandKit | null;
  content: Record<string, unknown>;
}

export interface PublicPitchDeckSlide {
  id: string;
  displayOrder: number;
  fitSummary: string | null;
  matchScore: number | null;
  recruiterNotes: string | null;
  content: Record<string, unknown>;
}

export interface PublicPitchDeck {
  deck: {
    id: string;
    name: string;
    description: string | null;
    jobId: string | null;
    createdAt: string;
  };
  brand: PublicBrandKit | null;
  slides: PublicPitchDeckSlide[];
}

export interface RecruitScopeCompany {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface RecruitScopeBrandKit {
  id: string;
  ownerId: string;
  name: string;
  subdomain: string;
  primaryColor: string | null;
  logoUrl: string | null;
}

export interface RecruitScope {
  primaryCompanyId: string | null;
  companies: RecruitScopeCompany[];
  brandKits: RecruitScopeBrandKit[];
  redactionProfiles: RedactionProfileRow[];
}

// ─── Candidate resumes ───────────────────────────────────────────────────────

export const recruitService = {
  // Fetch the caller's recruiting scope — companies they can act on, brand
  // kits they own, and redaction profiles configured for those companies.
  async getMyScope(): Promise<RecruitScope> {
    const response = await apiClient.get<RecruitScope>("/api/recruit/my-scope");
    return (
      response.data ?? {
        primaryCompanyId: null,
        companies: [],
        brandKits: [],
        redactionProfiles: [],
      }
    );
  },

  // List candidate resumes for a company (or all companies the caller can access).
  async listCandidateResumes(params?: {
    companyId?: string;
    talentPoolCandidateId?: string;
    activeOnly?: boolean;
  }): Promise<CandidateResumeRow[]> {
    const qs = new URLSearchParams();
    if (params?.companyId) qs.set("companyId", params.companyId);
    if (params?.talentPoolCandidateId) qs.set("talentPoolCandidateId", params.talentPoolCandidateId);
    if (params?.activeOnly) qs.set("activeOnly", "true");
    const response = await apiClient.get<CandidateResumeRow[]>(
      `/api/recruit/candidates${qs.toString() ? `?${qs.toString()}` : ""}`,
    );
    return response.data ?? [];
  },

  async getCandidateResume(id: string): Promise<CandidateResumeRow> {
    const response = await apiClient.get<CandidateResumeRow>(`/api/recruit/candidates/${id}`);
    return response.data;
  },

  async createCandidateResume(input: {
    companyId: string;
    talentPoolCandidateId?: string;
    linkedUserId?: string;
    mergedFromUserResumeId?: string;
    parentId?: string;
    label?: string;
    content?: Record<string, unknown>;
    recruiterNotes?: string;
    metadata?: Record<string, unknown>;
    isActive?: boolean;
  }): Promise<CandidateResumeRow> {
    const response = await apiClient.post<CandidateResumeRow>("/api/recruit/candidates", input);
    return response.data;
  },

  async updateCandidateResume(
    id: string,
    patch: Partial<{
      label: string;
      content: Record<string, unknown>;
      recruiterNotes: string | null;
      metadata: Record<string, unknown>;
    }>,
  ): Promise<CandidateResumeRow> {
    const response = await apiClient.request<CandidateResumeRow>(
      `/api/recruit/candidates/${id}`,
      { method: "PATCH", body: patch },
    );
    return response.data;
  },

  async deleteCandidateResume(id: string): Promise<void> {
    await apiClient.delete(`/api/recruit/candidates/${id}`);
  },

  async activateCandidateResume(id: string): Promise<CandidateResumeRow> {
    const response = await apiClient.post<CandidateResumeRow>(
      `/api/recruit/candidates/${id}/activate`,
      {},
    );
    return response.data;
  },

  // ─── Redaction profiles ────────────────────────────────────────────────────

  async listRedactionProfiles(companyId?: string): Promise<RedactionProfileRow[]> {
    const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
    const response = await apiClient.get<RedactionProfileRow[]>(
      `/api/recruit/redaction-profiles${qs}`,
    );
    return response.data ?? [];
  },

  async createRedactionProfile(input: {
    companyId: string;
    name: string;
    description?: string;
    isDefault?: boolean;
    hideName?: boolean;
    hideEmail?: boolean;
    hidePhone?: boolean;
    hideAddress?: boolean;
    hideLinkedin?: boolean;
    hideOtherUrls?: boolean;
    hideAvatar?: boolean;
    replacementName?: string;
    hideCompanyNames?: boolean;
    hideSchoolNames?: boolean;
    extraStripPaths?: string[];
  }): Promise<RedactionProfileRow> {
    const response = await apiClient.post<RedactionProfileRow>(
      "/api/recruit/redaction-profiles",
      input,
    );
    return response.data;
  },

  async updateRedactionProfile(
    id: string,
    patch: Partial<Omit<RedactionProfileRow, "id" | "companyId" | "createdAt" | "updatedAt">>,
  ): Promise<RedactionProfileRow> {
    const response = await apiClient.request<RedactionProfileRow>(
      `/api/recruit/redaction-profiles/${id}`,
      { method: "PATCH", body: patch },
    );
    return response.data;
  },

  async deleteRedactionProfile(id: string): Promise<void> {
    await apiClient.delete(`/api/recruit/redaction-profiles/${id}`);
  },

  // ─── Candidate resume shares ───────────────────────────────────────────────

  async listShares(params?: {
    companyId?: string;
    candidateResumeId?: string;
  }): Promise<CandidateResumeShareRow[]> {
    const qs = new URLSearchParams();
    if (params?.companyId) qs.set("companyId", params.companyId);
    if (params?.candidateResumeId) qs.set("candidateResumeId", params.candidateResumeId);
    const response = await apiClient.get<CandidateResumeShareRow[]>(
      `/api/recruit/shares${qs.toString() ? `?${qs.toString()}` : ""}`,
    );
    return response.data ?? [];
  },

  async createShare(input: {
    companyId: string;
    candidateResumeId: string;
    redactionProfileId?: string;
    whitelabelTenantId?: string;
    name?: string;
    recipientEmail?: string;
    expiresAt?: string;
  }): Promise<CandidateResumeShareRow> {
    const response = await apiClient.post<CandidateResumeShareRow>("/api/recruit/shares", input);
    return response.data;
  },

  async updateShare(
    id: string,
    patch: Partial<{
      name: string;
      recipientEmail: string;
      expiresAt: string | null;
      isActive: boolean;
    }>,
  ): Promise<CandidateResumeShareRow> {
    const response = await apiClient.request<CandidateResumeShareRow>(
      `/api/recruit/shares/${id}`,
      { method: "PATCH", body: patch },
    );
    return response.data;
  },

  async revokeShare(id: string): Promise<void> {
    await apiClient.delete(`/api/recruit/shares/${id}`);
  },

  // ─── Pitch decks ───────────────────────────────────────────────────────────

  async listPitchDecks(companyId?: string): Promise<PitchDeckRow[]> {
    const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
    const response = await apiClient.get<PitchDeckRow[]>(`/api/recruit/pitch-decks${qs}`);
    return response.data ?? [];
  },

  async getPitchDeck(id: string): Promise<PitchDeckRow & { slides: PitchDeckSlideRow[] }> {
    const response = await apiClient.get<PitchDeckRow & { slides: PitchDeckSlideRow[] }>(
      `/api/recruit/pitch-decks/${id}`,
    );
    return response.data;
  },

  async createPitchDeck(input: {
    companyId: string;
    name: string;
    description?: string;
    jobId?: string;
    whitelabelTenantId?: string;
    redactionProfileId?: string;
    status?: "draft" | "sent" | "archived";
  }): Promise<PitchDeckRow> {
    const response = await apiClient.post<PitchDeckRow>("/api/recruit/pitch-decks", input);
    return response.data;
  },

  async updatePitchDeck(
    id: string,
    patch: Partial<Omit<PitchDeckRow, "id" | "companyId" | "createdAt" | "updatedAt">>,
  ): Promise<PitchDeckRow> {
    const response = await apiClient.request<PitchDeckRow>(
      `/api/recruit/pitch-decks/${id}`,
      { method: "PATCH", body: patch },
    );
    return response.data;
  },

  async deletePitchDeck(id: string): Promise<void> {
    await apiClient.delete(`/api/recruit/pitch-decks/${id}`);
  },

  async addSlide(
    deckId: string,
    input: {
      candidateResumeId: string;
      displayOrder?: number;
      redactionProfileId?: string;
      fitSummary?: string;
      matchScore?: number;
      recruiterNotes?: string;
    },
  ): Promise<PitchDeckSlideRow> {
    const response = await apiClient.post<PitchDeckSlideRow>(
      `/api/recruit/pitch-decks/${deckId}/slides`,
      input,
    );
    return response.data;
  },

  async updateSlide(
    deckId: string,
    slideId: string,
    patch: Partial<{
      displayOrder: number;
      redactionProfileId: string | null;
      fitSummary: string | null;
      matchScore: number | null;
      recruiterNotes: string | null;
    }>,
  ): Promise<PitchDeckSlideRow> {
    const response = await apiClient.request<PitchDeckSlideRow>(
      `/api/recruit/pitch-decks/${deckId}/slides/${slideId}`,
      { method: "PATCH", body: patch },
    );
    return response.data;
  },

  async removeSlide(deckId: string, slideId: string): Promise<void> {
    await apiClient.delete(`/api/recruit/pitch-decks/${deckId}/slides/${slideId}`);
  },

  async listDeckShares(deckId: string): Promise<PitchDeckShareRow[]> {
    const response = await apiClient.get<PitchDeckShareRow[]>(
      `/api/recruit/pitch-decks/${deckId}/shares`,
    );
    return response.data ?? [];
  },

  async createDeckShare(
    deckId: string,
    input: {
      recipientName?: string;
      recipientEmail?: string;
      expiresAt?: string;
    },
  ): Promise<PitchDeckShareRow> {
    const response = await apiClient.post<PitchDeckShareRow>(
      `/api/recruit/pitch-decks/${deckId}/shares`,
      input,
    );
    return response.data;
  },

  async revokeDeckShare(shareId: string): Promise<void> {
    await apiClient.delete(`/api/recruit/pitch-decks/shares/${shareId}`);
  },

  // ─── Public (unauthenticated) views ────────────────────────────────────────
  //
  // These hit /api/public/* which is in the auth-bypass whitelist. Work with
  // or without an Authorization header — the apiClient interceptors attach
  // one when a user is signed in, and the backend ignores it for these paths.

  async getPublicCandidateResume(token: string): Promise<PublicCandidateResumeShare> {
    const response = await apiClient.get<PublicCandidateResumeShare>(
      `/api/public/candidate-resume/${encodeURIComponent(token)}`,
    );
    return response.data;
  },

  async getPublicPitchDeck(token: string): Promise<PublicPitchDeck> {
    const response = await apiClient.get<PublicPitchDeck>(
      `/api/public/pitch-deck/${encodeURIComponent(token)}`,
    );
    return response.data;
  },
};
