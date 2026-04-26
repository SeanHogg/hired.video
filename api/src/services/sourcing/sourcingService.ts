/**
 * High-level SourcingService — wraps the resolver with credit billing.
 *
 * Public lookup flow:
 *   1. Check user has an enrichment_credits balance ≥ 1 (cache hits + free
 *      providers don't debit; paid providers do).
 *   2. Run the resolver.
 *   3. If a paid provider was hit, debit one credit + log a transaction.
 *   4. Return the resolved person + cost.
 *
 * Admin lookup flow skips the credit check (gated by superAdminMiddleware).
 */

import { desc, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { schema } from "../../db/index.js";
import { resolve, type ResolveOutcome } from "./resolver.js";
import type { SourcingQuery } from "./types.js";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("No enrichment credits remaining");
    this.name = "InsufficientCreditsError";
  }
}

async function ensureCreditsRow(db: Db, userId: string) {
  const [row] = await db
    .select()
    .from(schema.enrichmentCredits)
    .where(eq(schema.enrichmentCredits.userId, userId))
    .limit(1);
  if (row) return row;
  const [created] = await db
    .insert(schema.enrichmentCredits)
    .values({ userId, balance: 0 } as any)
    .returning();
  return created;
}

async function debitCredit(
  db: Db,
  userId: string,
  description: string,
  referenceId: string | null,
): Promise<{ balance: number }> {
  const credits = await ensureCreditsRow(db, userId);
  if (credits.balance < 1) throw new InsufficientCreditsError();
  const newBalance = credits.balance - 1;
  await db
    .update(schema.enrichmentCredits)
    .set({
      balance: newBalance,
      totalConsumed: credits.totalConsumed + 1,
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.enrichmentCredits.userId, userId));
  await db.insert(schema.enrichmentTransactions).values({
    userId,
    type: "deduction",
    amount: -1,
    balanceAfter: newBalance,
    description,
    referenceId,
  } as any);
  return { balance: newBalance };
}

export interface UserLookupOutcome extends ResolveOutcome {
  /** Remaining enrichment credits after this call. */
  creditsRemaining: number;
  /** True if a credit was debited (paid provider, fresh call). */
  creditDebited: boolean;
}

/**
 * User-facing lookup. Cache hits and free-provider hits are free. Paid
 * provider success debits one enrichment credit.
 */
export async function userSourcingLookup(
  db: Db,
  env: Record<string, unknown>,
  userId: string,
  query: SourcingQuery,
): Promise<UserLookupOutcome> {
  const credits = await ensureCreditsRow(db, userId);
  if (credits.balance < 1) {
    throw new InsufficientCreditsError();
  }

  const outcome = await resolve(db, env, query, { userId });
  let creditDebited = false;
  let balance = credits.balance;
  if (outcome.status === "cache_miss_resolved" && outcome.costCents > 0) {
    const debit = await debitCredit(
      db,
      userId,
      `Sourcing lookup: ${query.kind}`,
      outcome.cacheRowId,
    );
    balance = debit.balance;
    creditDebited = true;
  }
  return { ...outcome, creditsRemaining: balance, creditDebited };
}

/**
 * SuperAdmin lookup — skips the credit gate but still records the run.
 */
export async function adminSourcingLookup(
  db: Db,
  env: Record<string, unknown>,
  userId: string,
  query: SourcingQuery,
): Promise<ResolveOutcome> {
  return resolve(db, env, query, { userId });
}

/**
 * Pull recent run history for the SuperAdmin dashboard.
 */
export async function listRecentRuns(db: Db, limit = 50) {
  return db
    .select()
    .from(schema.integrationRuns)
    .orderBy(desc(schema.integrationRuns.createdAt))
    .limit(limit);
}
