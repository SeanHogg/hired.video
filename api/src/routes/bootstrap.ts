// /api/bootstrap — the post-login / page-refresh aggregate (gap #1367).
//
// On AuthProvider mount the SPA used to fire 5–7 sequential requests:
//   GET /api/auth/verification-status
//   GET /api/users/me
//   GET /api/billing/token-budget
//   GET /api/featureflag
//   GET /api/notifications/unread-count
//   GET /api/inbox (CommHubProvider)
//
// This route returns all of them in a single round-trip so the bootstrap
// waterfall collapses from N*RTT to 1*RTT. Estimated user-visible reduction:
// 250–500 ms on cold mount.
//
// Each sub-fetch is wrapped in Promise.allSettled so a slow/failing
// dependency (e.g. notifications down) doesn't block the rest of the
// payload — the SPA falls back to per-endpoint fetches for any missing
// slice (the existing client services still work in isolation).

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import * as billingService from "../services/billing/BillingService.js";
import { getInboxFor } from "../services/messaging/inboxService.js";
import { loadFlags, isEnabledForUser } from "./featureflag.js";

export const bootstrapRoutes = new Hono<AppEnv>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

bootstrapRoutes.get("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const repos = buildRepos(db);

  // Fire every slice in parallel. allSettled so one failure doesn't 5xx the
  // bootstrap — the SPA can lazy-recover any missing slice on demand.
  const [
    verificationResult,
    tokenBudgetResult,
    flagsResult,
    unreadCountResult,
    inboxResult,
  ] = await Promise.allSettled([
    db
      .select({ email: schema.users.email, emailVerified: schema.users.emailVerified })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    billingService.buildTokenBudgetDTO(userId),
    loadFlags(),
    db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.isRead, false),
        ),
      )
      .then((rows) => rows.length),
    // Unfiltered Communication Hub aggregate (gap #1368). The same
    // `getInboxFor` the standalone /api/inbox route calls — empty
    // filter object matches the CommHubProvider's default mount fetch
    // so the SPA can render the hub instantly from the bootstrap.
    getInboxFor({ repos }, userId, {}),
  ]);

  const verification =
    verificationResult.status === "fulfilled" && verificationResult.value
      ? {
          email: verificationResult.value.email,
          emailConfirmed: !!verificationResult.value.emailVerified,
        }
      : null;

  const tokenBudget =
    tokenBudgetResult.status === "fulfilled" ? tokenBudgetResult.value : null;

  // Evaluate every flag for this user once, server-side. Client receives a
  // flattened `{ key: boolean }` map plus the raw flag rows for components
  // that read metadata (description, rollout %).
  const flags = flagsResult.status === "fulfilled" ? flagsResult.value : [];
  const userFlags: Record<string, boolean> = {};
  for (const flag of flags) {
    userFlags[flag.key] = isEnabledForUser(flag, userId, flag.key);
  }

  const unreadCount =
    unreadCountResult.status === "fulfilled" ? unreadCountResult.value : 0;

  const inboxSummary =
    inboxResult.status === "fulfilled" ? inboxResult.value : null;

  return c.json(
    ok({
      verification,
      tokenBudget,
      featureFlags: { flags, userFlags },
      notifications: { unreadCount },
      // Mirrors the /api/inbox response shape so the SPA can render
      // CommHubProvider's surfaces (header bell, outreach badges,
      // page-tab inbox) without a second round-trip on mount. Null
      // when the inbox query failed — CommHubProvider falls back to
      // its own /api/inbox poll.
      inboxSummary,
      // Server time so the client can compute drift-aware "ago" labels off
      // a single trusted clock instead of negotiating per endpoint.
      serverTime: new Date().toISOString(),
    }),
    200,
  );
});
