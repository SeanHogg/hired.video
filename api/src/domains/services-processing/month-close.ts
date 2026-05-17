// Month-close job: rolls the ledger into frozen `usage_statements` and
// generates one `usage_invoices` row per active user. Free users get a
// `$0` "Free Invoice" so the close-out flow is uniform across plans.
//
// Wired into [api/src/scheduled.ts] — runs on the 1st of each UTC month at
// 03:00 to give end-of-month writes time to settle.
//
// Idempotency: the unique constraints on `usage_statements (user_id,
// period_start)` and `usage_invoices (user_id, period_start)` mean re-running
// the cron for the same period is safe; existing rows are left alone.

import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getSubscription } from "../../services/billing/BillingService.js";
import type {
  PlanTier,
  UsageEventType,
  UsageStatementLine,
} from "../../../../shared/usage-statement.js";
import { listEntitlements } from "./entitlement-catalog.js";
import { endOfMonthUtc, startOfMonthUtc } from "./services-processor.js";

interface CloseOptions {
  /** First moment of the period being closed (UTC). Defaults to "last month". */
  periodStart?: Date;
  /** Limit to a specific user. Otherwise rolls every user that has any
   *  ledger activity in the period. */
  userId?: string;
}

interface CloseSummary {
  periodStart: string;
  periodEnd: string;
  statementsClosed: number;
  invoicesCreated: number;
}

function lastMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
}

function generateInvoiceNumber(userId: string, period: Date): string {
  const yyyymm = `${period.getUTCFullYear()}${String(period.getUTCMonth() + 1).padStart(2, "0")}`;
  // last 8 chars of the user UUID keep the number short + unique enough; the
  // `usage_invoices_number_unique` index catches collisions.
  return `INV-${yyyymm}-${userId.replace(/-/g, "").slice(-8).toUpperCase()}`;
}

/**
 * Roll up one user's ledger for `periodStart`. Returns the closed statement +
 * invoice row IDs. Re-callable safely.
 */
export async function closeMonthForUser(
  userId: string,
  periodStart: Date,
): Promise<{ statementId: string; invoiceId: string } | null> {
  const periodEnd = endOfMonthUtc(periodStart);
  const db = getDb();

  // Resolve plan as of close time. Mid-period upgrades are handled by the
  // per-row `usage_ledger.plan` snapshot at insert time, but the *invoice*
  // attributes to whichever tier the user lands on at close.
  const sub = await getSubscription(userId);
  const plan: PlanTier = sub.isPro ? "pro" : "free";

  const rows = await db
    .select({
      eventType: schema.usageLedger.eventType,
      total: sql<number>`COALESCE(SUM(${schema.usageLedger.quantity}), 0)`,
    })
    .from(schema.usageLedger)
    .where(
      and(
        eq(schema.usageLedger.userId, userId),
        gte(schema.usageLedger.periodStart, periodStart),
        lt(schema.usageLedger.periodStart, periodEnd),
      ),
    )
    .groupBy(schema.usageLedger.eventType);

  const consumedByType = new Map<UsageEventType, number>();
  for (const r of rows) {
    const total = typeof r.total === "string" ? Number(r.total) : r.total;
    consumedByType.set(r.eventType as UsageEventType, total);
  }

  const lines: UsageStatementLine[] = listEntitlements(plan).map((spec) => {
    const consumed = consumedByType.get(spec.eventType) ?? 0;
    const cap = spec.monthlyCap[plan];
    const overage = cap > 0 ? Math.max(0, consumed - cap) : 0;
    return {
      eventType: spec.eventType,
      label: spec.label,
      unit: spec.unit,
      includedQuantity: cap,
      consumedQuantity: consumed,
      overageQuantity: overage,
      overageCents: overage * spec.overageCentsPerUnit,
    };
  });

  const totalCents = lines.reduce((sum, l) => sum + l.overageCents, 0);

  // Upsert the statement.
  const [statement] = await db
    .insert(schema.usageStatements)
    .values({
      userId,
      periodStart,
      periodEnd,
      plan,
      lines,
      totalCents,
      currency: "USD",
      status: "closed",
      closedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.usageStatements.userId, schema.usageStatements.periodStart],
      set: {
        plan,
        lines,
        totalCents,
        currency: "USD",
        status: "closed",
        closedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!statement) return null;

  const invoiceNumber = generateInvoiceNumber(userId, periodStart);
  const status = plan === "free" && totalCents === 0 ? "free_zero" : "pending";

  const [invoice] = await db
    .insert(schema.usageInvoices)
    .values({
      userId,
      statementId: statement.id,
      periodStart,
      periodEnd,
      plan,
      invoiceNumber,
      totalCents,
      currency: "USD",
      status,
    })
    .onConflictDoNothing({
      target: [schema.usageInvoices.userId, schema.usageInvoices.periodStart],
    })
    .returning();

  return {
    statementId: statement.id,
    invoiceId: invoice?.id ?? "",
  };
}

/**
 * Close every user that had ledger activity in the period — or every active
 * subscription holder if the ledger was quiet (Free users still get a $0
 * Free Invoice so the close-out cadence is uniform).
 */
export async function runMonthClose(opts: CloseOptions = {}): Promise<CloseSummary> {
  const periodStart = opts.periodStart ?? lastMonthStart();
  const periodEnd = endOfMonthUtc(periodStart);
  const db = getDb();

  let userIds: string[];
  if (opts.userId) {
    userIds = [opts.userId];
  } else {
    // Users with ledger activity in the period — the cheap path. Users with
    // zero activity get a $0 Free Invoice via the nightly drip in a follow-up
    // (gap-register #771 if needed); the cron's primary job is rolling
    // activity into invoices.
    const rows = await db
      .selectDistinct({ userId: schema.usageLedger.userId })
      .from(schema.usageLedger)
      .where(
        and(
          gte(schema.usageLedger.periodStart, periodStart),
          lt(schema.usageLedger.periodStart, periodEnd),
        ),
      );
    userIds = rows.map((r) => r.userId);
  }

  let statementsClosed = 0;
  let invoicesCreated = 0;
  for (const uid of userIds) {
    const result = await closeMonthForUser(uid, periodStart);
    if (result) {
      statementsClosed += 1;
      if (result.invoiceId) invoicesCreated += 1;
    }
  }

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    statementsClosed,
    invoicesCreated,
  };
}
