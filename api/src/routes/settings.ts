import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  defaultAccountSettings,
  defaultJobPreferences,
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  defaultSecuritySettings,
} from "../services/settings.js";

const { accountPreferences, jobPreferences, users } = schema;

export const settingsRoutes = new Hono<{ Variables: Variables }>();

function userId(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

settingsRoutes.get("/", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [prefs] = await db.select().from(accountPreferences).where(eq(accountPreferences.userId, uid)).limit(1);
  const [jobPrefs] = await db.select().from(jobPreferences).where(eq(jobPreferences.userId, uid)).limit(1);
  const [user] = await db.select({ mfaEnabled: users.mfaEnabled }).from(users).where(eq(users.id, uid)).limit(1);

  return c.json(success({
    notifications: {
      emailJobMatches: prefs?.emailNotificationsEnabled ?? true,
      emailApplicationUpdates: prefs?.emailNotificationsEnabled ?? true,
      emailMessages: prefs?.emailNotificationsEnabled ?? true,
      emailConnectionRequests: prefs?.emailNotificationsEnabled ?? true,
      emailWeeklyDigest: prefs?.weeklyDigestEnabled ?? true,
      emailMarketingUpdates: prefs?.marketingEmailsEnabled ?? false,
      pushJobMatches: true, pushApplicationUpdates: true, pushMessages: true, pushConnectionRequests: true,
      smsImportantUpdates: false, smsSecurityAlerts: true,
    },
    privacy: defaultPrivacyPreferences(),
    jobPreferences: jobPrefs ? {
      ...defaultJobPreferences(),
      desiredTitle: jobPrefs.desiredTitle,
      desiredLocation: jobPrefs.desiredLocation,
      remoteOnly: jobPrefs.remotePreference === "remote",
      minSalaryExpectation: jobPrefs.salaryMin ? Number(jobPrefs.salaryMin) : null,
      maxSalaryExpectation: jobPrefs.salaryMax ? Number(jobPrefs.salaryMax) : null,
      isOpenToWork: jobPrefs.isOpenToWork,
    } : defaultJobPreferences(),
    account: { theme: prefs?.theme ?? "system", language: prefs?.language ?? "en", currency: prefs?.currency ?? "USD", dateFormat: "MM/DD/YYYY", timezone: "UTC" },
    security: { twoFactorEnabled: user?.mfaEnabled ?? false, loginNotifications: true, sessionTimeout: 30, allowedDevices: [] },
  }), 200);
});

settingsRoutes.get("/notifications", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [prefs] = await db.select().from(accountPreferences).where(eq(accountPreferences.userId, uid)).limit(1);
  if (!prefs) return c.json(success(defaultNotificationPreferences()), 200);
  return c.json(success({ ...defaultNotificationPreferences(), emailJobMatches: prefs.emailNotificationsEnabled, emailApplicationUpdates: prefs.emailNotificationsEnabled, emailMessages: prefs.emailNotificationsEnabled, emailConnectionRequests: prefs.emailNotificationsEnabled, emailWeeklyDigest: prefs.weeklyDigestEnabled, emailMarketingUpdates: prefs.marketingEmailsEnabled, jobAlertEmailsEnabled: prefs.jobAlertEmailsEnabled }), 200);
});

settingsRoutes.put("/notifications", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const updates = { emailNotificationsEnabled: body.emailJobMatches ?? body.emailMessages ?? true, marketingEmailsEnabled: body.emailMarketingUpdates ?? false, jobAlertEmailsEnabled: body.jobAlertEmailsEnabled ?? true, weeklyDigestEnabled: body.emailWeeklyDigest ?? true, updatedAt: new Date() };
  await db.insert(accountPreferences).values({ userId: uid, ...updates } as any).onConflictDoUpdate({ target: accountPreferences.userId, set: updates as any });
  return c.json(success({ ...defaultNotificationPreferences(), ...body }), 200);
});

settingsRoutes.get("/privacy", (c) => c.json(success(defaultPrivacyPreferences()), 200));
settingsRoutes.put("/privacy", async (c) => c.json(success({ ...defaultPrivacyPreferences(), ...(await c.req.json().catch(() => ({}))) }), 200));

settingsRoutes.get("/job-preferences", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [prefs] = await db.select().from(jobPreferences).where(eq(jobPreferences.userId, uid)).limit(1);
  if (!prefs) return c.json(success(defaultJobPreferences()), 200);
  return c.json(success({ ...defaultJobPreferences(), desiredTitle: prefs.desiredTitle, desiredLocation: prefs.desiredLocation, remoteOnly: prefs.remotePreference === "remote", minSalaryExpectation: prefs.salaryMin ? Number(prefs.salaryMin) : null, maxSalaryExpectation: prefs.salaryMax ? Number(prefs.salaryMax) : null, isOpenToWork: prefs.isOpenToWork }), 200);
});

settingsRoutes.put("/job-preferences", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const updates = { desiredTitle: body.desiredTitle ?? null, desiredLocation: body.desiredLocation ?? null, remotePreference: body.remoteOnly ? "remote" : "any", salaryMin: body.minSalaryExpectation ?? null, salaryMax: body.maxSalaryExpectation ?? null, isOpenToWork: body.isOpenToWork ?? false, updatedAt: new Date() };
  await db.insert(jobPreferences).values({ userId: uid, ...updates as any }).onConflictDoUpdate({ target: jobPreferences.userId, set: updates as any });
  return c.json(success({ ...defaultJobPreferences(), ...body }), 200);
});

settingsRoutes.get("/account", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [prefs] = await db.select().from(accountPreferences).where(eq(accountPreferences.userId, uid)).limit(1);
  return c.json(success({ theme: prefs?.theme ?? "system", language: prefs?.language ?? "en", currency: prefs?.currency ?? "USD", dateFormat: "MM/DD/YYYY", timezone: "UTC" }), 200);
});

settingsRoutes.put("/account", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.theme) updates.theme = body.theme;
  if (body.language) updates.language = body.language;
  if (body.currency) updates.currency = body.currency;
  await db.insert(accountPreferences).values({ userId: uid, ...updates as any }).onConflictDoUpdate({ target: accountPreferences.userId, set: updates });
  return c.json(success({ ...defaultAccountSettings(), ...body }), 200);
});

settingsRoutes.get("/security", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [user] = await db.select({ mfaEnabled: users.mfaEnabled }).from(users).where(eq(users.id, uid)).limit(1);
  return c.json(success({ twoFactorEnabled: user?.mfaEnabled ?? false, loginNotifications: true, sessionTimeout: 30, allowedDevices: [] }), 200);
});

settingsRoutes.put("/security", async (c) => c.json(success({ ...defaultSecuritySettings(), ...(await c.req.json().catch(() => ({}))) }), 200));

settingsRoutes.post("/security/2fa/enable", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const backupCodes = Array.from({ length: 8 }, () => Array.from(crypto.getRandomValues(new Uint8Array(4))).map((b) => b.toString(16).padStart(2, "0")).join(""));
  return c.json(success({ qrCode: "https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=otpauth%3A%2F%2Ftotp%2Fhired.video", backupCodes }), 200);
});

settingsRoutes.post("/security/2fa/disable", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  await db.update(users).set({ mfaEnabled: false, mfaSecret: null } as any).where(eq(users.id, uid));
  return c.json(success({ success: true }), 200);
});

settingsRoutes.get("/export", (c) => c.json(success({ message: "Export started. You will receive an email when your data is ready." }), 200));

settingsRoutes.all("*", (c) => c.json({ error: { code: "NOT_FOUND", message: "Settings endpoint not found" } }, 404));