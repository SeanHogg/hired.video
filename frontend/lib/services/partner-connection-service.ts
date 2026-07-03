/**
 * Partner Connection Service
 *
 * Consumes the "partner platform" consent API. A partner platform can ask a
 * hired.video job seeker to connect their existing account (OAuth-style consent
 * flow) and, once authorized, embed the seeker's profile/resume on the partner
 * site via a keyless token.
 *
 * All authenticated methods go through the shared `apiClient`, so they inherit
 * the standard `{ success, data }` envelope handling + Bearer token injection.
 * `resolveEmbed` hits a PUBLIC endpoint that ignores auth — the apiClient still
 * attaches the token if one is present, which the endpoint simply ignores.
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import type { Resume as FrontendResume } from "@/types/resume";

// ============================================================================
// SCHEMAS
// ============================================================================

/** status of a partner connection/grant. */
export const PartnerConnectionStatusSchema = z.enum([
  "pending",
  "active",
  "revoked",
]);
export type PartnerConnectionStatus = z.infer<
  typeof PartnerConnectionStatusSchema
>;

/** One row in the user's "connected platforms" list (GET /grants). */
export const PartnerGrantSchema = z.object({
  id: z.string(),
  partnerId: z.string(),
  userId: z.string(),
  source: z.string(),
  status: PartnerConnectionStatusSchema,
  scopes: z.array(z.string()),
  consentAgreedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  partnerName: z.string(),
  partnerSlug: z.string(),
  partnerLogoUrl: z.string().nullable().optional(),
  partnerWebsiteUrl: z.string().nullable().optional(),
});
export type PartnerGrant = z.infer<typeof PartnerGrantSchema>;

const GrantsResponseSchema = z.object({
  grants: z.array(PartnerGrantSchema),
});

/** Partner summary embedded in a connection detail. */
export const PartnerSummarySchema = z.object({
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable().optional(),
  websiteUrl: z.string().nullable().optional(),
});
export type PartnerSummary = z.infer<typeof PartnerSummarySchema>;

/** Detail for a single connection (GET /connections/:id). */
export const PartnerConnectionSchema = z.object({
  connectionId: z.string(),
  status: PartnerConnectionStatusSchema,
  source: z.string(),
  scopes: z.array(z.string()),
  partner: PartnerSummarySchema,
});
export type PartnerConnection = z.infer<typeof PartnerConnectionSchema>;

const StatusResponseSchema = z.object({
  status: PartnerConnectionStatusSchema,
});

/** User summary returned by the public embed resolver. */
export const PartnerEmbedUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  handle: z.string().nullable().optional(),
  headline: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  videoPitchUrl: z.string().nullable().optional(),
});
export type PartnerEmbedUser = z.infer<typeof PartnerEmbedUserSchema>;

/**
 * Public embed payload (GET /api/partner/v1/embed/resolve). `resume` matches
 * the canonical Resume shape (same `rowToResume` serializer as the resume
 * embed endpoint); validated loosely as the full ResumeSchema is heavy and
 * the renderer is defensive about missing fields.
 */
export const PartnerEmbedPayloadSchema = z.object({
  kind: z.enum(["profile", "resume"]),
  user: PartnerEmbedUserSchema,
  resume: z.any().nullable(),
});
export type PartnerEmbedPayload = Omit<
  z.infer<typeof PartnerEmbedPayloadSchema>,
  "resume"
> & { resume: FrontendResume | null };

// ============================================================================
// SCOPE LABELS
// ============================================================================

/**
 * Map an OAuth-style scope string to an i18n key describing what it grants,
 * in plain language for the consent screen. Pure (exposes a `labelKey`, not a
 * literal) so callers localize via `t()`. Unknown scopes fall back to a
 * generic key that interpolates the raw scope.
 */
const SCOPE_LABEL_KEYS: Record<string, string> = {
  "read:profile": "partnerConnect.scope.readProfile",
  "read:connections": "partnerConnect.scope.readConnections",
  "write:resumes": "partnerConnect.scope.writeResumes",
  "write:job_seekers": "partnerConnect.scope.writeJobSeekers",
  "write:connections": "partnerConnect.scope.writeConnections",
};

export function scopeLabelKey(scope: string): string {
  return SCOPE_LABEL_KEYS[scope] ?? "partnerConnect.scope.generic";
}

// ============================================================================
// SERVICE
// ============================================================================

export class PartnerConnectionService {
  /** List the partner platforms the current user has connected. */
  async listGrants(): Promise<PartnerGrant[]> {
    const response = await apiClient.get(
      "/api/partner-consent/grants",
      GrantsResponseSchema,
    );
    return response.data.grants;
  }

  /** Fetch a single connection's detail. 404s if the caller doesn't own it. */
  async getConnection(id: string): Promise<PartnerConnection> {
    const response = await apiClient.get(
      `/api/partner-consent/connections/${id}`,
      PartnerConnectionSchema,
    );
    return response.data;
  }

  /** Approve a pending connection. Returns the resulting status. */
  async authorize(id: string): Promise<PartnerConnectionStatus> {
    const response = await apiClient.post(
      `/api/partner-consent/connections/${id}/authorize`,
      {},
      StatusResponseSchema,
    );
    return response.data.status;
  }

  /** Revoke (or deny) a connection. Returns the resulting status. */
  async revoke(id: string): Promise<PartnerConnectionStatus> {
    const response = await apiClient.post(
      `/api/partner-consent/connections/${id}/revoke`,
      {},
      StatusResponseSchema,
    );
    return response.data.status;
  }

  /**
   * Resolve a public embed token → profile/resume payload. Uses the PUBLIC
   * endpoint (no auth required); the apiClient may still attach a Bearer
   * token, which the endpoint ignores. Throws on revoked/expired tokens
   * (401/403) so the embed page can render its "no longer available" state.
   */
  async resolveEmbed(token: string): Promise<PartnerEmbedPayload> {
    const response = await apiClient.get(
      `/api/partner/v1/embed/resolve?token=${encodeURIComponent(token)}`,
      PartnerEmbedPayloadSchema,
    );
    return response.data as PartnerEmbedPayload;
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const partnerConnectionService = new PartnerConnectionService();
export default partnerConnectionService;
