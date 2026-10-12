/**
 * /api/admin/social/* — SuperAdmin "Managed Accounts" surface (PRD §4.4,
 * Layer 2 of §5.0). Lets a SuperAdmin connect hired.video's OWN brand
 * account per platform, powering the free Lane A for every user.
 *
 * The OAuth callback is a browser navigation and rides the signed state, so
 * the `/api/admin/social/oauth/callback` path is registered in PUBLIC_PREFIXES (app.ts)
 * — the signed state carries the SuperAdmin's id and the `managed` scope;
 * the auth-url endpoint that mints it IS SuperAdmin-gated, so an attacker
 * can't forge a managed-scope state.
 *
 * Routes:
 *   GET  /api/admin/social/managed                 — status board (configured? connected?)
 *   GET  /api/admin/social/:platform/auth-url      — start brand-account OAuth (SA-gated)
 *   GET  /api/admin/social/:platform/callback      — OAuth exchange (public, browser nav)
 *   POST /api/admin/social/:platform/disconnect    — drop the brand account (SA-gated)
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import {
  SOCIAL_PLATFORM_META,
  isSocialPlatform,
  type SocialPlatform,
} from "../../../shared/social-platforms.js";
import {
  SocialConnectionService,
  SocialConnectionError,
} from "../services/social/social-connection-service.js";
import { frontendBaseUrl } from "../utils/public-urls.js";
import { socialConnectionServiceFor } from "../services/social/social-connection-factory.js";
import { socialOAuthCallbackHandler } from "./social-oauth-callback.js";

const { adminAuditLog } = schema;

export const adminSocialRoutes = new Hono<AppEnv>();

function buildService(c: any): SocialConnectionService {
  return socialConnectionServiceFor(c.env);
}
async function audit(actorId: string, action: string, platform: string) {
  try {
    await getDb().insert(adminAuditLog).values({
      actorId,
      action,
      targetType: "managed_account",
      targetId: platform,
      metadata: { platform },
    } as any);
  } catch (err) {
    console.error("[admin-social] audit insert failed:", err);
  }
}

// The callback is public (browser nav) — register it BEFORE the SA gate so
// the middleware below doesn't 401 the redirect. The signed `managed`-scope
// state can only have been minted by the SA-gated auth-url route.
const MANAGED_ACCOUNTS_PATH = "/admin/social-accounts";
adminSocialRoutes.get("/oauth/callback", socialOAuthCallbackHandler({
  scope: "managed",
  fallbackPath: MANAGED_ACCOUNTS_PATH,
}));

// Everything else is SuperAdmin-gated.
adminSocialRoutes.use("*", superAdminMiddleware);

adminSocialRoutes.get("/managed", async (c) => {
  const board = await buildService(c).managedStatusBoard();
  // Fold the static meta in so the SA UI renders one shape.
  const platforms = board.map((b) => ({ ...SOCIAL_PLATFORM_META[b.platform], ...b }));
  return c.json(success({ platforms }));
});

adminSocialRoutes.get("/:platform/auth-url", async (c) => {
  const platform = c.req.param("platform").toLowerCase();
  if (!isSocialPlatform(platform)) return c.json(error("NOT_FOUND", `Unknown platform: ${platform}`), 404);
  if (!SOCIAL_PLATFORM_META[platform].supportsManagedLane) {
    return c.json(error("UNSUPPORTED", `${platform} has no managed lane`), 400);
  }
  try {
    const url = await buildService(c).buildAuthUrl({
      platform: platform as SocialPlatform,
      lane: "managed",
      scope: "managed",
      userId: c.var.user.sub as string, // the SuperAdmin connecting the brand account
      companyId: null,
      redirectTo: `${frontendBaseUrl()}${MANAGED_ACCOUNTS_PATH}`,
    });
    return c.json(success({ url }));
  } catch (err) {
    if (err instanceof SocialConnectionError) {
      return c.json(error(err.code, err.message), err.code === "NOT_CONFIGURED" ? 503 : 400);
    }
    throw err;
  }
});

adminSocialRoutes.post("/:platform/disconnect", async (c) => {
  const platform = c.req.param("platform").toLowerCase();
  if (!isSocialPlatform(platform)) return c.json(error("NOT_FOUND", `Unknown platform: ${platform}`), 404);
  const removed = await buildService(c).disconnectManaged(platform as SocialPlatform);
  await audit(c.var.user.sub as string, "managed_account.disconnect", platform);
  if (!removed) return c.json(error("NOT_FOUND", `No ${platform} brand account connected`), 404);
  return c.json(success(null, `${platform} brand account disconnected`));
});
