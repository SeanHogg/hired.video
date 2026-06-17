/**
 * #227 — placement fee calculator. Reads the explicit `feeMode`
 * discriminator and returns the resolved fee in cents.
 *
 *   feeMode='flat'    → feeFlatCents (rounded to int)
 *   feeMode='percent' → feePercentBps × annualSalaryCents / 10_000
 *
 * Both code paths fall back to the legacy `commission_*` columns when
 * the new columns are NULL (rows migrated from #178 backfill, but the
 * fallback keeps brand-new rows that pre-date a future API client
 * forwarding the new fields working).
 *
 * The commission engine elsewhere calls `resolvePlacementFeeCents()` —
 * never reads the schema columns directly — so changing the fee model
 * is a one-file edit.
 */

export interface PlacementFeeInputs {
  feeMode: "flat" | "percent" | string | null | undefined;
  feeFlatCents: number | null | undefined;
  feePercentBps: number | null | undefined;
  /** Annual base salary in USD (numeric on the schema). */
  annualSalaryDollars: number | string | null | undefined;
  /** Legacy commission_amount (numeric, USD) — used when feeFlatCents is NULL. */
  legacyCommissionAmountDollars: number | string | null | undefined;
  /** Legacy commission_percentage (numeric, percent points) — used when feePercentBps is NULL. */
  legacyCommissionPercentage: number | string | null | undefined;
}

export interface ResolvedPlacementFee {
  mode: "flat" | "percent";
  cents: number;
}

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v) || 0;
}

/** Placement kinds the back-office axis (#229) understands. Contract work
 *  requires timesheets; direct-hire does not. */
export const PLACEMENT_KINDS = ["direct_hire", "contract", "contract_to_hire"] as const;
export type PlacementKind = (typeof PLACEMENT_KINDS)[number];

export interface PlacementBackOffice {
  placementKind: PlacementKind | null;
  endDate: Date | null;
  billRateHourly: string | null;
  payRateHourly: string | null;
  currency: string | null;
  burdenPct: string | null;
  poNumber: string | null;
  msaRef: string | null;
  parentPlacementId: string | null;
  timesheetRequired: boolean | null;
}

function optStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function optDecimal(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? String(n) : null;
}

/**
 * Whitelist + coerce the #229 back-office fields off a request body. Pure
 * (no I/O) so the create/update routes share one mapping and it's unit
 * testable. `timesheetRequired` derives from `placementKind` when the
 * client doesn't set it explicitly (contract / contract_to_hire ⇒ true,
 * direct_hire ⇒ false), matching the schema comment.
 */
export function sanitizePlacementBackOffice(body: unknown): PlacementBackOffice {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const kind = (PLACEMENT_KINDS as readonly string[]).includes(b.placementKind as string)
    ? (b.placementKind as PlacementKind)
    : null;

  let timesheetRequired: boolean | null = null;
  if (typeof b.timesheetRequired === "boolean") timesheetRequired = b.timesheetRequired;
  else if (kind) timesheetRequired = kind !== "direct_hire";

  return {
    placementKind: kind,
    endDate: b.endDate ? new Date(b.endDate as string) : null,
    billRateHourly: optDecimal(b.billRateHourly),
    payRateHourly: optDecimal(b.payRateHourly),
    currency: optStr(b.currency, 8),
    burdenPct: optDecimal(b.burdenPct),
    poNumber: optStr(b.poNumber, 100),
    msaRef: optStr(b.msaRef, 100),
    parentPlacementId: optStr(b.parentPlacementId, 64),
    timesheetRequired,
  };
}

export function resolvePlacementFeeCents(input: PlacementFeeInputs): ResolvedPlacementFee {
  const mode: "flat" | "percent" = input.feeMode === "flat" ? "flat" : "percent";

  if (mode === "flat") {
    const explicit = input.feeFlatCents != null ? Math.max(0, Math.round(input.feeFlatCents)) : null;
    if (explicit !== null) return { mode, cents: explicit };
    const legacyDollars = toNumber(input.legacyCommissionAmountDollars);
    return { mode, cents: Math.max(0, Math.round(legacyDollars * 100)) };
  }

  const annualDollars = toNumber(input.annualSalaryDollars);
  const explicitBps =
    input.feePercentBps != null ? Math.max(0, Math.round(input.feePercentBps)) : null;
  if (explicitBps !== null) {
    return { mode, cents: Math.max(0, Math.round((annualDollars * 100 * explicitBps) / 10_000)) };
  }
  const legacyPct = toNumber(input.legacyCommissionPercentage);
  return { mode, cents: Math.max(0, Math.round((annualDollars * 100 * legacyPct) / 100)) };
}

/**
 * Inverse helper for compatibility with the legacy commission engine that
 * still reads `commissionPercentage` + `commissionAmount`. Given the
 * resolved fee + the annual salary, produces the legacy display fields so
 * route writers don't have to maintain two stores in parallel.
 */
export function deriveLegacyCommissionFields(
  resolved: ResolvedPlacementFee,
  annualSalaryDollars: number,
): { commissionPercentage: string; commissionAmount: string } {
  if (annualSalaryDollars <= 0 || resolved.cents <= 0) {
    return {
      commissionPercentage: "0",
      commissionAmount: (resolved.cents / 100).toFixed(2),
    };
  }
  if (resolved.mode === "percent") {
    const pct = (resolved.cents / (annualSalaryDollars * 100)) * 100;
    return {
      commissionPercentage: pct.toFixed(4),
      commissionAmount: (resolved.cents / 100).toFixed(2),
    };
  }
  return {
    commissionPercentage: "0",
    commissionAmount: (resolved.cents / 100).toFixed(2),
  };
}
