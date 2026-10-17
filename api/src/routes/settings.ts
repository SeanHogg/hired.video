/**
 * /api/settings/* (and the legacy /api/export/* alias mount) — thin
 * composition root. Sub-routers (routes/settings/):
 *   • preferences.ts — GET / aggregate, notifications, job-preferences,
 *                      account, extension-preferences
 *   • privacy.ts     — privacy toggles, cookies, privacy/do-not-share
 *   • security.ts    — security overview, sessions, 2FA
 *   • export.ts      — GDPR/CPRA data export (+ legacy csv/excel redirects)
 * Use cases live in services/settings/*; data access in
 * repositories/preferencesRepository.ts, userSettingsRepository.ts and
 * userDataExportRepository.ts.
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { settingsPreferenceRoutes } from "./settings/preferences.js";
import { settingsPrivacyRoutes } from "./settings/privacy.js";
import { settingsSecurityRoutes } from "./settings/security.js";
import { settingsExportRoutes } from "./settings/export.js";

export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.route("/", settingsPreferenceRoutes);
settingsRoutes.route("/", settingsPrivacyRoutes);
settingsRoutes.route("/", settingsSecurityRoutes);
settingsRoutes.route("/", settingsExportRoutes);

settingsRoutes.all("*", (c) => c.json({ error: { code: "NOT_FOUND", message: "Settings endpoint not found" } }, 404));
