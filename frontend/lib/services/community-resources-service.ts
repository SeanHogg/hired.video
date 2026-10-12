/**
 * Community Resources client. Wraps `/api/community-resources` (+ the
 * SuperAdmin queue) with typed inputs/outputs. Enums come from
 * `shared/community-resources.ts` so the submission form, the directory,
 * and the admin review panel share one source of truth with the backend.
 */
import { z } from "zod";
import { apiClient } from "../api-client";
import {
  RESOURCE_AUDIENCES,
  RESOURCE_CATEGORIES,
  RESOURCE_STATUSES,
  type ResourceAudience,
  type ResourceCategory,
  type ResourceStatus,
} from "@shared/community-resources";

export const CommunityResourceSchema = z.object({
  id: z.string(),
  submittedBy: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  url: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  category: z.enum(RESOURCE_CATEGORIES),
  audience: z.enum(RESOURCE_AUDIENCES),
  countryCode: z.string(),
  stateCode: z.string().nullable().optional(),
  citySlug: z.string().nullable().optional(),
  status: z.enum(RESOURCE_STATUSES),
  reviewedBy: z.string().nullable().optional(),
  reviewedAt: z.union([z.string(), z.date()]).nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export type CommunityResource = z.infer<typeof CommunityResourceSchema>;

export interface SubmitResourceInput {
  title: string;
  description: string;
  url?: string;
  phone?: string;
  category: ResourceCategory;
  audience: ResourceAudience;
  countryCode: string;
  stateCode?: string | null;
  citySlug?: string | null;
}

const ItemsSchema = z.object({ items: z.array(CommunityResourceSchema) });

export const communityResourcesService = {
  /** Approved directory for a location. `country` is required; `state`,
   *  `audience`, and `category` narrow the list. */
  async listDirectory(opts: {
    country: string;
    state?: string | null;
    city?: string | null;
    audience?: ResourceAudience;
    category?: ResourceCategory;
  }): Promise<CommunityResource[]> {
    const params = new URLSearchParams({ country: opts.country });
    if (opts.state) params.set("state", opts.state);
    if (opts.city) params.set("city", opts.city);
    if (opts.audience) params.set("audience", opts.audience);
    if (opts.category) params.set("category", opts.category);
    const res = await apiClient.get<{ items: CommunityResource[] }>(
      `/api/community-resources?${params.toString()}`,
      undefined,
      { suppressErrorEvent: true },
    );
    return ItemsSchema.parse(res.data ?? { items: [] }).items;
  },

  /** Submit a resource for SuperAdmin review. Awards points + a badge. */
  async submit(input: SubmitResourceInput): Promise<CommunityResource> {
    const res = await apiClient.post<{ resource: CommunityResource }>(
      "/api/community-resources",
      input,
    );
    return CommunityResourceSchema.parse(res.data?.resource);
  },

  async listMine(): Promise<CommunityResource[]> {
    const res = await apiClient.get<{ items: CommunityResource[] }>(
      "/api/community-resources/mine",
    );
    return ItemsSchema.parse(res.data ?? { items: [] }).items;
  },

  // ── SuperAdmin queue ──────────────────────────────────────────────────
  async listQueue(status: ResourceStatus = "pending"): Promise<CommunityResource[]> {
    const res = await apiClient.get<{ items: CommunityResource[] }>(
      `/api/admin/community-resources?status=${status}`,
    );
    return ItemsSchema.parse(res.data ?? { items: [] }).items;
  },

  async review(
    id: string,
    input: { status: "approved" | "rejected"; rejectionReason?: string },
  ): Promise<CommunityResource> {
    const res = await apiClient.patch<{ resource: CommunityResource }>(
      `/api/admin/community-resources/${id}/review`,
      input,
    );
    return CommunityResourceSchema.parse(res.data?.resource);
  },
};
