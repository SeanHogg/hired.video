/**
 * /api/admin/tax-reporting — admin-only year-end tax reporting (#312).
 *
 *   GET /tax-year/:year          aggregated JSON report
 *   GET /tax-year/:year.csv      same data as Track1099-compatible CSV
 *
 * Caller must have admin / SuperAdmin role. The CSV variant adds the
 * Content-Disposition header so a browser download has a sensible
 * filename. Both variants accept `?onlyReportable=1` to drop rows
 * below the IRS threshold.
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { error } from "../types/index.js";
import { taxReportingService } from "../services/payout/TaxReportingService.js";
import { isAdminRole } from "../domains/billing/audience.js";

export const taxReportingRoutes = new Hono<AppEnv>();

function requireAdmin(c: any): true | Response {
  const user = c.var.user;
  if (!user) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!isAdminRole(user)) return c.json(error("FORBIDDEN", "Admin role required"), 403);
  return true;
}

taxReportingRoutes.get("/tax-year/:year", async (c) => {
  const guard = requireAdmin(c);
  if (guard !== true) return guard;
  const year = Number.parseInt(c.req.param("year"), 10);
  if (!Number.isInteger(year)) {
    return c.json(error("VALIDATION_ERROR", "year must be a 4-digit integer"), 400);
  }
  try {
    const report = await taxReportingService.buildAnnualReport(year);
    return c.json({ success: true, data: report }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to build tax-year report";
    return c.json(error("REPORT_FAILED", msg), 500);
  }
});

taxReportingRoutes.get("/tax-year/:year.csv", async (c) => {
  const guard = requireAdmin(c);
  if (guard !== true) return guard;
  const year = Number.parseInt(c.req.param("year"), 10);
  if (!Number.isInteger(year)) {
    return c.text("year must be a 4-digit integer", 400);
  }
  const onlyReportable = c.req.query("onlyReportable") === "1";
  try {
    const report = await taxReportingService.buildAnnualReport(year);
    const csv = taxReportingService.toCsv(report, { onlyReportable });
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="1099-${year}${onlyReportable ? "-reportable" : ""}.csv"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to build tax-year CSV";
    return c.text(msg, 500);
  }
});

taxReportingRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Tax reporting route not found" } }, 404),
);
