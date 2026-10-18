// oauth.ts — /api/auth/oauth: social sign-in (Google / LinkedIn / GitHub /
// Microsoft), the legacy magic-link pair, linked-account management and
// device sessions. Thin HTTP layer — the use cases live in
// services/auth/oauthLogin.ts and services/auth/oauthAccount.ts.

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { extractClientIp, extractUserAgent } from "../services/auth/deps.js";
import { handleOAuthCallback, startOAuth } from "../services/auth/oauthLogin.js";
import {
  addPassword,
  getLinkedAccounts,
  listUserSessions,
  requestLegacyMagicLink,
  revokeOtherSessions,
  revokeUserSession,
  unlinkProvider,
  verifyLegacyMagicLink,
} from "../services/auth/oauthAccount.js";

export const oauthRoutes = new Hono<AppEnv>();

// ============================================================================
// OAuth provider routes
// ============================================================================

oauthRoutes.get("/:provider", async (c) => {
  const q = (k: string) => c.req.query(k) || undefined;
  const url = await startOAuth(c.req.param("provider").toLowerCase(), {
    redirect: c.req.query("redirect") || "/dashboard",
    // Present when connecting from Settings (already logged in).
    linkToken: q("link_token"),
    // Inbound attribution forwarded by the frontend OAuth button so affiliate
    // credit + campaign UTMs survive the handshake (gap #1683).
    attribution: {
      ref: q("ref"),
      utmSource: q("utm_source"),
      utmMedium: q("utm_medium"),
      utmCampaign: q("utm_campaign"),
      utmTerm: q("utm_term"),
      utmContent: q("utm_content"),
      landingReferrer: q("landing_referrer"),
    },
    // Signup intent from the affiliate / creator landing pages (or any
    // signup surface that passes ?role=) — validated + signed into state.
    intent: {
      role: q("role"),
      enableAffiliate: c.req.query("affiliate") === "1" || c.req.query("affiliate") === "true",
    },
  });
  return c.redirect(url);
});

oauthRoutes.get("/:provider/callback", async (c) => {
  const url = await handleOAuthCallback(
    c.req.param("provider").toLowerCase(),
    { code: c.req.query("code"), state: c.req.query("state"), error: c.req.query("error") },
    {
      ipAddress: extractClientIp(c),
      userAgent: extractUserAgent(c),
      waitUntil: (p) => c.executionCtx.waitUntil(p),
    },
  );
  return c.redirect(url);
});

// ============================================================================
// Magic Link routes (legacy pair under /api/auth/oauth)
// ============================================================================

oauthRoutes.post("/magic-link", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.email || typeof body.email !== "string") {
    return c.json(error("VALIDATION_ERROR", "Email is required"), 400);
  }

  await requestLegacyMagicLink(
    body.email.toLowerCase().trim(),
    (body.redirect as string | undefined) || "/dashboard",
    (p) => c.executionCtx.waitUntil(p),
  );
  return c.json(success(null, "If an account exists for that email, a sign-in link has been sent"));
});

oauthRoutes.get("/magic-link/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json(error("VALIDATION_ERROR", "Token is required"), 400);

  const result = await verifyLegacyMagicLink(token, { ipAddress: extractClientIp(c), userAgent: extractUserAgent(c) });
  return c.json(success(result));
});

// ============================================================================
// Linked accounts management (authenticated)
// ============================================================================

// `/api/auth/*` is a PUBLIC prefix in app.ts (login/sign-up flows), so the
// global auth layer never attaches c.var.user here. These account-scoped
// routes verify the bearer themselves — without this every call 401'd.
for (const path of ["/linked-accounts", "/unlink/*", "/add-password", "/sessions", "/sessions/*"]) {
  oauthRoutes.use(path, authMiddleware);
}

oauthRoutes.get("/linked-accounts", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await getLinkedAccounts(uid)));
});

oauthRoutes.delete("/unlink/:provider", async (c) => {
  const uid = requireUser(c);
  const name = c.req.param("provider").toLowerCase();
  await unlinkProvider(uid, name);
  return c.json(success(null, `${name} account unlinked`));
});

oauthRoutes.post("/add-password", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => null);
  if (!body?.password || body.password.length < 8) {
    return c.json(error("VALIDATION_ERROR", "Password must be at least 8 characters"), 400);
  }
  await addPassword(uid, String(body.password));
  return c.json(success(null, "Password set successfully"));
});

// Session management — backed by the `sessions` table (migration 0060).
// Rich device metadata for /security/sessions; `current` lets the
// SessionRow disable revoke on the caller's own device.
oauthRoutes.get("/sessions", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await listUserSessions(uid, c.var.user?.sid)));
});

oauthRoutes.delete("/sessions/:id", async (c) => {
  const uid = requireUser(c);
  await revokeUserSession(uid, c.req.param("id"));
  return c.json(success(null, "Session revoked"));
});

oauthRoutes.delete("/sessions", async (c) => {
  const uid = requireUser(c);
  // "Log out other devices" preserves the current session.
  await revokeOtherSessions(uid, c.var.user?.sid);
  return c.json(success(null, "All other sessions revoked"));
});
