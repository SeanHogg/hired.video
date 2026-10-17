/**
 * Gateway-observability projections over `usage_ledger` (event_type =
 * 'ai_tokens'), stamped per charged AI call by token-ledger.charge →
 * servicesProcessor.meter({ ai }) into typed columns (migration 0612):
 * silent model substitutions (#515) and json_schema conformance retries
 * (#2159).
 */
import { and, desc, eq, gt, gte, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { usageLedger } = schema;

/** Substituted calls grouped by requested hint → resolved model → feature. */
export function substitutionsSince(since: Date) {
  return getDb()
    .select({
      requestedModel: usageLedger.requestedModel,
      resolvedModel: usageLedger.resolvedModel,
      featureKey: usageLedger.featureKey,
      count: sql<number>`count(*)::int`,
      lastSeen: sql<string>`max(${usageLedger.createdAt})`,
    })
    .from(usageLedger)
    .where(and(
      eq(usageLedger.eventType, "ai_tokens"),
      gte(usageLedger.createdAt, since),
      eq(usageLedger.substituted, true),
    ))
    .groupBy(usageLedger.requestedModel, usageLedger.resolvedModel, usageLedger.featureKey)
    .orderBy(desc(sql`count(*)`));
}

/** Calls the gateway re-asked for schema conformance, grouped by feature. */
export function schemaRetriesSince(since: Date) {
  return getDb()
    .select({
      featureKey: usageLedger.featureKey,
      totalRetries: sql<number>`sum(${usageLedger.schemaRetries})::int`,
      calls: sql<number>`count(*)::int`,
      lastSeen: sql<string>`max(${usageLedger.createdAt})`,
    })
    .from(usageLedger)
    .where(and(
      eq(usageLedger.eventType, "ai_tokens"),
      gte(usageLedger.createdAt, since),
      // Stamped only when the gateway actually retried; `> 0` guards a stray 0.
      gt(usageLedger.schemaRetries, 0),
    ))
    .groupBy(usageLedger.featureKey)
    .orderBy(desc(sql`sum(${usageLedger.schemaRetries})`));
}
