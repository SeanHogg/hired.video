/**
 * Bootstrap service — collapses the post-login / page-refresh waterfall
 * into a single round-trip (gap #1367).
 *
 * Before: AuthProvider fired 5–7 sequential or near-sequential requests on
 * mount (verification status, token budget, feature flags, unread count,
 * etc.). After: one /api/bootstrap call returns all of them at once and
 * seeds the downstream caches so every consumer hook reads from memory
 * instead of re-fetching.
 *
 * The aggregate route uses Promise.allSettled server-side so a single
 * slow / failing slice doesn't 5xx the whole bootstrap — missing slices
 * come back as null and the individual hooks gracefully fall back to
 * their existing per-endpoint fetches.
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import { FeatureFlagSchema, featureFlagService } from "./feature-flag-service";
import type { TokenBudget } from "./billing-service";
import { setInboxSeed } from "../inbox-seed";

// `TokenBudget` + `InboxResponse` are interfaces, not Zod schemas — we
// pass-through validate with `z.unknown()` so server-side schema changes
// don't fail-closed the whole bootstrap. Consumers downstream are already
// typed against the canonical interfaces and will reject on use if the
// shape regresses.
const BootstrapResponseSchema = z.object({
  verification: z
    .object({
      email: z.string(),
      emailConfirmed: z.boolean(),
    })
    .nullable(),
  tokenBudget: z.unknown().nullable(),
  featureFlags: z.object({
    flags: z.array(FeatureFlagSchema),
    userFlags: z.record(z.string(), z.boolean()),
  }),
  notifications: z.object({
    unreadCount: z.number(),
  }),
  inboxSummary: z.unknown().nullable(),
  serverTime: z.string(),
});

export type BootstrapPayload = z.infer<typeof BootstrapResponseSchema> & {
  tokenBudget: TokenBudget | null;
};

/** Fetch the bootstrap aggregate. Caller is responsible for triggering this
 *  ONCE on AuthProvider mount; the per-slice services + hooks pull from the
 *  seeded caches afterward. Returns null on auth failure (caller should
 *  treat that as "not signed in"). */
export async function fetchBootstrap(): Promise<BootstrapPayload | null> {
  try {
    const response = await apiClient.get<BootstrapPayload>(
      "/api/bootstrap",
      BootstrapResponseSchema,
    );
    seedFromBootstrap(response.data);
    return response.data;
  } catch (err) {
    // 401 / network error — let the existing per-endpoint flows recover
    // (they all already handle their own auth failures).
    if (typeof window !== "undefined" && (window as { __DEBUG__?: boolean }).__DEBUG__) {
      console.warn("[bootstrap] aggregate fetch failed; per-endpoint fallback will take over", err);
    }
    return null;
  }
}

/** Seed the per-slice caches so downstream hooks don't re-fetch. */
function seedFromBootstrap(payload: BootstrapPayload): void {
  // Feature flags → cached map keyed by flag.key.
  featureFlagService.seedFromBootstrap(payload.featureFlags.userFlags);

  // Token budget → re-use the existing "token-budget:update" event channel
  // so `useTokenBudget` patches its state without an extra fetch.
  if (payload.tokenBudget && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("token-budget:update", { detail: payload.tokenBudget }),
    );
  }

  // Notification unread-count → broadcast for any NotificationsPill that
  // listens on this channel; falls back to /api/notifications/unread-count
  // for components that don't.
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("notifications:unread-count", {
        detail: { count: payload.notifications.unreadCount },
      }),
    );
  }

  // Inbox aggregate → stash in the shared seed slot so `useCommHub` reads
  // it on mount and skips its own /api/inbox round-trip. setInboxSeed
  // also dispatches an `inbox:hydrate` event so any already-mounted
  // CommHubProvider hydrates live without waiting for re-mount.
  if (payload.inboxSummary) {
    setInboxSeed(payload.inboxSummary);
  }
}
