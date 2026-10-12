/**
 * Executive compensation analyzer (#1676) — pure valuation logic for
 * breaking down a total-comp package. Exec comp is 60-80% non-base, so a
 * base-salary comparison badly misranks offers; this annualizes base +
 * bonus + equity (over the vesting period) + amortized sign-on into one
 * comparable number, plus the per-component breakdown.
 *
 * Pure + framework-free so it unit-tests cleanly and runs on client or
 * server. The tool page (/tools/comp-analyzer) is a thin form over this.
 */

export interface CompInput {
  /** Annual base salary. */
  baseSalary: number;
  /** Target annual bonus — absolute amount (already computed from % if any). */
  targetBonus?: number;
  /** Total equity grant value at offer (RSU grant value or option spread). */
  equityGrantValue?: number;
  /** Years the equity vests over (default 4). */
  vestingYears?: number;
  /** One-time sign-on bonus. */
  signOnBonus?: number;
  /** Annual value of benefits / 401k match / perks. */
  benefitsValue?: number;
}

export interface CompBreakdown {
  baseSalary: number;
  targetBonus: number;
  /** Equity value attributable to one year (grant ÷ vesting years). */
  annualEquity: number;
  /** Sign-on amortized across the vesting period (one-time / vestingYears). */
  annualizedSignOn: number;
  benefitsValue: number;
  /** Annualized total comp = base + bonus + annualEquity + annualizedSignOn + benefits. */
  annualizedTotal: number;
  /** Year-1 cash-heavy view = base + bonus + (grant ÷ vesting) + full sign-on + benefits. */
  yearOneTotal: number;
  /** Each component's share of annualizedTotal, 0..1. */
  composition: {
    base: number;
    bonus: number;
    equity: number;
    signOn: number;
    benefits: number;
  };
}

const nonNeg = (n: number | undefined): number => (typeof n === "number" && n > 0 ? n : 0);

export function analyzeComp(input: CompInput): CompBreakdown {
  const base = nonNeg(input.baseSalary);
  const bonus = nonNeg(input.targetBonus);
  const grant = nonNeg(input.equityGrantValue);
  const vesting = Math.max(1, Math.floor(input.vestingYears ?? 4));
  const signOn = nonNeg(input.signOnBonus);
  const benefits = nonNeg(input.benefitsValue);

  const annualEquity = grant / vesting;
  const annualizedSignOn = signOn / vesting;

  const annualizedTotal = base + bonus + annualEquity + annualizedSignOn + benefits;
  const yearOneTotal = base + bonus + annualEquity + signOn + benefits;

  const share = (part: number) => (annualizedTotal > 0 ? part / annualizedTotal : 0);

  return {
    baseSalary: base,
    targetBonus: bonus,
    annualEquity,
    annualizedSignOn,
    benefitsValue: benefits,
    annualizedTotal,
    yearOneTotal,
    composition: {
      base: share(base),
      bonus: share(bonus),
      equity: share(annualEquity),
      signOn: share(annualizedSignOn),
      benefits: share(benefits),
    },
  };
}

/** Base-salary share of annualized total, as a percentage 0..100.
 *  Below ~40% signals an equity/bonus-heavy exec package. */
export function basePercent(breakdown: CompBreakdown): number {
  return Math.round(breakdown.composition.base * 100);
}
