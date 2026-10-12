/**
 * /api/social/* — social publishing connection layer (Lane B + discovery).
 *
 * Mounted behind the standard auth middleware EXCEPT the OAuth callback,
 * which is a top-level browser navigation (no Authorization header survives
 * the consent-screen redirect) and rides the signed `state` instead — so
 * the `/api/social/oauth/callback` path is registered in PUBLIC_PREFIXES (app.ts).
 *
 * Routes:
 *   GET  /api/social/platforms              — registry + lane availability (optional auth:
 *                                             signed-out visitors get platform state only)
 *   GET  /api/social/connections            — the caller's own connections
 *   GET  /api/social/:platform/auth-url     — start Lane B OAuth (returns { url })
 *   GET  /api/social/:platform/callback     — OAuth exchange (public, browser nav)
 *   POST /api/social/:platform/disconnect   — drop the caller's connection
 *
 * Publishing itself is Phase 2 — this file is the connection layer (PRD §5.0).
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import {
  SOCIAL_PLATFORM_META,
  isSocialPlatform,
  type SocialPlatform,
} from "../../../shared/social-platforms.js";
import {
  SocialConnectionService,
  SocialConnectionError,
} from "../services/social/social-connection-service.js";
import {
  parseWorkspaceParam,
} from "../services/paid-media/oauth.js";
import { resolveWorkspaceForWrite, WorkspaceForbiddenError } from "../services/studio/workspace.js";
import { frontendBaseUrl } from "../utils/public-urls.js";
import { socialConnectionServiceFor } from "../services/social/social-connection-factory.js";

export const socialRoutes = new Hono<AppEnv>();

function buildService(c: any): SocialConnectionService {
  return socialConnectionServiceFor(c.env);
}

/** Resolve the workspace owner the connection belongs to, via the canActFor
 *  SSoT (personal / company / delegated). Throws WorkspaceForbiddenError. */
async function resolveOwner(c: any): Promise<{ ownerUserId: string; ownerCompanyId: string | null }> {
  const userId = c.var.user.sub as string;
  const selection = parseWorkspaceParam(c.req.query("workspace") ?? "personal");
  const ctx = await resolveWorkspaceForWrite(userId, selection, { db: getDb() });
  return { ownerUserId: ctx.ownerUserId, ownerCompanyId: ctx.ownerCompanyId };
}

/** The OAuth return target — only ever a page on our own frontend, so the
 *  callback can't be used as an open redirect. */
function safeRedirectTo(requested: string | undefined): string {
  const base = frontendBaseUrl();
  const fallback = `${base}/settings/connections`;
  if (!requested) return fallback;
  try {
    const url = new URL(requested, base);
    return url.origin === new URL(base).origin ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

// ─── Discovery ───────────────────────────────────────────────────────────────
socialRoutes.get("/platforms", async (c) => {
  try {
    // Optional auth (app.ts): the Post dock asks before anyone signs in.
    const owner = c.var.user ? await resolveOwner(c) : null;
    const availability = await buildService(c).resolveLaneAvailability({
      userId: owner?.ownerUserId ?? null,
      companyId: owner?.ownerCompanyId ?? null,
    });
    // Merge static meta + per-user lane state so the client renders from one shape.
    const platforms = availability.map((a) => ({
      ...SOCIAL_PLATFORM_META[a.platform],
      managed: a.managed,
      self: a.self,
      selfConnected: a.selfConnected,
    }));
    return c.json(success({ platforms }));
  } catch (err) {
    if (err instanceof WorkspaceForbiddenError) return c.json(error("WORKSPACE_FORBIDDEN", err.message), 403);
    throw err;
  }
});

socialRoutes.get("/connections", async (c) => {
  try {
    const { ownerUserId, ownerCompanyId } = await resolveOwner(c);
    const connections = await buildService(c).listUserConnections(ownerUserId, ownerCompanyId);
    return c.json(success({ connections }));
  } catch (err) {
    if (err instanceof WorkspaceForbiddenError) return c.json(error("WORKSPACE_FORBIDDEN", err.message), 403);
    throw err;
  }
});

// ─── OAuth start (Lane B / self) ──────────────────────────────────────────────
socialRoutes.get("/:platform/auth-url", async (c) => {
  const platform = c.req.param("platform").toLowerCase();
  if (!isSocialPlatform(platform)) return c.json(error("NOT_FOUND", `Unknown platform: ${platform}`), 404);
  if (!SOCIAL_PLATFORM_META[platform].supportsSelfLane) {
    return c.json(error("UNSUPPORTED", `${platform} does not support self-publishing`), 400);
  }
  try {
    const { ownerUserId, ownerCompanyId } = await resolveOwner(c);
    const redirectTo = safeRedirectTo(c.req.query("redirectTo"));
    const url = await buildService(c).buildAuthUrl({
      platform: platform as SocialPlatform,
      lane: "self",
      scope: "self",
      userId: ownerUserId,
      companyId: ownerCompanyId,
      redirectTo,
    });
    return c.json(success({ url }));
  } catch (err) {
    if (err instanceof WorkspaceForbiddenError) return c.json(error("WORKSPACE_FORBIDDEN", err.message), 403);
    if (err instanceof SocialConnectionError) return c.json(error(err.code, err.message), err.code === "NOT_CONFIGURED" ? 503 : 400);
    throw err;
  }
});

// ─── OAuth callback (public — browser navigation) ────────────────────────────
// Fixed path (platform rides the signed state) so only one redirect URI per
// developer console needs registering. Self scope only — a managed-scope
// state would be a mismatch (managed callbacks land on /api/admin/social).
socialRoutes.get("/oauth/callback", async (c) => {
  const base = frontendBaseUrl();
  const dest = (status: string, platform = "", extra = "") =>
    `${base}/settings/connections?status=${status}${platform ? `&platform=${platform}` : ""}${extra}`;

  const code = c.req.query("code");
  const state = c.req.query("state");
  const platformErr = c.req.query("error") || c.req.query("error_description");
  if (platformErr) return c.redirect(dest("error", "", `&reason=${encodeURIComponent(platformErr)}`));
  if (!code || !state) return c.redirect(dest("error", "", "&reason=missing_code_or_state"));

  try {
    const { state: verified, handle } = await buildService(c).completeCallback(state, code);
    if (verified.scope !== "self") return c.redirect(dest("error", verified.platform, "&reason=wrong_scope"));
    const target = verified.redirectTo || dest("connected", verified.platform);
    const sep = target.includes("?") ? "&" : "?";
    return c.redirect(`${target}${sep}status=connected&platform=${verified.platform}${handle ? `&handle=${encodeURIComponent(handle)}` : ""}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.redirect(dest("error", "", `&reason=${encodeURIComponent(msg.slice(0, 200))}`));
  }
});

// ─── Disconnect ──────────────────────────────────────────────────────────────
socialRoutes.post("/:platform/disconnect", async (c) => {
  const platform = c.req.param("platform").toLowerCase();
  if (!isSocialPlatform(platform)) return c.json(error("NOT_FOUND", `Unknown platform: ${platform}`), 404);
  try {
    const { ownerUserId, ownerCompanyId } = await resolveOwner(c);
    const removed = await buildService(c).disconnectSelf(ownerUserId, ownerCompanyId, platform as SocialPlatform);
    if (!removed) return c.json(error("NOT_FOUND", `No ${platform} connection`), 404);
    return c.json(success(null, `${platform} disconnected`));
  } catch (err) {
    if (err instanceof WorkspaceForbiddenError) return c.json(error("WORKSPACE_FORBIDDEN", err.message), 403);
    throw err;
  }
});
