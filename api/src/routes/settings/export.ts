/**
 * /api/settings/export (+ legacy /api/export/* via the app.ts alias mount):
 * GDPR/CPRA account data export. Default JSON bundle; `?format=csv` for the
 * spreadsheet subset. Both are Save-As downloads (Content-Disposition).
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { buildAccountExport } from "../../services/settings/dataExportService.js";

export const settingsExportRoutes = new Hono<AppEnv>();

settingsExportRoutes.get("/export", async (c) => {
  const userId = requireUser(c);
  const file = await buildAccountExport(userId, c.req.query("format"));
  return new Response(file.body, {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
    },
  });
});

// Legacy standalone export routes (/api/export/csv maps here through the
// alias mount) redirect to the canonical endpoint.
settingsExportRoutes.get("/export/csv", async (c) => c.redirect(`/api/settings/export?format=csv`, 302));

// Excel needs an xlsx library; fall back to the CSV export until one is added.
settingsExportRoutes.get("/export/excel", async (c) => {
  const userId = requireUser(c);
  return c.redirect(`/api/settings/export?format=csv`, 302);
});
