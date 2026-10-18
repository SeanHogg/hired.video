/**
 * Creator earnings rollup — single source of truth for the "where did my
 * money come from" breakdown surfaced on the Payouts & Earnings tab
 * (gap #1185).
 *
 * The append-only `payout_ledger_entries` table records every creator-balance
 * accrual tagged with a `source_kind` (see PayoutLedgerService.LedgerSourceKind).
 * Several ledger kinds map to the same human-facing revenue *source* (e.g. a
 * base promo project and a paid extra revision are both "Promo videos"), so the
 * mapping below is the canonical fold used by the API aggregator AND the
 * frontend card. Add a new ledger source-kind → add ONE row here and both ends
 * pick it up (DRY: no per-surface switch statements).
 */

/** Human-facing revenue source buckets shown to the creator. */
export const EARNINGS_SOURCES = [
  "promo_video",
  "voice_clone",
  "template",
  "service",
  "course",
  "article",
  "contract",
  "other",
] as const;
export type EarningsSourceKey = (typeof EARNINGS_SOURCES)[number];

export interface EarningsSourceMeta {
  source: EarningsSourceKey;
  label: string;
}

/**
 * Ledger `source_kind` → display source bucket + label. The keys are exactly
 * the `LedgerSourceKind` string union the PayoutLedgerService writes; keeping
 * them as plain strings here avoids a shared↔api import cycle. A ledger row
 * whose source_kind is missing from this map falls into `other` at render time
 * (see foldLedgerKindToSource) so revenue is never silently dropped.
 */
export const EARNINGS_SOURCE_BY_LEDGER_KIND: Record<string, EarningsSourceMeta> = {
  promo_project: { source: "promo_video", label: "Promo videos" },
  promo_extra_revision: { source: "promo_video", label: "Promo videos" },
  voice_clone_license: { source: "voice_clone", label: "Voice clones" },
  template_license: { source: "template", label: "Template marketplace" },
  service_order: { source: "service", label: "Services" },
  course_enrollment: { source: "course", label: "Courses" },
  article_pool_distribution: { source: "article", label: "Articles" },
  article: { source: "article", label: "Articles" },
  timesheet: { source: "contract", label: "Contract work" },
  task: { source: "contract", label: "Contract work" },
};

/**
 * Every `payout_ledger_entries.source_kind` the CHECK constraint accepts
 * (migration 0593): the accrual kinds PayoutLedgerService writes (the keys of
 * EARNINGS_SOURCE_BY_LEDGER_KIND) plus the legacy kinds the 0151 constraint
 * allowed. The schema + migration CHECK lists must equal this list.
 */
export const PAYOUT_LEDGER_SOURCE_KINDS = [
  "service_order",
  "voice_clone_license",
  "gift_card",
  "platform_fee",
  "creator_payout",
  "manual_adjustment",
  "commission",
  "partner_program",
  "promo_project",
  "promo_extra_revision",
  "template_license",
  "course_enrollment",
  "article_pool_distribution",
  "article",
  "timesheet",
  "task",
] as const;

/** Stable display order for the breakdown rows. */
export const EARNINGS_SOURCE_ORDER: EarningsSourceKey[] = [...EARNINGS_SOURCES];

/**
 * Resolve a raw ledger `source_kind` (possibly null / unknown) to its display
 * bucket. Unknown / null kinds collapse into the `other` bucket so a newly
 * added ledger kind we haven't mapped yet still shows up (with its raw key in
 * the label) rather than silently dropping the dollars.
 */
export function foldLedgerKindToSource(sourceKind: string | null): EarningsSourceMeta {
  if (sourceKind && EARNINGS_SOURCE_BY_LEDGER_KIND[sourceKind]) {
    return EARNINGS_SOURCE_BY_LEDGER_KIND[sourceKind];
  }
  return { source: "other", label: sourceKind ? `Other (${sourceKind})` : "Other" };
}

export interface CreatorEarningsSourceRow {
  source: EarningsSourceKey;
  label: string;
  /** Lifetime accrued earnings for this source, in minor units. */
  earningsCents: number;
  /** Number of paid events (accrual rows) feeding this source. */
  salesCount: number;
}

export interface CreatorEarningsRollupDTO {
  /** Only sources with at least one accrual, sorted by EARNINGS_SOURCE_ORDER. */
  rows: CreatorEarningsSourceRow[];
  totalEarnedCents: number;
  totalSales: number;
  currency: string;
}

/**
 * Pure fold from raw per-`source_kind` ledger aggregates to the display DTO.
 * Shared by the service (real DB rows) and its unit test so the grouping +
 * ordering logic has exactly one implementation.
 */
export function buildEarningsRollup(
  aggregates: Array<{ sourceKind: string | null; earningsCents: number; salesCount: number }>,
  currency: string,
): CreatorEarningsRollupDTO {
  const bySource = new Map<EarningsSourceKey, CreatorEarningsSourceRow>();
  let totalEarnedCents = 0;
  let totalSales = 0;

  for (const agg of aggregates) {
    if (!agg.earningsCents && !agg.salesCount) continue;
    const meta = foldLedgerKindToSource(agg.sourceKind);
    const existing = bySource.get(meta.source);
    if (existing) {
      existing.earningsCents += agg.earningsCents;
      existing.salesCount += agg.salesCount;
    } else {
      bySource.set(meta.source, {
        source: meta.source,
        label: meta.label,
        earningsCents: agg.earningsCents,
        salesCount: agg.salesCount,
      });
    }
    totalEarnedCents += agg.earningsCents;
    totalSales += agg.salesCount;
  }

  const rows = [...bySource.values()]
    .filter((r) => r.earningsCents !== 0 || r.salesCount !== 0)
    .sort(
      (a, b) =>
        EARNINGS_SOURCE_ORDER.indexOf(a.source) - EARNINGS_SOURCE_ORDER.indexOf(b.source),
    );

  return { rows, totalEarnedCents, totalSales, currency };
}
