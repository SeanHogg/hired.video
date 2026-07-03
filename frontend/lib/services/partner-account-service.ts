/**
 * Partner Account Service
 *
 * Self-service surface for an account owner to REQUEST partner-platform access
 * and, once a SuperAdmin approves it, self-issue API keys. All routes use the
 * standard authenticated `apiClient` + `{ success, data }` envelope.
 */

import { z } from "zod";
import { apiClient } from "../api-client";

// ============================================================================
// SCHEMAS
// ============================================================================

export const PartnerStatusSchema = z.enum([
  "pending",
  "active",
  "suspended",
  "rejected",
]);
export type PartnerStatus = z.infer<typeof PartnerStatusSchema>;

export const PartnerViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  contactEmail: z.string().nullable().optional(),
  websiteUrl: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  ownerUserId: z.string(),
  requestNote: z.string().nullable().optional(),
  status: PartnerStatusSchema,
  approvedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type PartnerView = z.infer<typeof PartnerViewSchema>;

export const PartnerApiKeyViewSchema = z.object({
  id: z.string(),
  partnerId: z.string(),
  label: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(z.string()),
  allowedOrigins: z.array(z.string()),
  isActive: z.boolean(),
  lastUsedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type PartnerApiKeyView = z.infer<typeof PartnerApiKeyViewSchema>;

/** Response for a freshly-created key — includes the plaintext key ONCE. */
export const CreatedPartnerApiKeySchema = PartnerApiKeyViewSchema.extend({
  key: z.string(),
  warning: z.string().nullable().optional(),
});
export type CreatedPartnerApiKey = z.infer<typeof CreatedPartnerApiKeySchema>;

const MyPartnerResponseSchema = z.object({
  partner: PartnerViewSchema.nullable(),
});
const PartnerWrapperSchema = z.object({ partner: PartnerViewSchema });
const KeysResponseSchema = z.object({
  keys: z.array(PartnerApiKeyViewSchema),
});
const RevokeResponseSchema = z.object({ revoked: z.boolean() });

export interface RequestPartnerBody {
  name: string;
  websiteUrl?: string;
  contactEmail?: string;
  requestNote?: string;
}

export interface CreateKeyBody {
  label: string;
  scopes?: string[];
  expiresInDays?: number;
}

// ============================================================================
// SERVICE
// ============================================================================

export class PartnerAccountService {
  /** The current owner's partner record, or null if they've never requested. */
  async getMyPartner(): Promise<PartnerView | null> {
    const response = await apiClient.get(
      "/api/partner-account",
      MyPartnerResponseSchema,
    );
    return response.data.partner;
  }

  /** Submit a partner-access request. Throws CONFLICT (409) if one exists. */
  async requestPartner(body: RequestPartnerBody): Promise<PartnerView> {
    const response = await apiClient.post(
      "/api/partner-account/request",
      body,
      PartnerWrapperSchema,
    );
    return response.data.partner;
  }

  /** List the partner's API keys. 403 unless partner status is "active". */
  async listKeys(): Promise<PartnerApiKeyView[]> {
    const response = await apiClient.get(
      "/api/partner-account/keys",
      KeysResponseSchema,
    );
    return response.data.keys;
  }

  /** Issue a new API key. The plaintext `key` is returned ONCE. */
  async createKey(body: CreateKeyBody): Promise<CreatedPartnerApiKey> {
    const response = await apiClient.post(
      "/api/partner-account/keys",
      body,
      CreatedPartnerApiKeySchema,
    );
    return response.data;
  }

  /** Revoke an API key. */
  async revokeKey(keyId: string): Promise<boolean> {
    const response = await apiClient.delete(
      `/api/partner-account/keys/${keyId}`,
      RevokeResponseSchema,
    );
    return response.data.revoked;
  }
}

export const partnerAccountService = new PartnerAccountService();
export default partnerAccountService;
