/**
 * SuperAdmin Plan Override client service.
 *
 * Thin, typed wrapper around the /api/admin/impersonate/users/:id/plan-override
 * endpoints. Validates responses with Zod so UI components never consume
 * unparsed/unexpected payloads.
 *
 * Kept separate from UserManagement.tsx so the component stays focused on
 * rendering, and other surfaces (future CLI, bulk-admin tools) can reuse
 * the same client.
 */

import { z } from "zod";
import { apiClient } from "../api-client";

// ---------------------------------------------------------------------------
// Request / response schemas
// ---------------------------------------------------------------------------

export const OverridablePlanSlug = z.enum(["free", "pro", "unlimited"]);
export type OverridablePlanSlug = z.infer<typeof OverridablePlanSlug>;

export const SetPlanOverrideRequestSchema = z.object({
  planSlug: OverridablePlanSlug.nullable().optional(),
  monthlyTokenLimit: z
    .union([z.literal("unlimited"), z.number().int().min(1)])
    .nullable()
    .optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  reason: z.string().min(1).max(1000),
});
export type SetPlanOverrideRequest = z.infer<typeof SetPlanOverrideRequestSchema>;

export const PlanOverrideResponseSchema = z.object({
  userId: z.string(),
  planSlug: z.string().nullable(),
  monthlyTokenLimit: z.number().nullable(),
  expiresAt: z.string().nullable(),
  reason: z.string(),
  grantedBy: z.string(),
  grantedAt: z.string(),
});
export type PlanOverrideResponse = z.infer<typeof PlanOverrideResponseSchema>;

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/** Upsert a plan override. Returns the stored row. */
export async function setPlanOverride(
  userId: string,
  request: SetPlanOverrideRequest,
): Promise<PlanOverrideResponse> {
  // Validate request before sending — fail fast with a clearer error than the
  // server's 400 would give us.
  const parsed = SetPlanOverrideRequestSchema.parse(request);
  const res = await apiClient.put<PlanOverrideResponse>(
    `/api/admin/impersonate/users/${userId}/plan-override`,
    parsed,
  );
  return PlanOverrideResponseSchema.parse(res.data);
}

/** Delete the override; user reverts to their real subscription. */
export async function clearPlanOverride(
  userId: string,
): Promise<{ userId: string; cleared: boolean }> {
  const res = await apiClient.delete<{ userId: string; cleared: boolean }>(
    `/api/admin/impersonate/users/${userId}/plan-override`,
  );
  return res.data;
}
