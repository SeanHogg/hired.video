/**
 * referencesService (#1677) — owner CRUD on reference contacts + share
 * management, plus the public token-view used by the recipient page.
 */
import { apiClient } from "@/lib/api-client";

export interface ReferenceContact {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  relationship: string | null;
  notes: string | null;
}

export interface ReferenceShare {
  id: string;
  token: string;
  sharedWithEmail: string;
  contactIds: string[];
  label: string | null;
  requireNda: boolean;
  ndaAcceptedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  firstViewedAt: string | null;
  createdAt: string;
}

export interface SharedView {
  label: string | null;
  requireNda: boolean;
  unlocked: boolean;
  contacts: ReferenceContact[];
}

export const referencesService = {
  listContacts: () =>
    apiClient.get<ReferenceContact[]>("/api/references/contacts").then((r) => r.data ?? []),
  createContact: (body: Partial<ReferenceContact>) =>
    apiClient.post<ReferenceContact>("/api/references/contacts", body).then((r) => r.data),
  updateContact: (id: string, body: Partial<ReferenceContact>) =>
    apiClient.put<ReferenceContact>(`/api/references/contacts/${id}`, body).then((r) => r.data),
  deleteContact: (id: string) => apiClient.delete(`/api/references/contacts/${id}`),

  listShares: () =>
    apiClient.get<ReferenceShare[]>("/api/references/shares").then((r) => r.data ?? []),
  createShare: (body: {
    contactIds: string[];
    sharedWithEmail: string;
    label?: string;
    requireNda?: boolean;
    expiresInDays?: number;
  }) => apiClient.post<ReferenceShare>("/api/references/shares", body).then((r) => r.data),
  revokeShare: (id: string) => apiClient.delete(`/api/references/shares/${id}`),

  // Public token view (recipient).
  getShared: (token: string) =>
    apiClient
      .get<SharedView>(`/api/references/shared/${token}`, undefined, { suppressErrorEvent: true })
      .then((r) => r.data),
  acceptNda: (token: string) =>
    apiClient
      .post<SharedView>(`/api/references/shared/${token}/accept-nda`, {}, undefined)
      .then((r) => r.data),
};
