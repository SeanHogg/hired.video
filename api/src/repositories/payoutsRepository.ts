/**
 * PayoutsRepository — the outbound `payouts` rows (one per provider transfer).
 * Typed Drizzle wrappers only; the payout state machine lives in
 * services/payout/payoutWebhook.ts (provider events) and ReleaseWorker.ts.
 */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { payouts } = schema;

export type PayoutRow = typeof payouts.$inferSelect;
export type PayoutPatch = Partial<typeof payouts.$inferInsert>;

/** The payout a provider event refers to, scoped to that provider. */
export async function findPayoutByProviderPayoutId(provider: string, providerPayoutId: string): Promise<PayoutRow | null> {
  const [row] = await getDb()
    .select()
    .from(payouts)
    .where(and(eq(payouts.providerPayoutId, providerPayoutId), eq(payouts.provider, provider)))
    .limit(1);
  return row ?? null;
}

export async function updatePayout(id: string, patch: PayoutPatch): Promise<void> {
  await getDb().update(payouts).set(patch).where(eq(payouts.id, id));
}
