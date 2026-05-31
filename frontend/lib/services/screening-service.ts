// screening-service.ts — Client for the candidate-screening routes:
//   • recruiter/employer authoring + sending  → /api/recruit/screening/*
//   • candidate magic-link portal             → /api/public/screening/*
//
// Types mirror the DB rows + the portal projection (see shared/screening.ts and
// api/src/routes/screening.ts). Kept deliberately loose where the backend Zod
// guards already validate, matching recruit-service's convention.

import { apiClient } from "../api-client";
import type {
  ScreeningItemType,
  ScreeningItemStatus,
  ScreeningRequestStatus,
  ScreeningCatalogEntry,
} from "@shared/screening";

// ─── Recruiter-side rows ─────────────────────────────────────────────────────

export interface ScreeningTemplateRow {
  id: string;
  companyId: string;
  createdByUserId: string | null;
  name: string;
  description: string | null;
  roleFamily: string | null;
  jobId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScreeningTemplateItemRow {
  id: string;
  templateId: string;
  itemType: ScreeningItemType;
  refId: string | null;
  config: Record<string, unknown>;
  isRequired: boolean;
  displayOrder: number;
}

export interface ScreeningTemplateWithItems {
  template: ScreeningTemplateRow;
  items: ScreeningTemplateItemRow[];
}

export interface ScreeningRequestRow {
  id: string;
  companyId: string;
  templateId: string | null;
  jobId: string | null;
  applicationId: string | null;
  candidateUserId: string | null;
  candidateEmail: string;
  candidateName: string | null;
  token: string;
  tokenExpiresAt: string;
  status: ScreeningRequestStatus;
  message: string | null;
  completedAt: string | null;
  lastSentAt: string | null;
  resendCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScreeningRequestItemRow {
  id: string;
  requestId: string;
  itemType: ScreeningItemType;
  refId: string | null;
  config: Record<string, unknown>;
  isRequired: boolean;
  displayOrder: number;
  status: ScreeningItemStatus;
  satisfiedSource: "pre_existing" | "completed_now" | null;
  resultRef: Record<string, unknown> | null;
}

export interface ScreeningRequestWithItems {
  request: ScreeningRequestRow;
  items: ScreeningRequestItemRow[];
}

// Item payload the builder sends when creating/updating a template.
export interface ScreeningTemplateItemInput {
  itemType: ScreeningItemType;
  refId?: string | null;
  config?: Record<string, unknown>;
  isRequired?: boolean;
  displayOrder?: number;
}

// ─── Candidate portal projection ─────────────────────────────────────────────

export interface PortalItem {
  id: string;
  itemType: ScreeningItemType;
  title: string;
  description: string;
  refId: string | null;
  config: Record<string, unknown>;
  isRequired: boolean;
  status: ScreeningItemStatus;
  satisfiedSource: "pre_existing" | "completed_now" | null;
}

export interface PortalView {
  status: ScreeningRequestStatus;
  candidateName: string | null;
  candidateEmail: string;
  message: string | null;
  expiresAt: string;
  jobId: string | null;
  items: PortalItem[];
}

export const screeningService = {
  // ── Catalog ──────────────────────────────────────────────────────────────
  async getCatalog(): Promise<ScreeningCatalogEntry[]> {
    const res = await apiClient.get<ScreeningCatalogEntry[]>(
      "/api/recruit/screening/catalog",
    );
    return res.data ?? [];
  },

  // ── Templates ──────────────────────────────────────────────────────────────
  async listTemplates(companyId?: string): Promise<ScreeningTemplateRow[]> {
    const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
    const res = await apiClient.get<ScreeningTemplateRow[]>(
      `/api/recruit/screening/templates${qs}`,
    );
    return res.data ?? [];
  },

  async getTemplate(id: string): Promise<ScreeningTemplateWithItems> {
    const res = await apiClient.get<ScreeningTemplateWithItems>(
      `/api/recruit/screening/templates/${id}`,
    );
    return res.data;
  },

  async createTemplate(input: {
    companyId: string;
    name: string;
    description?: string | null;
    roleFamily?: string | null;
    jobId?: string | null;
    items: ScreeningTemplateItemInput[];
  }): Promise<ScreeningTemplateWithItems> {
    const res = await apiClient.post<ScreeningTemplateWithItems>(
      "/api/recruit/screening/templates",
      input,
    );
    return res.data;
  },

  async updateTemplate(
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      roleFamily?: string | null;
      jobId?: string | null;
      items?: ScreeningTemplateItemInput[];
    },
  ): Promise<ScreeningTemplateWithItems> {
    const res = await apiClient.request<ScreeningTemplateWithItems>(
      `/api/recruit/screening/templates/${id}`,
      { method: "PATCH", body: patch },
    );
    return res.data;
  },

  async archiveTemplate(id: string): Promise<void> {
    await apiClient.delete(`/api/recruit/screening/templates/${id}`);
  },

  // ── Requests ───────────────────────────────────────────────────────────────
  async listRequests(companyId?: string): Promise<ScreeningRequestRow[]> {
    const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
    const res = await apiClient.get<ScreeningRequestRow[]>(
      `/api/recruit/screening/requests${qs}`,
    );
    return res.data ?? [];
  },

  async getRequest(id: string): Promise<ScreeningRequestWithItems> {
    const res = await apiClient.get<ScreeningRequestWithItems>(
      `/api/recruit/screening/requests/${id}`,
    );
    return res.data;
  },

  async sendRequest(input: {
    companyId: string;
    templateId: string;
    candidateEmail: string;
    candidateName?: string;
    candidateUserId?: string;
    jobId?: string;
    applicationId?: string;
    message?: string;
    expiresInDays?: number;
  }): Promise<ScreeningRequestWithItems & { magicLink: string }> {
    const res = await apiClient.post<
      ScreeningRequestWithItems & { magicLink: string }
    >("/api/recruit/screening/requests", input);
    return res.data;
  },

  async resendRequest(id: string): Promise<ScreeningRequestRow> {
    const res = await apiClient.post<ScreeningRequestRow>(
      `/api/recruit/screening/requests/${id}/resend`,
      {},
    );
    return res.data;
  },

  // ── Candidate portal (token-authorized) ────────────────────────────────────
  async getPortal(token: string): Promise<PortalView> {
    const res = await apiClient.get<PortalView>(
      `/api/public/screening/${token}`,
    );
    return res.data;
  },

  async claimPortal(token: string): Promise<PortalView> {
    const res = await apiClient.post<PortalView>(
      `/api/public/screening/${token}/claim`,
      {},
    );
    return res.data;
  },

  async satisfyItem(
    token: string,
    itemId: string,
    resultRef?: Record<string, unknown>,
  ): Promise<PortalView> {
    const res = await apiClient.post<PortalView>(
      `/api/public/screening/${token}/items/${itemId}/satisfy`,
      { resultRef },
    );
    return res.data;
  },
};
