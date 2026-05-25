/**
 * /api/errors/report — client-side error ingestion.
 *
 * Receives a normalized error payload from the frontend GlobalErrorHandler
 * / ErrorBoundary "Report" buttons and emails it to seanhogg@gmail.com
 * so a human gets nudged immediately for issues that aren't already in
 * dashboards.
 *
 * Email delivery is best-effort: a failure doesn't fail the request — the
 * user has done their part by clicking Report, and we'd rather log the
 * delivery failure than punish them with a 500.
 *
 * Public endpoint (no auth) because crashes can happen on the
 * unauthenticated login / signup pages too. Defended against abuse by:
 *   • A dedicated low-cap IP rate limiter (REPORT_*_LIMITS below).
 *   • Hono's built-in body size limit isn't enforced here, so we cap on
 *     the parsed payload.
 *   • Strict Zod schema — extra fields are stripped, sizes capped.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { ok } from "../utils/response.js";
import { sendGenericEmail } from "../services/adapters/email.js";
import { createIpRateLimiter, getClientIp } from "../middleware/rateLimiter.js";

// ── Schema ────────────────────────────────────────────────────────────────────

// Cap each field so a single report can't be megabytes. Total payload
// is implicitly capped by the longest fields combined.
const ErrorReportSchema = z.object({
  // What happened — the shortest summary we have.
  message: z.string().min(1).max(2000),
  // Where it came from — "boundary" (React error boundary), "api" (a
  // hired:api-error toast the user clicked Report on), or "manual"
  // (caught and explicitly reported by app code).
  source: z.enum(["boundary", "api", "manual"]).default("manual"),
  // Severity hint from the boundary level / API status. Free-form so
  // new sources can add their own.
  severity: z.string().max(32).optional(),
  // Stack trace, capped — anything bigger than 16k probably has noise.
  stack: z.string().max(16_384).optional(),
  // Where the user was when it broke.
  url: z.string().url().max(2048).optional(),
  userAgent: z.string().max(1024).optional(),
  // Client-generated ID so we can correlate with the user's screenshot.
  errorId: z.string().max(128).optional(),
  // Free-form blob: HTTP request that failed, recent API requests
  // snapshot, component stack, etc. We JSON-stringify with a length cap
  // so a hostile payload can't blow the email up.
  context: z.record(z.string(), z.unknown()).optional(),
  // Where the user types when prompted "what were you doing?" — null when
  // they don't add anything. Capped at 1k.
  userNote: z.string().max(1000).optional(),
});

type ErrorReport = z.infer<typeof ErrorReportSchema>;

// ── Rate limit ────────────────────────────────────────────────────────────────
// 30/h per IP — generous for a real user, hostile for a bot. Built from
// the shared createIpRateLimiter factory (middleware/rateLimiter.ts) so we
// have ONE source of truth for the per-IP-bucket pattern across the API.

const reportRateLimiter = createIpRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxAttempts: 30,
  message: "Too many error reports from this network.",
});

// ── Formatting ────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildEmailHtml(report: ErrorReport, clientIp: string): string {
  const fields: Array<[string, string]> = [
    ["Time", new Date().toISOString()],
    ["Source", report.source],
    ...(report.severity ? [["Severity", report.severity] as [string, string]] : []),
    ...(report.errorId ? [["Error ID", report.errorId] as [string, string]] : []),
    ...(report.url ? [["URL", report.url] as [string, string]] : []),
    ["Client IP", clientIp],
    ...(report.userAgent ? [["User-Agent", report.userAgent] as [string, string]] : []),
  ];

  const fieldsHtml = fields
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:4px 0;font-family:monospace;font-size:12px;">${escapeHtml(v)}</td></tr>`)
    .join("");

  const noteBlock = report.userNote
    ? `<h3 style="margin-top:24px;font-size:14px;">User note</h3><pre style="background:#f5f5f5;padding:12px;border-radius:4px;white-space:pre-wrap;font-size:13px;">${escapeHtml(report.userNote)}</pre>`
    : "";

  const stackBlock = report.stack
    ? `<h3 style="margin-top:24px;font-size:14px;">Stack trace</h3><pre style="background:#f5f5f5;padding:12px;border-radius:4px;white-space:pre-wrap;overflow-x:auto;font-size:11px;line-height:1.4;">${escapeHtml(report.stack)}</pre>`
    : "";

  let contextBlock = "";
  if (report.context) {
    const json = JSON.stringify(report.context, null, 2);
    // Cap rendered context at 32k so an inflated payload can't DoS the
    // mail provider.
    const capped = json.length > 32_000 ? `${json.slice(0, 32_000)}\n…(truncated)` : json;
    contextBlock = `<h3 style="margin-top:24px;font-size:14px;">Context</h3><pre style="background:#f5f5f5;padding:12px;border-radius:4px;white-space:pre-wrap;overflow-x:auto;font-size:11px;line-height:1.4;">${escapeHtml(capped)}</pre>`;
  }

  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#222;max-width:760px;margin:0 auto;padding:24px;">
    <h2 style="margin-top:0;">hired.video — client error reported</h2>
    <p style="font-size:14px;color:#444;background:#fff5f5;border:1px solid #fecaca;padding:12px;border-radius:4px;">${escapeHtml(report.message)}</p>
    <table style="border-collapse:collapse;font-size:13px;margin-top:16px;">${fieldsHtml}</table>
    ${noteBlock}
    ${stackBlock}
    ${contextBlock}
    <p style="margin-top:24px;font-size:11px;color:#999;">Sent from /api/errors/report. To change the recipient, edit REPORT_RECIPIENT in routes/errors.ts.</p>
  </body></html>`;
}

// ── Router ────────────────────────────────────────────────────────────────────

const REPORT_RECIPIENT = "seanhogg@gmail.com";

export const errorsRoutes = new Hono<AppEnv>();

errorsRoutes.post("/report", reportRateLimiter, async (c) => {
  // Reject bodies bigger than ~64KB before even parsing — a real client
  // payload is well under 8KB. Anything larger is either a bug or abuse.
  const lengthHeader = c.req.header("content-length");
  if (lengthHeader && Number(lengthHeader) > 65_536) {
    return c.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Report payload too large." } }, 413);
  }

  const raw = await c.req.json().catch(() => null);
  const parsed = ErrorReportSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid report" } },
      400,
    );
  }
  const report = parsed.data;
  const clientIp = getClientIp(c);

  // Email is best-effort: a failure is logged but does not fail the
  // request — the caller has done their part.
  const subject = `[hired.video] Client error: ${report.message.slice(0, 120)}`;
  const html = buildEmailHtml(report, clientIp);

  const emailOk = await sendGenericEmail(REPORT_RECIPIENT, subject, html, "hired.video error reporter")
    .catch((err) => {
      console.error("[errors/report] email send threw:", err);
      return false;
    });

  return c.json(
    ok({
      received: true,
      delivered: { email: emailOk },
    }),
    202,
  );
});
