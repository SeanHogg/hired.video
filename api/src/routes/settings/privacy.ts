/**
 * /api/settings privacy surfaces — privacy toggles, cookie preferences
 * (shared by the public /cookies page + Settings → Cookies) and the
 * CCPA/CPRA do-not-share flag.
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { readJsonBody } from "./http.js";
import {
  getCookiePreferences,
  getPrivacy,
  updateCookiePreferences,
  updatePrivacy,
} from "../../services/settings/preferencesService.js";
import { getDoNotShare, updateDoNotShare } from "../../services/settings/securityService.js";

export const settingsPrivacyRoutes = new Hono<AppEnv>();

settingsPrivacyRoutes.get("/privacy", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getPrivacy(userId)), 200);
});

settingsPrivacyRoutes.put("/privacy", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await updatePrivacy(userId, await readJsonBody(c))), 200);
});

settingsPrivacyRoutes.get("/cookies", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getCookiePreferences(userId)), 200);
});

settingsPrivacyRoutes.put("/cookies", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await updateCookiePreferences(userId, await readJsonBody(c))), 200);
});

settingsPrivacyRoutes.get("/privacy/do-not-share", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getDoNotShare(userId)), 200);
});

settingsPrivacyRoutes.put("/privacy/do-not-share", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await updateDoNotShare(userId, await readJsonBody(c))), 200);
});
