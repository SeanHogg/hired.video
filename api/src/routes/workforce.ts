/**
 * Workforce routes (#1349 Phase 1+2).
 *
 * Endpoints:
 *   POST   /api/workforce/punch-in        — start a time entry (employee)
 *   POST   /api/workforce/punch-out       — stop the active time entry (employee)
 *   GET    /api/workforce/active          — get the open entry (employee or employer)
 *   GET    /api/workforce/week?periodStart=YYYY-MM-DD  — entries in a week (self)
 *   POST   /api/workforce/timesheets/submit            — submit a week (employee)
 *   POST   /api/workforce/timesheets/:id/approve       — approve a timesheet (employer)
 *   POST   /api/workforce/timesheets/:id/reject        — reject a timesheet (employer)
 *   GET    /api/workforce/timesheets                   — list my timesheets (employee)
 *   GET    /api/workforce/approval-queue               — pending across workforce (employer)
 *   GET    /api/workforce/roster                       — employees + last-7-day totals (employer)
 *
 * Access control:
 *   Employee endpoints check `resolveEmployeeCompanyId(userId)` non-null.
 *   Employer endpoints check `resolveEmployerCompanyIds(userId)` non-empty.
 *   Both checks live in the service layer — the route is a thin wrapper.
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  punchIn,
  punchOut,
  getActiveTimeEntry,
  getWeekEntries,
  submitTimesheet,
  approveTimesheet,
  rejectTimesheet,
  getEmployeeTimesheets,
  getCompanyApprovalQueue,
  getCompanyRoster,
  getDeskMargin,
  createPlacementDocument,
  listCompanyPlacementDocuments,
  recalculateWorkforceSeats,
  resolveEmployerCompanyIds,
  attachDocumentFile,
  markDocumentSigned,
  getDocumentForCaller,
} from "../services/workforce/index.js";
import { renderInvoiceHtml, renderTimesheetHtml } from "../services/workforce/print-html.js";
import { cdnUrl } from "../utils/cdn.js";
import {
  listEmployerIntegrations,
  disconnectByEmployer,
  type IntegrationProvider,
} from "../services/workforce/integrations.js";

export const workforceRoutes = new Hono<AppEnv>();

function getCurrentUserId(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function unauthorized(c: any) {
  return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
}

// ---------------------------------------------------------------------------
// Phase 1 — time entries
// ---------------------------------------------------------------------------

workforceRoutes.post("/punch-in", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const body = await c.req.json().catch(() => ({}));
  const row = await punchIn(userId, {
    taskId: body.taskId ?? null,
    notes: body.notes ?? null,
    billable: body.billable ?? true,
  });
  return c.json(success(row), 200);
});

workforceRoutes.post("/punch-out", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const row = await punchOut(userId);
  return c.json(success(row), 200);
});

workforceRoutes.get("/active", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const row = await getActiveTimeEntry(userId);
  return c.json(success(row), 200);
});

workforceRoutes.get("/week", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const periodStart = c.req.query("periodStart");
  if (!periodStart || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
    return c.json(error("BAD_REQUEST", "periodStart must be YYYY-MM-DD"), 400);
  }
  const entries = await getWeekEntries(userId, periodStart);
  return c.json(success({ entries }), 200);
});

// ---------------------------------------------------------------------------
// Phase 2 — timesheets
// ---------------------------------------------------------------------------

workforceRoutes.post("/timesheets/submit", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const body = await c.req.json().catch(() => ({}));
  const periodStart = body.periodStart;
  if (!periodStart || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
    return c.json(error("BAD_REQUEST", "periodStart must be YYYY-MM-DD"), 400);
  }
  const ts = await submitTimesheet(userId, periodStart);
  return c.json(success(ts), 200);
});

workforceRoutes.post("/timesheets/:id/approve", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const ts = await approveTimesheet(c.req.param("id"), userId);
  return c.json(success(ts), 200);
});

workforceRoutes.post("/timesheets/:id/reject", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const body = await c.req.json().catch(() => ({}));
  const reason = String(body.reason ?? "").trim();
  if (!reason) {
    return c.json(error("BAD_REQUEST", "reason is required when rejecting"), 400);
  }
  const ts = await rejectTimesheet(c.req.param("id"), userId, reason);
  return c.json(success(ts), 200);
});

workforceRoutes.get("/timesheets", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const list = await getEmployeeTimesheets(userId);
  return c.json(success({ timesheets: list }), 200);
});

workforceRoutes.get("/approval-queue", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const queue = await getCompanyApprovalQueue(userId);
  return c.json(success({ queue }), 200);
});

workforceRoutes.get("/roster", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const roster = await getCompanyRoster(userId);
  return c.json(success({ roster }), 200);
});

// ---------------------------------------------------------------------------
// Phase 3 — desk margin reporting (#1422)
// ---------------------------------------------------------------------------

workforceRoutes.get("/desk-margin", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const rows = await getDeskMargin(userId);
  return c.json(success({ rows }), 200);
});

// ---------------------------------------------------------------------------
// Phase 4 — placement documents (#1421)
// ---------------------------------------------------------------------------

workforceRoutes.get("/documents", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const docs = await listCompanyPlacementDocuments(userId);
  return c.json(success({ documents: docs }), 200);
});

workforceRoutes.post("/documents", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const body = await c.req.json().catch(() => ({}));
  if (!body.kind || typeof body.kind !== "string") {
    return c.json(error("BAD_REQUEST", "kind is required"), 400);
  }
  const doc = await createPlacementDocument(userId, {
    placementId: body.placementId ?? null,
    companyId: body.companyId ?? null,
    userId: body.userId ?? null,
    kind: body.kind,
    filePath: body.filePath ?? null,
    providerName: body.providerName ?? null,
    providerRef: body.providerRef ?? null,
    signedAt: body.signedAt ? new Date(body.signedAt) : null,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
  });
  return c.json(success(doc), 200);
});

/**
 * Upload the file payload for an existing placement document (#1442).
 * The body is the raw file bytes; content-type comes from the request
 * header. R2 binding (`VIDEO_BUCKET`) holds the actual blob; the row's
 * `file_path` column stores the key for later retrieval.
 *
 * Key shape: `workforce/docs/{companyOrPlacementId}/{docId}/{filename}`.
 * Filename is taken from the `x-filename` header so the original
 * extension survives.
 */
workforceRoutes.post("/documents/:id/upload", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const documentId = c.req.param("id");
  // Authority + existence check first — failed auth shouldn't read the
  // request body (which could be many MB) into memory.
  const doc = await getDocumentForCaller(userId, documentId);
  const body = await c.req.arrayBuffer();
  const MAX_DOC_BYTES = 25 * 1024 * 1024; // 25MB — workforce docs are small PDFs / scans
  if (body.byteLength > MAX_DOC_BYTES) {
    return c.json(error("PAYLOAD_TOO_LARGE", "Document exceeds 25 MB"), 413);
  }
  const contentType = c.req.header("content-type") || "application/octet-stream";
  const filename = c.req.header("x-filename") || `${doc.kind}.bin`;
  const scopeId = doc.companyId ?? doc.placementId ?? "orphan";
  const key = `workforce/docs/${scopeId}/${documentId}/${filename}`;
  const bucket: R2Bucket | undefined = (globalThis as any).__ENV?.VIDEO_BUCKET;
  if (!bucket) {
    return c.json(error("INTERNAL_SERVER_ERROR", "Storage not configured"), 500);
  }
  await bucket.put(key, body, { httpMetadata: { contentType } });
  const updated = await attachDocumentFile(userId, documentId, key, contentType);
  return c.json(success({ ...updated, downloadUrl: cdnUrl(key) }), 200);
});

/**
 * Mark a document signed (Native e-sign flow — manual confirmation by
 * the employer). DocuSign's webhook hits a separate route (deferred to
 * #1442 sub-work).
 */
workforceRoutes.post("/documents/:id/mark-signed", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const body = await c.req.json().catch(() => ({}));
  const signedAt = body.signedAt ? new Date(body.signedAt) : null;
  const row = await markDocumentSigned(userId, c.req.param("id"), signedAt);
  return c.json(success(row), 200);
});

/**
 * Get the doc + a download URL. The file_path stored on the row is the
 * R2 key; cdnUrl translates it to a public CDN URL.
 */
workforceRoutes.get("/documents/:id/download", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const doc = await getDocumentForCaller(userId, c.req.param("id"));
  if (!doc.filePath) {
    return c.json(error("NOT_FOUND", "Document has no uploaded file"), 404);
  }
  return c.json(success({ ...doc, downloadUrl: cdnUrl(doc.filePath) }), 200);
});

// ---------------------------------------------------------------------------
// Print views (#1440) — server returns A4-styled HTML that the browser
// converts to PDF via the standard print dialog. Auto-fires window.print()
// on load so the URL doubles as a one-click PDF export.
// ---------------------------------------------------------------------------

workforceRoutes.get("/invoices/:id/print", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const html = await renderInvoiceHtml(userId, c.req.param("id"));
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

workforceRoutes.get("/timesheets/:id/print", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const html = await renderTimesheetHtml(userId, c.req.param("id"));
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

// ---------------------------------------------------------------------------
// Seat reconciliation hook (#1409)
//
// Manual trigger for admins / employers to re-sync seat count. Normally
// runs automatically on accept-invitation + remove-account-user; this
// endpoint exists for the recover-from-drift case.
// ---------------------------------------------------------------------------

workforceRoutes.post("/reconcile-seats", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const employerCompanies = await resolveEmployerCompanyIds(userId);
  if (employerCompanies.length === 0) {
    return c.json(error("FORBIDDEN", "Not an employer in any workspace"), 403);
  }
  const results = [];
  for (const companyId of employerCompanies) {
    results.push(await recalculateWorkforceSeats(companyId));
  }
  return c.json(success({ results }), 200);
});

// ---------------------------------------------------------------------------
// Integrations (#1441) — list + disconnect. OAuth callback handlers
// per provider land separately when client IDs are configured.
// ---------------------------------------------------------------------------

workforceRoutes.get("/integrations", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const integrations = await listEmployerIntegrations(userId);
  return c.json(success({ integrations }), 200);
});

workforceRoutes.post("/integrations/:provider/disconnect", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const provider = c.req.param("provider") as IntegrationProvider;
  if (!["quickbooks", "xero", "gusto", "docusign", "helcim"].includes(provider)) {
    return c.json(error("BAD_REQUEST", `Unknown provider: ${provider}`), 400);
  }
  const body = await c.req.json().catch(() => ({}));
  if (!body.companyId) {
    return c.json(error("BAD_REQUEST", "companyId is required"), 400);
  }
  await disconnectByEmployer(userId, body.companyId, provider);
  return c.json(success({ disconnected: true }), 200);
});
