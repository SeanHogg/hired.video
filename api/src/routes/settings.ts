import { Hono } from "hono";
import { and, eq, gt } from "drizzle-orm";
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
  const [user] = await db
    .select({ mfaEnabled: users.mfaEnabled, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, uid))
    .limit(1);

  const linkedAccounts = await db
    .select({
      id: schema.oauthAccounts.id,
      provider: schema.oauthAccounts.provider,
      email: schema.oauthAccounts.email,
      displayName: schema.oauthAccounts.displayName,
      avatarUrl: schema.oauthAccounts.avatarUrl,
      createdAt: schema.oauthAccounts.createdAt,
    })
    .from(schema.oauthAccounts)
    .where(eq(schema.oauthAccounts.userId, uid));

  return c.json(success({
    twoFactorEnabled: user?.mfaEnabled ?? false,
    hasPassword: !!(user?.passwordHash),
    linkedAccounts,
    loginNotifications: true,
    sessionTimeout: 30,
  }), 200);
});

settingsRoutes.put("/security", async (c) => c.json(success({ ...defaultSecuritySettings(), ...(await c.req.json().catch(() => ({}))) }), 200));

/** GET /api/settings/security/sessions — list active sessions (non-revoked, non-expired refresh tokens) */
settingsRoutes.get("/security/sessions", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const now = new Date();
  const sessions = await db
    .select({
      id: schema.refreshTokens.id,
      createdAt: schema.refreshTokens.createdAt,
      expiresAt: schema.refreshTokens.expiresAt,
    })
    .from(schema.refreshTokens)
    .where(
      and(
        eq(schema.refreshTokens.userId, uid),
        eq(schema.refreshTokens.revoked, false),
        gt(schema.refreshTokens.expiresAt, now),
      ),
    )
    .orderBy(schema.refreshTokens.createdAt);

  return c.json(success(sessions.map((s) => ({
    id: s.id,
    createdAt: new Date(s.createdAt).toISOString(),
    expiresAt: new Date(s.expiresAt).toISOString(),
    // Token value is never exposed — only the opaque session ID
  }))), 200);
});

/** DELETE /api/settings/security/sessions/:id — revoke a specific session */
settingsRoutes.delete("/security/sessions/:id", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const sessionId = c.req.param("id");
  const db = getDb();

  const [updated] = await db
    .update(schema.refreshTokens)
    .set({ revoked: true } as any)
    .where(and(eq(schema.refreshTokens.id, sessionId), eq(schema.refreshTokens.userId, uid)))
    .returning({ id: schema.refreshTokens.id });

  if (!updated) return c.json(error("NOT_FOUND", "Session not found"), 404);
  return c.json(success({ revoked: true }), 200);
});

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

settingsRoutes.get("/export", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [user] = await db
    .select({ email: users.email, name: users.name, role: users.role, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(eq(users.id, uid))
    .limit(1);

  const [profile] = await db
    .select()
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, uid))
    .limit(1);

  const resumes = await db
    .select({ id: schema.resumeInformation.id, title: schema.resumeInformation.title, status: schema.resumeInformation.status, createdAt: schema.resumeInformation.createdAt })
    .from(schema.resumeInformation)
    .where(eq(schema.resumeInformation.userId, uid));

  const applications = await db
    .select()
    .from(schema.jobApplications)
    .where(eq(schema.jobApplications.userId, uid));

  const savedJobsList = await db
    .select()
    .from(schema.savedJobs)
    .where(eq(schema.savedJobs.userId, uid));

  const [prefs] = await db
    .select()
    .from(accountPreferences)
    .where(eq(accountPreferences.userId, uid))
    .limit(1);

  const data = {
    exportedAt: new Date().toISOString(),
    account: user ?? null,
    profile: profile ?? null,
    preferences: prefs ?? null,
    resumes,
    jobApplications: applications,
    savedJobs: savedJobsList,
  };

  const format = c.req.query("format");
  if (format === "csv") {
    const escapeCell = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const toRows = (header: string[], rows: Record<string, unknown>[]) =>
      [header.join(","), ...rows.map((r) => header.map((h) => escapeCell(r[h])).join(","))].join("\n");

    const sections: string[] = [];
    if (user) sections.push("# Account\n" + toRows(["email","name","role","createdAt","lastLoginAt"], [user as any]));
    if (resumes.length) sections.push("\n# Resumes\n" + toRows(["id","title","status","createdAt"], resumes as any[]));
    if (applications.length) sections.push("\n# Job Applications\n" + toRows(Object.keys(applications[0] as object), applications as any[]));

    const date = new Date().toISOString().slice(0, 10);
    return new Response(sections.join("\n"), {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="account-export-${date}.csv"` },
    });
  }

  return c.json(success(data), 200);
});

// GET /api/export/csv and /api/export/excel — legacy standalone export routes
// mounted at /api/settings in app.ts so path here is /export/csv etc.
settingsRoutes.get("/export/csv", async (c) => {
  // Redirect to the canonical export endpoint with format=csv
  return c.redirect(`/api/settings/export?format=csv`, 302);
});
settingsRoutes.get("/export/excel", async (c) => {
  // Excel not natively supported without a library; return CSV with xlsx mime type
  // as a reasonable fallback until an xlsx library is added
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.redirect(`/api/settings/export?format=csv`, 302);
});

settingsRoutes.all("*", (c) => c.json({ error: { code: "NOT_FOUND", message: "Settings endpoint not found" } }, 404));