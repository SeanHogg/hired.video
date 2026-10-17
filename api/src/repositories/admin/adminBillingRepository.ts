/**
 * AdminBillingRepository — cross-tenant subscription reads/writes for the
 * SuperAdmin billing console (/api/admin/billing/*).
 */
import { count, desc, eq, sql, sum, type SQL } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { subscriptions, subscriptionPlans, users } = schema;

type DbHandle = ReturnType<typeof getDb>;

export interface SubscriptionSearch {
  page: number;
  limit: number;
  search?: string;
  status?: string;
}

export interface SubscriptionSummary {
  mrr: number;
  arr: number;
  active: number;
  trialing: number;
  pastDue: number;
  canceled: number;
}

export class AdminBillingRepository {
  constructor(private readonly db: DbHandle) {}

  static create(): AdminBillingRepository {
    return new AdminBillingRepository(getDb());
  }

  private searchWhere({ search, status }: SubscriptionSearch): SQL {
    let where: SQL = status && status !== "all" ? sql`${subscriptions.status} = ${status}` : sql`1=1`;
    if (search) {
      const like = `%${search}%`;
      where = sql`${where} AND (${users.name} ILIKE ${like} OR ${users.email} ILIKE ${like})`;
    }
    return where;
  }

  async listSubscriptions(query: SubscriptionSearch) {
    const where = this.searchWhere(query);
    const offset = (query.page - 1) * query.limit;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: subscriptions.id,
          userId: subscriptions.userId,
          userName: users.name,
          userEmail: users.email,
          planId: subscriptions.planId,
          planName: subscriptionPlans.name,
          planSlug: subscriptionPlans.slug,
          priceMonthly: subscriptionPlans.priceMonthly,
          priceYearly: subscriptionPlans.priceYearly,
          status: subscriptions.status,
          billingInterval: subscriptions.billingInterval,
          currentPeriodStart: subscriptions.currentPeriodStart,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
          canceledAt: subscriptions.canceledAt,
          trialEnd: subscriptions.trialEnd,
          createdAt: subscriptions.createdAt,
        })
        .from(subscriptions)
        .innerJoin(users, eq(subscriptions.userId, users.id))
        .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(where)
        .orderBy(desc(subscriptions.createdAt))
        .limit(query.limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(subscriptions)
        .innerJoin(users, eq(subscriptions.userId, users.id))
        .where(where),
    ]);
    return { rows, total };
  }

  /** Unfiltered status counts + MRR across active and trialing subs. */
  async summary(): Promise<SubscriptionSummary> {
    const statusCounts = await this.db
      .select({ status: subscriptions.status, n: count() })
      .from(subscriptions)
      .groupBy(subscriptions.status);
    const [mrrRow] = await this.db
      .select({ total: sum(subscriptionPlans.priceMonthly) })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(sql`${subscriptions.status} IN ('active', 'trialing')`);
    const byStatus = new Map(statusCounts.map((r) => [r.status, Number(r.n)]));
    const mrr = Number(mrrRow?.total ?? 0);
    return {
      mrr,
      arr: mrr * 12,
      active: byStatus.get("active") ?? 0,
      trialing: byStatus.get("trialing") ?? 0,
      pastDue: byStatus.get("past_due") ?? 0,
      canceled: byStatus.get("canceled") ?? 0,
    };
  }

  async findSubscriptionWithPrice(subscriptionId: string) {
    const [row] = await this.db
      .select({
        id: subscriptions.id,
        userId: subscriptions.userId,
        status: subscriptions.status,
        priceMonthly: subscriptionPlans.priceMonthly,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);
    return row ?? null;
  }

  async findSubscriptionOwner(subscriptionId: string): Promise<{ userId: string } | null> {
    const [row] = await this.db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);
    return row ?? null;
  }

  async markCanceled(subscriptionId: string, cancelAtPeriodEnd: boolean): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({ status: "canceled", canceledAt: new Date(), cancelAtPeriodEnd })
      .where(eq(subscriptions.id, subscriptionId));
  }
}
