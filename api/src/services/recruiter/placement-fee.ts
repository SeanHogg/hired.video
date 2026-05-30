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
