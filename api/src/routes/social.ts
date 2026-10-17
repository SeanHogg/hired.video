/**
 * /api/social/* — social publishing connection layer, both lanes (PRD §5.0).
 *
 * Every endpoint takes an optional `?lane=`:
 *   (default)       the caller's OWN connections (Lane B / self), scoped to
 *                   the `?workspace=` owner via the canActFor SSoT.
 *   `lane=managed`  hired.video's brand-managed accounts (Lane A, PRD §4.4) —
 *                   SuperAdmin-gated by `superAdminMiddleware` below.
 *
 * Mounted behind the standard auth middleware EXCEPT the OAuth callback,
 * which is a top-level browser navigation (no Authorization header survives
 * the consent-screen redirect) and rides the signed `state` instead — so the
 * `/api/social/oauth/callback` path is in PUBLIC_PREFIXES (app.ts). The lane
 * comes from the signed state (see social-oauth-callback.ts).
 *
 * Routes:
 *   GET  /api/social/platforms[?lane=managed]          — self: registry + lane availability
 *                                                        (optional auth); managed: SA status board
 *   GET  /api/social/connections                       — the caller's own connections
 *   GET  /api/social/:platform/auth-url[?lane=managed] — start OAuth (returns { url })
 *   GET  /api/social/oauth/callback                    — OAuth exchange (public, browser nav)
 *   POST /api/social/:platform/disconnect[?lane=managed] — drop the connection / brand account
 *
 * Publishing is POST /api/studio/projects/:id/publish/social/:platform.
 */
import { Hono, type Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
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
import { parseWorkspaceParam } from "../services/paid-media/oauth.js";
import { resolveWorkspaceForWrite, WorkspaceForbiddenError } from "../services/studio/workspace.js";
import { frontendBaseUrl } from "../utils/public-urls.js";
import { socialConnectionServiceFor } from "../services/social/social-connection-factory.js";
import { recordManagedAccountAudit } from "../services/social/managed-account-audit.js";
import { socialOAuthCallbackHandler, SOCIAL_CALLBACK_FALLBACK_PATH } from "./social-oauth-callback.js";

export const socialRoutes = new Hono<AppEnv>();

type Ctx = Context<AppEnv>;

function buildService(c: Ctx): SocialConnectionService {
  return socialConnectionServiceFor(c.env);
}

function isManagedLane(c: Ctx): boolean {
  return c.req.query("lane") === "managed";
}

/** Resolve the workspace owner the connection belongs to, via the canActFor
 *  SSoT (personal / company / delegated). Throws WorkspaceForbiddenError. */
async function resolveOwner(c: Ctx): Promise<{ ownerUserId: string; ownerCompanyId: string | null }> {
  const userId = c.var.user.sub as string;
  const selection = parseWorkspaceParam(c.req.query("workspace") ?? "personal");
  const ctx = await resolveWorkspaceForWrite(userId, selection);
  return { ownerUserId: ctx.ownerUserId, ownerCompanyId: ctx.ownerCompanyId };
}

/** The OAuth return target — only ever a page on our own frontend, so the
 *  callback can't be used as an open redirect. */
function safeRedirectTo(requested: string | undefined): string {
  const base = frontendBaseUrl();
  const fallback = `${base}${SOCIAL_CALLBACK_FALLBACK_PATH.self}`;
  if (!requested) return fallback;
  try {
    const url = new URL(requested, base);
    return url.origin === new URL(base).origin ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function workspaceForbidden(c: Ctx, err: WorkspaceForbiddenError) {
  return c.json(error("WORKSPACE_FORBIDDEN", err.message), 403);
}

// ─── OAuth callback (public — browser navigation) ────────────────────────────
// Fixed path (platform + lane ride the signed state) so one redirect URI per
// lane needs registering in each developer console. Registered BEFORE the
// managed-lane gate; it carries no `lane` query param anyway.
socialRoutes.get("/oauth/callback", socialOAuthCallbackHandler);

// ─── Lane A gate: every `?lane=managed` request is SuperAdmin-only ───────────
socialRoutes.use("*", async (c, next) => (isManagedLane(c) ? superAdminMiddleware(c, next) : next()));

// ─── Discovery ───────────────────────────────────────────────────────────────
socialRoutes.get("/platforms", async (c) => {
  if (isManagedLane(c)) {
    const board = await buildService(c).managedStatusBoard();
    // Fold the static meta in so the SA UI renders one shape.
    const platforms = board.map((b) => ({ ...SOCIAL_PLATFORM_META[b.platform], ...b }));
    return c.json(success({ platforms }));
  }
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
    if (err instanceof WorkspaceForbiddenError) return workspaceForbidden(c, err);
    throw err;
  }
});

socialRoutes.get("/connections", async (c) => {
  try {
    const { ownerUserId, ownerCompanyId } = await resolveOwner(c);
    const connections = await buildService(c).listUserConnections(ownerUserId, ownerCompanyId);
    return c.json(success({ connections }));
  } catch (err) {
    if (err instanceof WorkspaceForbiddenError) return workspaceForbidden(c, err);
    throw err;
  }
});

// ─── OAuth start ─────────────────────────────────────────────────────────────
socialRoutes.get("/:platform/auth-url", async (c) => {
  const platform = c.req.param("platform").toLowerCase();
  if (!isSocialPlatform(platform)) return c.json(error("NOT_FOUND", `Unknown platform: ${platform}`), 404);
  const managed = isManagedLane(c);
  const meta = SOCIAL_PLATFORM_META[platform];
  if (managed && !meta.supportsManagedLane) {
    return c.json(error("UNSUPPORTED", `${platform} has no managed lane`), 400);
  }
  if (!managed && !meta.supportsSelfLane) {
    return c.json(error("UNSUPPORTED", `${platform} does not support self-publishing`), 400);
  }
  try {
    const url = managed
      ? await buildService(c).buildAuthUrl({
          platform: platform as SocialPlatform,
          lane: "managed",
          scope: "managed",
          userId: c.var.user.sub as string, // the SuperAdmin connecting the brand account
          companyId: null,
          redirectTo: `${frontendBaseUrl()}${SOCIAL_CALLBACK_FALLBACK_PATH.managed}`,
        })
      : await (async () => {
          const { ownerUserId, ownerCompanyId } = await resolveOwner(c);
          return buildService(c).buildAuthUrl({
            platform: platform as SocialPlatform,
            lane: "self",
            scope: "self",
            userId: ownerUserId,
            companyId: ownerCompanyId,
            redirectTo: safeRedirectTo(c.req.query("redirectTo")),
          });
        })();
    return c.json(success({ url }));
  } catch (err) {
    if (err instanceof WorkspaceForbiddenError) return workspaceForbidden(c, err);
    if (err instanceof SocialConnectionError) return c.json(error(err.code, err.message), err.code === "NOT_CONFIGURED" ? 503 : 400);
    throw err;
  }
});

// ─── Disconnect ──────────────────────────────────────────────────────────────
socialRoutes.post("/:platform/disconnect", async (c) => {
  const platform = c.req.param("platform").toLowerCase();
  if (!isSocialPlatform(platform)) return c.json(error("NOT_FOUND", `Unknown platform: ${platform}`), 404);
  if (isManagedLane(c)) {
    const removed = await buildService(c).disconnectManaged(platform as SocialPlatform);
    await recordManagedAccountAudit(c.var.user.sub as string, "managed_account.disconnect", platform);
    if (!removed) return c.json(error("NOT_FOUND", `No ${platform} brand account connected`), 404);
    return c.json(success(null, `${platform} brand account disconnected`));
  }
  try {
    const { ownerUserId, ownerCompanyId } = await resolveOwner(c);
    const removed = await buildService(c).disconnectSelf(ownerUserId, ownerCompanyId, platform as SocialPlatform);
    if (!removed) return c.json(error("NOT_FOUND", `No ${platform} connection`), 404);
    return c.json(success(null, `${platform} disconnected`));
  } catch (err) {
    if (err instanceof WorkspaceForbiddenError) return workspaceForbidden(c, err);
    throw err;
  }
});
