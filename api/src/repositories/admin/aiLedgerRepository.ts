/** Row-level AI usage ledger totals (`ai_usage_records`) for cost reconciliation. */
import { gte, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { aiUsageRecords } = schema;

export interface LedgerTotals {
  totalTokens: number;
  rows: number;
  estCostCents: number;
}

export async function ledgerTotalsSince(since: Date): Promise<LedgerTotals> {
  const [row] = await getDb()
    .select({
      totalTokens: sql<number>`coalesce(sum(${aiUsageRecords.totalTokens}), 0)::int`,
      rows: sql<number>`count(*)::int`,
      // `cost` is USD (numeric, priced per call from shared/ai-model-rates.ts).
      estCostCents: sql<number>`round(coalesce(sum(${aiUsageRecords.cost}), 0) * 100)::int`,
    })
    .from(aiUsageRecords)
    .where(gte(aiUsageRecords.createdAt, since));
  return {
    totalTokens: Number(row?.totalTokens) || 0,
    rows: Number(row?.rows) || 0,
    estCostCents: Number(row?.estCostCents) || 0,
  };
}
