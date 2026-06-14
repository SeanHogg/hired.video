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
import { buildRepos } from "../repositories/index.js";
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

const { adminAuditLog } = schema;

export const adminSocialRoutes = new Hono<AppEnv>();

function envOf(c: any) {
  return (c.env ?? process.env) as { SOCIAL_KMS_KEY?: string; PAID_MEDIA_KMS_KEY?: string; FRONTEND_URL?: string };
}
function buildService(c: any): SocialConnectionService {
  return new SocialConnectionService(buildRepos(getDb()), envOf(c));
}
function frontendBase(c: any): string {
  return (envOf(c).FRONTEND_URL ?? "https://hired.video").split(",")[0]!.trim();
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
adminSocialRoutes.get("/oauth/callback", async (c) => {
  const base = frontendBase(c);
  const dest = (status: string, platform = "", extra = "") =>
    `${base}/admin/social-accounts?status=${status}${platform ? `&platform=${platform}` : ""}${extra}`;

  const code = c.req.query("code");
  const state = c.req.query("state");
  const platformErr = c.req.query("error") || c.req.query("error_description");
  if (platformErr) return c.redirect(dest("error", "", `&reason=${encodeURIComponent(platformErr)}`));
  if (!code || !state) return c.redirect(dest("error", "", "&reason=missing_code_or_state"));

  try {
    const { state: verified, handle } = await buildService(c).completeCallback(state, code);
    if (verified.scope !== "managed") return c.redirect(dest("error", verified.platform, "&reason=wrong_scope"));
    return c.redirect(dest("connected", verified.platform, handle ? `&handle=${encodeURIComponent(handle)}` : ""));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.redirect(dest("error", "", `&reason=${encodeURIComponent(msg.slice(0, 200))}`));
  }
});

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
      redirectTo: `${frontendBase(c)}/admin/social-accounts`,
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
