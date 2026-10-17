/**
 * /api/admin/payouts — admin payout back-office operations. Mounted by the
 * admin composite (routes/admin/index.ts), which applies the admin guard
 * (Admin or SuperAdmin — same gate as /api/admin/tax-reporting).
 *
 *   POST /backfill-tax-ids          one-time plaintext → AES-GCM backfill (#775)
 *   GET  /tax-year/:year            1099-NEC settled-payout aggregation (#777)
 *   GET  /tax-year/:year?format=csv same data as a Track1099-compatible CSV
 *
 * The aggregation lives in TaxReportingService (#312); this file only exposes
 * the gap-#777 endpoint shape over that single source of truth.
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { requestEnv } from "../utils/env.js";
import { backfillTaxIds } from "../services/admin/taxIdBackfill.js";
import {
  getAnnualReport,
  taxReportingService,
  type TaxYearReport,
} from "../services/payout/TaxReportingService.js";

export const adminPayoutRoutes = new Hono<AppEnv>();

adminPayoutRoutes.post("/backfill-tax-ids", async (c) => {
  return c.json(success(await backfillTaxIds(requestEnv(c))), 200);
});

// ---------------------------------------------------------------------------
// GET /tax-year/:year — 1099-NEC settled-payout aggregation (#777)
//
// Aggregates `payouts WHERE status='settled' AND settled_at IN <calendar
// year>` per `payout_profiles.user_id`, applies the >$600 (US) / >$0 (foreign)
// thresholds, and returns per-recipient filing line items. `?format=csv`
// returns a Track1099 / Tax1099-compatible CSV the accounting team uploads
// directly; default is JSON. `?onlyReportable=1` drops below-threshold rows
// (CSV only; the JSON payload always carries every recipient + the audit
// reason so admins can spot-check the threshold decision).
//
// Caching: a *closed* tax year is immutable, so the heavy aggregation is
// served through the year-keyed read-through cache. The current (still-open)
// year keeps mutating as payouts settle, so it is NOT cached — only fully
// past years are. Dates are revived from KV's ISO strings.
// ---------------------------------------------------------------------------
adminPayoutRoutes.get("/tax-year/:year", async (c) => {
  const year = Number.parseInt(c.req.param("year"), 10);
  if (!Number.isInteger(year)) {
    return c.json(error("VALIDATION_ERROR", "year must be a 4-digit integer"), 400);
  }

  const format = (c.req.query("format") ?? "json").toLowerCase();
  const onlyReportable = c.req.query("onlyReportable") === "1";

  let report: TaxYearReport;
  try {
    // Closed years are cached + invalidated on every payout write.
    report = await getAnnualReport(year);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to build tax-year report";
    if (format === "csv") return c.text(msg, 500);
    return c.json(error("REPORT_FAILED", msg), 500);
  }

  if (format === "csv") {
    const csv = taxReportingService.toCsv(report, { onlyReportable });
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="1099-${year}${onlyReportable ? "-reportable" : ""}.csv"`,
      },
    });
  }

  return c.json(success(report), 200);
});
