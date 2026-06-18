/**
 * /api/admin/payouts — admin-only payout back-office operations.
 *
 *   POST /backfill-tax-ids          one-time plaintext → AES-GCM backfill (#775)
 *   GET  /tax-year/:year            1099-NEC settled-payout aggregation (#777)
 *   GET  /tax-year/:year?format=csv same data as a Track1099-compatible CSV
 *
 * Caller must hold the admin / SuperAdmin role (same gate the sibling
 * `/api/admin/tax-reporting` routes use). The aggregation logic lives in
 * TaxReportingService (shipped under #312) — this file only exposes the
 * gap-#777 endpoint shape (`/api/admin/payouts/tax-year/:year` + `?format=csv`)
 * over that single source of truth, so there is no duplicated aggregation.
 */

import { Hono } from "hono";
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { isAdminRole } from "../domains/billing/audience.js";
import { encryptTaxId } from "../services/payout/encryption.js";
import {
  taxReportingService,
  type TaxYearReport,
} from "../services/payout/TaxReportingService.js";
import { getOrSetCached } from "../utils/edge-cache.js";

export const adminPayoutRoutes = new Hono<AppEnv>();

const { payoutProfiles } = schema;

function requireAdmin(c: any): true | Response {
  const user = c.var.user;
  if (!user) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!isAdminRole(user)) return c.json(error("FORBIDDEN", "Admin role required"), 403);
  return true;
}

function getEnv(c: unknown): Record<string, string | undefined> {
  return (c as { env?: Record<string, string | undefined> }).env ?? {};
}

// ---------------------------------------------------------------------------
// POST /backfill-tax-ids — one-time plaintext → ciphertext migration (#775)
//
// Bridges #772 (write-side moved to ciphertext) and #774 (drop the legacy
// plaintext column). Reads every row that still has plaintext but no
// ciphertext, encrypts via the same envelope used by the live PATCH route,
// writes the three ciphertext columns, then NULLs the plaintext. Idempotent:
// the WHERE clause excludes already-migrated rows, so re-running is a no-op.
// One-shot admin route (not a worker) — few rows, manually triggered after
// deploy.
// ---------------------------------------------------------------------------
adminPayoutRoutes.post("/backfill-tax-ids", async (c) => {
  const guard = requireAdmin(c);
  if (guard !== true) return guard;

  const db = getDb();
  const env = getEnv(c);

  // Rows needing migration: plaintext present, ciphertext absent.
  const pending = await db
    .select({
      id: payoutProfiles.id,
      taxIdEncrypted: payoutProfiles.taxIdEncrypted,
    })
    .from(payoutProfiles)
    .where(
      and(
        isNotNull(payoutProfiles.taxIdEncrypted),
        isNull(payoutProfiles.taxIdCiphertext),
      ),
    );

  let migrated = 0;
  let skipped = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  for (const row of pending) {
    const plaintext = (row.taxIdEncrypted ?? "").trim();
    if (!plaintext) {
      // Empty/whitespace plaintext — nothing to encrypt; just clear it so
      // #774's drop-column migration sees no surviving non-NULL values.
      await db
        .update(payoutProfiles)
        .set({ taxIdEncrypted: null } as any)
        .where(eq(payoutProfiles.id, row.id));
      skipped += 1;
      continue;
    }

    try {
      const enc = await encryptTaxId(plaintext, env);
      // Re-assert the no-ciphertext precondition inside the write so two
      // concurrent runs can't double-encrypt the same row.
      await db
        .update(payoutProfiles)
        .set({
          taxIdCiphertext: enc.ciphertext,
          taxIdNonce: enc.nonce,
          taxIdKmsKeyId: enc.kmsKeyId,
          taxIdLast4: plaintext.replace(/\D/g, "").slice(-4) || null,
          taxIdEncrypted: null,
        } as any)
        .where(
          and(
            eq(payoutProfiles.id, row.id),
            isNull(payoutProfiles.taxIdCiphertext),
          ),
        );
      migrated += 1;
    } catch (err) {
      failures.push({
        id: row.id,
        reason: err instanceof Error ? err.message : "encryption failed",
      });
    }
  }

  return c.json(
    success({
      candidates: pending.length,
      migrated,
      skippedEmpty: skipped,
      failed: failures.length,
      failures,
    }),
    200,
  );
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
  const guard = requireAdmin(c);
  if (guard !== true) return guard;

  const year = Number.parseInt(c.req.param("year"), 10);
  if (!Number.isInteger(year)) {
    return c.json(error("VALIDATION_ERROR", "year must be a 4-digit integer"), 400);
  }

  const format = (c.req.query("format") ?? "json").toLowerCase();
  const onlyReportable = c.req.query("onlyReportable") === "1";

  let report: TaxYearReport;
  try {
    report = await loadReport(year);
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

/**
 * Year-keyed read-through cache for the annual report. A closed (fully past)
 * tax year is immutable once the calendar rolls over, so it can be cached for
 * a long TTL; the current and future years still mutate as payouts settle, so
 * they fall straight through to the live aggregation.
 */
async function loadReport(year: number): Promise<TaxYearReport> {
  const currentYear = new Date().getUTCFullYear();
  if (year >= currentYear) {
    return taxReportingService.buildAnnualReport(year);
  }
  return getOrSetCached<TaxYearReport>({
    key: `tax-year-report:${year}`,
    ttlSeconds: 600,
    loader: () => taxReportingService.buildAnnualReport(year),
    // KV serialises the ISO period strings fine; no Date fields on the
    // payload need coercion, so the raw JSON round-trips as-is.
    revive: (raw) => raw as TaxYearReport,
  });
}

adminPayoutRoutes.all("*", (c) =>
  c.json(error("NOT_FOUND", "Admin payouts route not found"), 404),
);
