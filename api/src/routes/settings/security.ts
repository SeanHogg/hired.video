/**
 * /api/settings/security — overview (2FA, password, linked accounts),
 * active sessions, 2FA toggles. Thin adapters over
 * services/settings/securityService.
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { toHandlerResult } from "../../handlers/shared.js";
import { requireUser, sendHandlerResult } from "../helpers/routerHelpers.js";
import { readJsonBody } from "./http.js";
import { defaultSecuritySettings } from "../../services/user/settings.js";
import {
  disableTwoFactor,
  getSecurityOverview,
  listSessions,
  revokeUserSession,
  startTwoFactorEnrolment,
} from "../../services/settings/securityService.js";

export const settingsSecurityRoutes = new Hono<AppEnv>();

settingsSecurityRoutes.get("/security", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(await getSecurityOverview(auth.userId)), 200);
});

// Echo endpoint: security toggles are not persisted yet.
settingsSecurityRoutes.put("/security", async (c) => {
  const body = (await readJsonBody(c)) as Record<string, unknown>;
  return c.json(success({ ...defaultSecuritySettings(), ...body }), 200);
});

/** GET /api/settings/security/sessions: active (non-revoked, non-expired) sessions. */
settingsSecurityRoutes.get("/security/sessions", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(await listSessions(auth.userId)), 200);
});

/** DELETE /api/settings/security/sessions/:id: revoke one session. */
settingsSecurityRoutes.delete("/security/sessions/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return sendHandlerResult(c, await toHandlerResult(revokeUserSession(auth.userId, c.req.param("id"))));
});

settingsSecurityRoutes.post("/security/2fa/enable", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(startTwoFactorEnrolment()), 200);
});

settingsSecurityRoutes.post("/security/2fa/disable", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(await disableTwoFactor(auth.userId)), 200);
});
