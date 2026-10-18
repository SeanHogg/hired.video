/**
 * CompanySubscriptionsRepository — employer seat-based plans
 * (`company_subscriptions`, one row per company) plus the seat-usage count
 * they bill against (active `user_company_role_associations`).
 */

import { and, count, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { companySubscriptions, userCompanyRoleAssociations } = schema;

export type DbLike = any;

export type CompanySubscriptionRow = typeof companySubscriptions.$inferSelect;
export type CompanySubscriptionInsert = typeof companySubscriptions.$inferInsert;

export type CompanySeatPlanPatch = Pick<
  CompanySubscriptionInsert,
  "seatCount" | "planTier" | "pricePerSeatCents" | "billingInterval"
>;

export class CompanySubscriptionsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findByCompanyId(companyId: string): Promise<CompanySubscriptionRow | null> {
    const [row] = await this.db
      .select()
      .from(companySubscriptions)
      .where(eq(companySubscriptions.companyId, companyId))
      .limit(1);
    return (row as CompanySubscriptionRow) ?? null;
  }

  /** Seats in use = active member associations of the company. */
  async countActiveSeats(companyId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(userCompanyRoleAssociations)
      .where(and(
        eq(userCompanyRoleAssociations.companyId, companyId),
        eq(userCompanyRoleAssociations.isActive, true),
      ));
    return Number(row?.total ?? 0);
  }

  /**
   * Set the company's seat plan in ONE statement: a new row starts active
   * with a 30-day period; an existing row only takes the seat/price/tier
   * fields (status + period untouched). `company_id` is unique, so the
   * conflict target replaces the old select-then-insert race.
   */
  async upsertSeatPlan(companyId: string, patch: CompanySeatPlanPatch): Promise<CompanySubscriptionRow> {
    const now = this.now();
    const [row] = await this.db
      .insert(companySubscriptions)
      .values({
        companyId,
        ...patch,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      } as any)
      .onConflictDoUpdate({
        target: companySubscriptions.companyId,
        set: { ...patch, updatedAt: now } as any,
      })
      .returning();
    return row as CompanySubscriptionRow;
  }
}
