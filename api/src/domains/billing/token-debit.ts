/**
 * Which bucket a completed AI call is debited from — the ONE rule shared by
 * the personal ledger (BillingService.recordTokenUsage) and the workforce
 * pool (company-token-ledger.recordCompanyTokenUsage).
 *
 * Monthly allowance first; once it can't cover the whole call, fall to the
 * purchased pack balance (if any). A single call is never split across
 * buckets — cleaner accounting, bounded drift. With neither bucket able to
 * cover it, the call is recorded as monthly overage and the NEXT call is
 * blocked by the gate (hasTokensForAiCall).
 */
export type TokenDebitSource = "monthly" | "pack";

export interface DebitBuckets {
  monthlyRemaining: number;
  packBalance: number;
  isUnlimited?: boolean;
}

export function chooseDebitSource(buckets: DebitBuckets, tokens: number): TokenDebitSource {
  if (buckets.isUnlimited) return "monthly";
  return buckets.monthlyRemaining < tokens && buckets.packBalance > 0 ? "pack" : "monthly";
}
