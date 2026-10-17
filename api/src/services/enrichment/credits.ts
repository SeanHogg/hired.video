/**
 * Enrichment credit spend — the ONE debit path for the `enrichment_credits`
 * wallet. Used by `/api/advertising/enrichment/enrich` and
 * `/api/contacts/:id/enrich`.
 *
 * The decrement and its ledger row are ONE conditional statement
 * (`balance >= amount`), so two concurrent enrichments can't both spend the
 * last credit and a debit never lands without its transaction row.
 */
import { getDb } from "../../db/index.js";
import { userWallet, WalletRepository } from "../../repositories/walletRepository.js";
import { enrichmentCreditsView, enrichmentTransactionView } from "../../repositories/walletViews.js";

export type CreditSpendResult = { ok: true; balanceAfter: number } | { ok: false };

export async function spendEnrichmentCredits(
  userId: string,
  amount: number,
  description: string,
  referenceId?: string,
): Promise<CreditSpendResult> {
  const balanceAfter = await new WalletRepository(getDb()).postEntry({
    owner: userWallet(userId),
    currency: "enrichment_credits",
    delta: -amount,
    consumedAdd: amount,
    entry: {
      type: "deduction",
      description: description.slice(0, 500),
      referenceId: referenceId ?? null,
    },
    requireSufficient: true,
  });
  if (balanceAfter == null) return { ok: false };
  return { ok: true, balanceAfter };
}

/** The user's credit wallet in the pre-merge `enrichment_credits` shape,
 *  provisioned at zero on first read. */
export async function getEnrichmentCredits(userId: string) {
  const wallet = await new WalletRepository(getDb()).ensure(userWallet(userId), "enrichment_credits");
  return enrichmentCreditsView(wallet);
}

/** Latest credit movements, newest first (pre-merge `enrichment_transactions` shape). */
export async function listEnrichmentTransactions(userId: string, limit = 50) {
  const rows = await new WalletRepository(getDb()).listLedger({
    owner: userWallet(userId),
    currency: "enrichment_credits",
    limit,
  });
  return rows.map(enrichmentTransactionView);
}
