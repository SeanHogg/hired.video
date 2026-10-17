/**
 * /api/settings — aggregate settings + notification, job, account and
 * extension preferences. Thin adapters over services/settings/preferencesService.
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { readJsonBody } from "./http.js";
import {
  getAccountSettings,
  getAllSettings,
  getExtensionSettings,
  getJobPreferences,
  getNotificationSettings,
  updateAccountSettings,
  updateExtensionSettings,
  updateJobPreferences,
  updateNotificationSettings,
} from "../../services/settings/preferencesService.js";

export const settingsPreferenceRoutes = new Hono<AppEnv>();

settingsPreferenceRoutes.get("/", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(await getAllSettings(auth.userId)), 200);
});

settingsPreferenceRoutes.get("/notifications", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(await getNotificationSettings(auth.userId)), 200);
});

settingsPreferenceRoutes.put("/notifications", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(await updateNotificationSettings(auth.userId, await readJsonBody(c))), 200);
});

settingsPreferenceRoutes.get("/job-preferences", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(await getJobPreferences(auth.userId)), 200);
});

settingsPreferenceRoutes.put("/job-preferences", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(await updateJobPreferences(auth.userId, await readJsonBody(c))), 200);
});

settingsPreferenceRoutes.get("/account", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(await getAccountSettings(auth.userId)), 200);
});

settingsPreferenceRoutes.put("/account", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const roles = (c.var.user?.roles as string[] | undefined) ?? [];
  return c.json(success(await updateAccountSettings(auth.userId, await readJsonBody(c), roles)), 200);
});

settingsPreferenceRoutes.get("/extension-preferences", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(await getExtensionSettings(auth.userId)), 200);
});

settingsPreferenceRoutes.put("/extension-preferences", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(await updateExtensionSettings(auth.userId, await readJsonBody(c))), 200);
});
