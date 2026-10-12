/**
 * Enrichment credit spend — the ONE debit path for `enrichment_credits`.
 * Used by `/api/advertising/enrichment/enrich` and `/api/contacts/:id/enrich`.
 *
 * The decrement is a single conditional UPDATE (`balance >= amount`), so two
 * concurrent enrichments can't both spend the last credit.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { enrichmentCredits, enrichmentTransactions } = schema;

export type CreditSpendResult = { ok: true; balanceAfter: number } | { ok: false };

export async function spendEnrichmentCredits(
  userId: string,
  amount: number,
  description: string,
  referenceId?: string,
): Promise<CreditSpendResult> {
  const db = getDb();
  const [row] = await db
    .update(enrichmentCredits)
    .set({
      balance: sql`${enrichmentCredits.balance} - ${amount}`,
      totalConsumed: sql`${enrichmentCredits.totalConsumed} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(and(eq(enrichmentCredits.userId, userId), gte(enrichmentCredits.balance, amount)))
    .returning({ balance: enrichmentCredits.balance });
  if (!row) return { ok: false };
  await db.insert(enrichmentTransactions).values({
    userId,
    type: "deduction",
    amount: -amount,
    balanceAfter: row.balance,
    description: description.slice(0, 500),
    referenceId: referenceId ?? null,
  });
  return { ok: true, balanceAfter: row.balance };
}
