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
 *   POST /api/email/webhooks/sendpulse        — provider bounce/complaint → hard suppression (public)
 */
import { Hono } from "hono";
import { getEnv } from "../utils/env.js";
import type { AppEnv } from "../types/index.js";
import {
  getMyEmailPreferences,
  marketingConsentService as service,
  recordHardSuppressions,
  updateMyEmailPreferences,
} from "../services/email/emailPreferences.js";
import { extractHardSuppressions } from "../services/email/bounce-classifier.js";
import { UpdatePreferencesSchema } from "../../../shared/email-consent.js";
import { success, error } from "../types/index.js";
import { validateJson } from "./helpers/validate.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const emailPreferencesRoutes = new Hono<AppEnv>();

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
  if (!dto) return c.json(error("NOT_FOUND", "Invalid link"), 404);
  return c.json(success(dto), 200);
});

emailPreferencesRoutes.put("/preferences/token/:token", validateJson(UpdatePreferencesSchema, () => error("VALIDATION_ERROR", "Invalid body")), async (c) => {
  const body = c.req.valid("json");
  const dto = await service().updateByToken(c.req.param("token"), body);
  if (!dto) return c.json(error("NOT_FOUND", "Invalid link"), 404);
  return c.json(success(dto), 200);
});

// ── Authenticated /me (Settings panel) ───────────────────────────────────────
// Resolved by the caller's own email; 401 when signed out or the account has
// no email (services/email/emailPreferences.ts).
emailPreferencesRoutes.get("/preferences/me", async (c) => {
  const dto = await getMyEmailPreferences(requireUser(c));
  return c.json(success(dto), 200);
});

emailPreferencesRoutes.put("/preferences/me", validateJson(UpdatePreferencesSchema, () => error("VALIDATION_ERROR", "Invalid body")), async (c) => {
  const userId = requireUser(c);
  const dto = await updateMyEmailPreferences(userId, c.req.valid("json"));
  return c.json(success(dto), 200);
});

// ── Provider bounce/complaint webhook (#1975) ───────────────────────────────
//
// Public — posted by the email provider (SendPulse), not a logged-in user.
// Classifies hard bounces / spam complaints / blocks / provider-unsubscribes
// and records each address onto the non-reversible `email_suppressions` list so
// it drops out of every future marketing send. Soft/transient signals are
// ignored. When `EMAIL_WEBHOOK_SECRET` is set the caller must present it as
// `?key=` (configure the same value on the provider's webhook URL); when unset
// the endpoint is open (dev/test) — the worst a forged call can do is suppress
// an address from MARKETING mail, never leak data.
emailPreferencesRoutes.post("/webhooks/sendpulse", async (c) => {
  const required = getEnv("EMAIL_WEBHOOK_SECRET");
  if (required && c.req.query("key") !== required) {
    return c.json(error("UNAUTHORIZED", "Bad webhook key"), 401);
  }
  const body = await c.req.json().catch(() => null);
  const suppressions = extractHardSuppressions(body);
  await recordHardSuppressions(suppressions);
  // Always 200 so the provider doesn't retry-storm on a partially-bad batch.
  return c.json(success({ suppressed: suppressions.length }), 200);
});

export default emailPreferencesRoutes;
