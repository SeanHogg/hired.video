/**
 * #312 — 1099-NEC year-end report generator.
 *
 * Aggregates settled payouts (kind='payout' AND status='settled') per
 * `payout_profiles.user_id` for a given calendar year and emits one
 * filing line per recipient. Applies the >$600 (US) and >$0 (non-US)
 * thresholds documented in the gap entry. The output shape is the
 * canonical Track1099 / Tax1099 column set so the admin team can
 * upload the CSV directly without massaging.
 *
 * The service is read-only — it doesn't write to any table, so it's
 * safe to invoke repeatedly during the close window. Identifying
 * information (legal name, address, tax-id last-4) comes from
 * payout_profiles; the full tax ID lives only in
 * `tax_id_ciphertext` (#309) and the 1099 filer expects the last-4
 * matcher anyway, so we never decrypt for the report.
 *
 * VAT-MOSS (EU buyer-side reporting) is intentionally out of scope —
 * tracked separately under gap #777.
 */

import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { payouts, payoutProfiles } = schema;

export interface TaxYearReportRow {
  userId: string;
  recipientType: "individual" | "business" | "unknown";
  legalName: string | null;
  businessName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressRegion: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  taxIdLast4: string | null;
  taxIdType: string | null;
  taxResidencyCountry: string | null;
  taxFormType: string | null;
  totalPaidCents: number;
  totalPaidUsd: number;
  payoutCount: number;
  meetsThreshold: boolean;
  /** Why we did or didn't include the row — used by the admin CSV's
   *  trailing "_audit" column for spot-checks. */
  thresholdReason: string;
}

export interface TaxYearReport {
  year: number;
  periodStart: string;
  periodEnd: string;
  totalRecipients: number;
  totalReportableRecipients: number;
  totalReportableCents: number;
  rows: TaxYearReportRow[];
}

const US_1099_NEC_THRESHOLD_CENTS = 600_00;

export class TaxReportingService {
  async buildAnnualReport(year: number): Promise<TaxYearReport> {
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      throw new Error("year must be a 4-digit calendar year");
    }
    const periodStart = new Date(Date.UTC(year, 0, 1));
    const periodEnd = new Date(Date.UTC(year + 1, 0, 1));
    const db = getDb();

    const aggregates = await db
      .select({
        userId: payouts.userId,
        currency: payouts.currency,
        total: sql<number>`COALESCE(SUM(${payouts.amountCents}), 0)::int`,
        n: sql<number>`COUNT(*)::int`,
      })
      .from(payouts)
      .where(
        and(
          eq(payouts.status, "settled"),
          gte(payouts.settledAt, periodStart),
          lt(payouts.settledAt, periodEnd),
        ),
      )
      .groupBy(payouts.userId, payouts.currency);

    if (aggregates.length === 0) {
      return {
        year,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        totalRecipients: 0,
        totalReportableRecipients: 0,
        totalReportableCents: 0,
        rows: [],
      };
    }

    const userIds = Array.from(new Set(aggregates.map((a) => a.userId)));
    const profileRows = await db
      .select()
      .from(payoutProfiles)
      .where(sql`${payoutProfiles.userId} IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`);
    const profilesByUser = new Map(profileRows.map((p) => [p.userId, p]));

    const rows: TaxYearReportRow[] = aggregates.map((a) => {
      const profile = profilesByUser.get(a.userId);
      const totalCents = typeof a.total === "string" ? Number(a.total) : a.total;
      const count = typeof a.n === "string" ? Number(a.n) : a.n;
      const recipientType: TaxYearReportRow["recipientType"] = (() => {
        const e = profile?.entityType?.toLowerCase();
        if (e === "individual" || e === "sole_proprietor") return "individual";
        if (e === "llc" || e === "corporation" || e === "partnership" || e === "business") return "business";
        return "unknown";
      })();
      const isUs = (profile?.taxResidencyCountry ?? "US").toUpperCase() === "US";
      const meets = isUs ? totalCents >= US_1099_NEC_THRESHOLD_CENTS : totalCents > 0;
      const reason = isUs
        ? totalCents >= US_1099_NEC_THRESHOLD_CENTS
          ? "US recipient ≥ $600 threshold"
          : "US recipient below $600 threshold"
        : "Non-US recipient";

      return {
        userId: a.userId,
        recipientType,
        legalName: profile?.legalName ?? null,
        businessName: profile?.businessLegalName ?? null,
        addressLine1: profile?.addressLine1 ?? null,
        addressLine2: profile?.addressLine2 ?? null,
        addressCity: profile?.addressCity ?? null,
        addressRegion: profile?.addressRegion ?? null,
        addressPostalCode: profile?.addressPostalCode ?? null,
        addressCountry: profile?.addressCountry ?? null,
        taxIdLast4: profile?.taxIdLast4 ?? null,
        taxIdType: profile?.taxIdType ?? null,
        taxResidencyCountry: profile?.taxResidencyCountry ?? null,
        taxFormType: profile?.taxFormType ?? null,
        totalPaidCents: totalCents,
        totalPaidUsd: totalCents / 100,
        payoutCount: count,
        meetsThreshold: meets,
        thresholdReason: reason,
      };
    });

    const reportable = rows.filter((r) => r.meetsThreshold);
    return {
      year,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalRecipients: rows.length,
      totalReportableRecipients: reportable.length,
      totalReportableCents: reportable.reduce((sum, r) => sum + r.totalPaidCents, 0),
      rows,
    };
  }

  /** Track1099-compatible CSV. Header row matches their bulk-upload schema. */
  toCsv(report: TaxYearReport, opts?: { onlyReportable?: boolean }): string {
    const rows = opts?.onlyReportable ? report.rows.filter((r) => r.meetsThreshold) : report.rows;
    const header = [
      "Recipient Type",
      "Recipient Name",
      "Business Name",
      "Address Line 1",
      "Address Line 2",
      "City",
      "State / Region",
      "Postal Code",
      "Country",
      "Tax ID Last 4",
      "Tax ID Type",
      "Tax Form Type",
      "Total Paid USD",
      "Payout Count",
      "Audit Reason",
    ];
    const escape = (v: string | number | null | undefined): string => {
      if (v === null || v === undefined) return "";
      const s = typeof v === "string" ? v : String(v);
      const needsQuote = s.includes(",") || s.includes('"') || s.includes("\n");
      const escaped = s.replace(/"/g, '""');
      return needsQuote ? `"${escaped}"` : escaped;
    };
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.recipientType,
          r.legalName,
          r.businessName,
          r.addressLine1,
          r.addressLine2,
          r.addressCity,
          r.addressRegion,
          r.addressPostalCode,
          r.addressCountry,
          r.taxIdLast4,
          r.taxIdType,
          r.taxFormType,
          r.totalPaidUsd.toFixed(2),
          r.payoutCount,
          r.thresholdReason,
        ]
          .map(escape)
          .join(","),
      );
    }
    return lines.join("\r\n");
  }
}

export const taxReportingService = new TaxReportingService();
