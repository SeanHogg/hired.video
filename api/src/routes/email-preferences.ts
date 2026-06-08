/**
 * Email marketing preference center + unsubscribe. Mounted at /api/email.
 *
 * Token routes are PUBLIC (opened straight from an email link, no JWT) and
 * carry an OPAQUE token — never the email/PII. `/me` routes are authenticated
 * (the Settings panel) and resolve by the caller's own email.
 *
 *   GET  /api/email/unsubscribe/:token        — one-click unsubscribe-all (HTML, no JS)
 *   GET  /api/email/preferences/token/:token  — load prefs for the token
 *   PUT  /api/email/preferences/token/:token  — update prefs by token
 *   GET  /api/email/preferences/me            — load the signed-in user's prefs
 *   PUT  /api/email/preferences/me            — update the signed-in user's prefs
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { MarketingConsentService } from "../services/email/MarketingConsentService.js";
import { UpdatePreferencesSchema } from "../../../shared/email-consent.js";

export const emailPreferencesRoutes = new Hono<AppEnv>();

function service(): MarketingConsentService {
  return new MarketingConsentService(buildRepos(getDb()).emailConsent as any);
}

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f4f5;margin:0;padding:0;">
  <div style="max-width:480px;margin:64px auto;background:#fff;border-radius:12px;padding:32px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <h1 style="font-size:20px;color:#18181b;margin:0 0 12px;">${title}</h1>
    <p style="color:#52525b;line-height:1.6;margin:0 0 16px;">${body}</p>
  </div>
</body></html>`;
}

// ── One-click unsubscribe (no JS — CAN-SPAM) ────────────────────────────────
emailPreferencesRoutes.get("/unsubscribe/:token", async (c) => {
  const token = c.req.param("token");
  const result = await service().unsubscribeAllByToken(token);
  if (!result) {
    return c.html(page("Invalid link", "This unsubscribe link could not be verified."), 400);
  }
  const manageUrl = `/email-preferences/${token}`;
  return c.html(
    page(
      "You're unsubscribed",
      `${result.email} has been removed from hired.video marketing emails. You'll still receive essential account notifications. ` +
        `<br><br><a href="${manageUrl}" style="color:#2563eb;">Manage individual preferences instead</a>.`,
    ),
    200,
  );
});

// ── Preference center by token (public) ─────────────────────────────────────
emailPreferencesRoutes.get("/preferences/token/:token", async (c) => {
  const dto = await service().getByToken(c.req.param("token"));
  if (!dto) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Invalid link" } }, 404);
  return c.json(ok(dto), 200);
});

emailPreferencesRoutes.put("/preferences/token/:token", async (c) => {
  const parsed = UpdatePreferencesSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid body" } }, 400);
  }
  const dto = await service().updateByToken(c.req.param("token"), parsed.data);
  if (!dto) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Invalid link" } }, 404);
  return c.json(ok(dto), 200);
});

// ── Authenticated /me (Settings panel) ───────────────────────────────────────
async function resolveCallerEmail(c: any): Promise<{ email: string; userId: string } | null> {
  const userId = c.var.user?.sub as string | undefined;
  if (!userId) return null;
  const [row] = await getDb()
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!row?.email) return null;
  return { email: row.email, userId };
}

emailPreferencesRoutes.get("/preferences/me", async (c) => {
  const caller = await resolveCallerEmail(c);
  if (!caller) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);
  const dto = await service().getByEmail(caller.email, caller.userId);
  return c.json(ok(dto), 200);
});

emailPreferencesRoutes.put("/preferences/me", async (c) => {
  const caller = await resolveCallerEmail(c);
  if (!caller) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);
  const parsed = UpdatePreferencesSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid body" } }, 400);
  }
  const dto = await service().updateByEmail(caller.email, parsed.data, caller.userId);
  return c.json(ok(dto), 200);
});

export default emailPreferencesRoutes;
