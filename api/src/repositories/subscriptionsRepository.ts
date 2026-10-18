/**
 * SubscriptionsRepository — covers subscriptions + subscriptionPlans +
 * userPlanOverrides. These three are one aggregate: the effective plan
 * for a user is a function of (their subscription, their plan overrides,
 * the plan row). Services always want them together; splitting into
 * three repos would force every caller to juggle three handles.
 */

import { and, asc, count, desc, eq, inArray, isNotNull, sql, sum } from "drizzle-orm";
import { schema } from "../db/index.js";

const { subscriptions, subscriptionPlans, userPlanOverrides } = schema;

export type DbLike = any;

export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type SubscriptionInsert = typeof subscriptions.$inferInsert;
export type SubscriptionPlanRow = typeof subscriptionPlans.$inferSelect;
export type PlanOverrideRow = typeof userPlanOverrides.$inferSelect;
export type PlanOverrideInsert = typeof userPlanOverrides.$inferInsert;

export interface ISubscriptionsRepository {
  // subscriptions
  findActiveByUserId(userId: string): Promise<SubscriptionRow | null>;
  findActiveByUserIds(
    userIds: string[],
  ): Promise<Array<{ userId: string; planSlug: string; planName: string; status: string }>>;
  countActive(): Promise<number>;
  countAll(): Promise<number>;
  activeMrr(): Promise<number>;
  activeMrrBefore(date: Date): Promise<number>;
  insertSubscription(input: SubscriptionInsert): Promise<SubscriptionRow>;
  updateSubscriptionById(id: string, patch: Partial<SubscriptionInsert>): Promise<SubscriptionRow | null>;
  findFirstByUserAndStatus(userId: string, status: string): Promise<SubscriptionRow | null>;
  hasEverTrialed(userId: string): Promise<boolean>;
  cancelForUserInStatuses(userId: string, statuses: string[], extra?: { cancelAtPeriodEnd?: boolean }): Promise<void>;
  cancelByProviderSubscriptionId(providerSubscriptionId: string): Promise<string[]>;
  // plans
  findPlanBySlug(slug: string): Promise<SubscriptionPlanRow | null>;
  findPlanById(id: string): Promise<SubscriptionPlanRow | null>;
  findActivePlanBySlug(slug: string): Promise<SubscriptionPlanRow | null>;
  findCheapestActivePlan(): Promise<SubscriptionPlanRow | null>;
  listAllPlans(): Promise<SubscriptionPlanRow[]>;
  // overrides
  findOverrideByUserId(userId: string): Promise<PlanOverrideRow | null>;
  findOverridesByUserIds(userIds: string[]): Promise<PlanOverrideRow[]>;
  upsertOverride(input: PlanOverrideInsert): Promise<PlanOverrideRow>;
  deleteOverrideByUserId(userId: string): Promise<boolean>;
}

export class SubscriptionsRepository implements ISubscriptionsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  // ── subscriptions ─────────────────────────────────────────────────────────

  async findActiveByUserId(userId: string): Promise<SubscriptionRow | null> {
    const [row] = await this.db
      .select()
      .from(subscriptions)
      .where(and(
        eq(subscriptions.userId, userId),
        inArray(subscriptions.status, ["active", "trialing"]),
      ))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return (row as SubscriptionRow) ?? null;
  }

  async findActiveByUserIds(userIds: string[]) {
    if (userIds.length === 0) return [];
    const rows = await this.db
      .select({
        userId: subscriptions.userId,
        planSlug: subscriptionPlans.slug,
        planName: subscriptionPlans.name,
        status: subscriptions.status,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(and(
        inArray(subscriptions.userId, userIds),
        inArray(subscriptions.status, ["active", "trialing"]),
      ))
      // Newest first so "first row per user" is deterministic and matches
      // the single-user loader in BillingService.
      .orderBy(desc(subscriptions.createdAt));
    return rows as Array<{ userId: string; planSlug: string; planName: string; status: string }>;
  }

  async countActive(): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, "active"));
    return Number(row?.n ?? 0);
  }

  async countAll(): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(subscriptions);
    return Number(row?.n ?? 0);
  }

  /** Sum of monthly price across active subs — the headline MRR metric. */
  async activeMrr(): Promise<number> {
    const [row] = await this.db
      .select({ total: sum(subscriptionPlans.priceMonthly) })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(eq(subscriptions.status, "active"));
    return Number(row?.total ?? 0);
  }

  /** MRR calculated only from subs that existed before `date`. Used for
   *  month-over-month growth comparisons. */
  async activeMrrBefore(date: Date): Promise<number> {
    const [row] = await this.db
      .select({ total: sum(subscriptionPlans.priceMonthly) })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(sql`${subscriptions.status} = 'active' AND ${subscriptions.createdAt} < ${date}`);
    return Number(row?.total ?? 0);
  }

  async insertSubscription(input: SubscriptionInsert): Promise<SubscriptionRow> {
    const [created] = await this.db.insert(subscriptions).values(input as any).returning();
    return created as SubscriptionRow;
  }

  async updateSubscriptionById(id: string, patch: Partial<SubscriptionInsert>): Promise<SubscriptionRow | null> {
    const [updated] = await this.db
      .update(subscriptions)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(subscriptions.id, id))
      .returning();
    return (updated as SubscriptionRow) ?? null;
  }

  async findFirstByUserAndStatus(userId: string, status: string): Promise<SubscriptionRow | null> {
    const [row] = await this.db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, status as any)))
      .limit(1);
    return (row as SubscriptionRow) ?? null;
  }

  /** True when ANY prior subscription carried a trial (non-null trialEnd),
   *  regardless of its current status — the one-trial-per-user rule (#2190). */
  async hasEverTrialed(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), isNotNull(subscriptions.trialEnd)))
      .limit(1);
    return Boolean(row);
  }

  /** Cancel every subscription of the user currently in one of `statuses`. */
  async cancelForUserInStatuses(
    userId: string,
    statuses: string[],
    extra: { cancelAtPeriodEnd?: boolean } = {},
  ): Promise<void> {
    const now = this.now();
    await this.db
      .update(subscriptions)
      .set({ status: "canceled", canceledAt: now, ...extra, updatedAt: now } as any)
      .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, statuses as any)));
  }

  /** Provider-side deletion → cancel locally; returns affected user ids so
   *  the caller can bust their cached plan. */
  async cancelByProviderSubscriptionId(providerSubscriptionId: string): Promise<string[]> {
    const now = this.now();
    const rows = await this.db
      .update(subscriptions)
      .set({ status: "canceled", canceledAt: now, updatedAt: now } as any)
      .where(eq(subscriptions.stripeSubscriptionId, providerSubscriptionId))
      .returning({ userId: subscriptions.userId });
    return (rows as Array<{ userId: string | null }>).map((r) => r.userId).filter((id): id is string => Boolean(id));
  }

  // ── plans ─────────────────────────────────────────────────────────────────

  async findPlanBySlug(slug: string): Promise<SubscriptionPlanRow | null> {
    const [row] = await this.db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, slug)).limit(1);
    return (row as SubscriptionPlanRow) ?? null;
  }

  async findPlanById(id: string): Promise<SubscriptionPlanRow | null> {
    const [row] = await this.db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1);
    return (row as SubscriptionPlanRow) ?? null;
  }

  async findActivePlanBySlug(slug: string): Promise<SubscriptionPlanRow | null> {
    const [row] = await this.db
      .select()
      .from(subscriptionPlans)
      .where(and(eq(subscriptionPlans.slug, slug), eq(subscriptionPlans.isActive, true)))
      .limit(1);
    return (row as SubscriptionPlanRow) ?? null;
  }

  async findCheapestActivePlan(): Promise<SubscriptionPlanRow | null> {
    const [row] = await this.db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true))
      .orderBy(asc(subscriptionPlans.priceMonthly))
      .limit(1);
    return (row as SubscriptionPlanRow) ?? null;
  }

  async listAllPlans(): Promise<SubscriptionPlanRow[]> {
    return (await this.db.select().from(subscriptionPlans)) as SubscriptionPlanRow[];
  }

  // ── overrides ─────────────────────────────────────────────────────────────

  async findOverrideByUserId(userId: string): Promise<PlanOverrideRow | null> {
    const [row] = await this.db
      .select()
      .from(userPlanOverrides)
      .where(eq(userPlanOverrides.userId, userId))
      .limit(1);
    return (row as PlanOverrideRow) ?? null;
  }

  async findOverridesByUserIds(userIds: string[]): Promise<PlanOverrideRow[]> {
    if (userIds.length === 0) return [];
    return (await this.db
      .select()
      .from(userPlanOverrides)
      .where(inArray(userPlanOverrides.userId, userIds))) as PlanOverrideRow[];
  }

  async upsertOverride(input: PlanOverrideInsert): Promise<PlanOverrideRow> {
    const [row] = await this.db
      .insert(userPlanOverrides)
      .values(input as any)
      .onConflictDoUpdate({
        target: userPlanOverrides.userId,
        set: {
          ...(input as any),
          grantedAt: this.now(),
        } as any,
      })
      .returning();
    return row as PlanOverrideRow;
  }

  async deleteOverrideByUserId(userId: string): Promise<boolean> {
    const existing = await this.findOverrideByUserId(userId);
    if (!existing) return false;
    await this.db.delete(userPlanOverrides).where(eq(userPlanOverrides.userId, userId));
    return true;
  }
}
