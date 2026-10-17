/**
 * Bootstrap service — collapses the post-login / page-refresh waterfall
 * into a single /api/bootstrap round-trip (gaps #1367/#1368, W1-C) and
 * seeds every consumer so none of them refetch on first load:
 *
 *   verification      → returned to AuthProvider (verify gate)
 *   tokenBudget       → bootstrap-seed "tokenBudget"   → useTokenBudget
 *   subscription      → bootstrap-seed "subscription"  → useSubscription
 *   inboxSummary      → bootstrap-seed "inbox"         → useCommHub
 *   roleAccess        → React Query roleAccess.byRole  → useRoleAccess
 *   points            → React Query points.me          → usePointsSummary
 *   accountsAvailable → React Query accountsAvailable  → useAvailableAccounts
 *   impersonation     → returned to AuthProvider (orphan-session cleanup)
 *
 * Every slice is nullable: a failed slice leaves its consumer to fetch its
 * own endpoint, exactly as before.
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import { queryClient } from "../query-client";
import { queryKeys } from "../query-keys";
import { setBootstrapSeed } from "../bootstrap-seed";
import { PointsSummarySchema } from "./points-service";
import { toAccountOptions } from "./account-service";
import type { TokenBudget, SubscriptionSummary } from "./billing-service";
import type { RoleAccessMineResponse } from "./role-access-service";

// Slices typed by interfaces (not zod) pass through `z.unknown()` so a
// server-side shape change can't fail-closed the whole bootstrap; the
// consumer rejects on use if a shape regresses.
const passthrough = <T,>() =>
  z
    .unknown()
    .nullable()
    .optional()
    .transform((v) => (v ?? null) as T | null);

const BootstrapResponseSchema = z.object({
  verification: z
    .object({
      email: z.string(),
      emailConfirmed: z.boolean(),
      sentAt: z.string().optional(),
    })
    .nullable(),
  tokenBudget: passthrough<TokenBudget>(),
  subscription: passthrough<SubscriptionSummary>(),
  roleAccess: passthrough<RoleAccessMineResponse>(),
  points: z.unknown().nullable().optional(),
  accountsAvailable: z.unknown().nullable().optional(),
  impersonation: z
    .object({ active: z.object({ id: z.string() }).passthrough().nullable() })
    .nullable()
    .optional(),
  inboxSummary: z.unknown().nullable(),
  serverTime: z.string(),
});

export type BootstrapPayload = z.infer<typeof BootstrapResponseSchema>;

/** Fetch the bootstrap aggregate. AuthProvider calls this ONCE per sign-in
 *  / refresh; the per-slice hooks then read from the seeded caches.
 *  `userId` keys the user-scoped React Query entries. Returns null on
 *  auth/network failure (the per-endpoint flows recover on their own). */
export async function fetchBootstrap(userId: string | null | undefined): Promise<BootstrapPayload | null> {
  try {
    const response = await apiClient.get<BootstrapPayload>(
      "/api/bootstrap",
      BootstrapResponseSchema,
    );
    if (userId) seedFromBootstrap(response.data, userId);
    return response.data;
  } catch (err) {
    if (typeof window !== "undefined" && (window as { __DEBUG__?: boolean }).__DEBUG__) {
      console.warn("[bootstrap] aggregate fetch failed; per-endpoint fallback will take over", err);
    }
    return null;
  }
}

function seedFromBootstrap(payload: BootstrapPayload, userId: string): void {
  if (payload.tokenBudget) setBootstrapSeed("tokenBudget", payload.tokenBudget);
  if (payload.subscription) setBootstrapSeed("subscription", payload.subscription);
  if (payload.inboxSummary) setBootstrapSeed("inbox", payload.inboxSummary);

  if (payload.roleAccess) {
    queryClient.setQueryData(
      queryKeys.roleAccess.byRole(userId, payload.roleAccess.role),
      payload.roleAccess,
    );
  }

  if (payload.points) {
    const points = PointsSummarySchema.safeParse(payload.points);
    if (points.success) queryClient.setQueryData(queryKeys.points.me(userId), points.data);
  }

  if (payload.accountsAvailable) {
    queryClient.setQueryData(
      queryKeys.accountsAvailable.byUser(userId),
      toAccountOptions(payload.accountsAvailable),
    );
  }
}
