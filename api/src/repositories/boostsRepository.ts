/**
 * BoostsRepository — the polymorphic `boosts` aggregate (any subject) and
 * its `boost_checkouts` children: reads, owner transitions, and the
 * checkout writes the boost checkout use case drives
 * (services/advertising/boost-checkout.ts).
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { boosts, boostCheckouts, tokenPackPurchases, courseCheckouts, jobBoosts } = schema;

export type DbLike = any;
export type BoostRow = typeof boosts.$inferSelect;
export type BoostInsert = typeof boosts.$inferInsert;

/** The checkout columns the payment flow reads. */
export interface BoostCheckoutRecord {
  id: string;
  userId: string;
  boostId: string | null;
  usdCents: number;
  status: string;
  providerPaymentId: string | null;
  totalCents?: number;
  campaignDollarsCents?: number;
}

const checkoutRecord = {
  id: boostCheckouts.id,
  userId: boostCheckouts.userId,
  boostId: boostCheckouts.boostId,
  usdCents: boostCheckouts.usdCents,
  status: boostCheckouts.status,
  providerPaymentId: boostCheckouts.providerPaymentId,
  totalCents: boostCheckouts.totalCents,
  campaignDollarsCents: boostCheckouts.campaignDollarsCents,
};

export interface IBoostsRepository {
  listForUser(userId: string): Promise<BoostRow[]>;
  listActiveForSubject(subjectType: string, subjectId: string): Promise<BoostRow[]>;
  findOwnerId(boostId: string): Promise<string | null>;
  setStatus(boostId: string, status: string, at: Date): Promise<void>;
}

export class BoostsRepository implements IBoostsRepository {
  constructor(private readonly db: DbLike) {}

  async listForUser(userId: string): Promise<BoostRow[]> {
    return this.db.select().from(boosts)
      .where(eq(boosts.userId, userId))
      .orderBy(desc(boosts.createdAt));
  }

  async listActiveForSubject(subjectType: string, subjectId: string): Promise<BoostRow[]> {
    return this.db.select().from(boosts)
      .where(and(
        eq(boosts.subjectType, subjectType),
        eq(boosts.subjectId, subjectId),
        eq(boosts.status, "active"),
      ))
      .orderBy(desc(boosts.createdAt));
  }

  /** The owner's user id; null when the boost doesn't exist. */
  async findOwnerId(boostId: string): Promise<string | null> {
    const [row] = await this.db.select({ userId: boosts.userId })
      .from(boosts).where(eq(boosts.id, boostId)).limit(1);
    return row ? row.userId : null;
  }

  async setStatus(boostId: string, status: string, at: Date): Promise<void> {
    await this.db.update(boosts).set({ status, updatedAt: at }).where(eq(boosts.id, boostId));
  }

  // ─── Checkout writes (boost_checkouts) ──────────────────────────────────

  async insertPendingBoost(row: BoostInsert): Promise<BoostRow> {
    const [created] = await this.db.insert(boosts).values(row).returning();
    return created;
  }

  async insertCheckout(row: { userId: string; boostId: string; totalCents: number }): Promise<{ id: string }> {
    const [created] = await this.db
      .insert(boostCheckouts)
      .values({ ...row, status: "pending" })
      .returning({ id: boostCheckouts.id });
    return created;
  }

  async recordCheckoutSplit(
    checkoutId: string,
    split: { campaignDollarsCents: number; usdCents: number; paid: boolean; at: Date },
  ): Promise<void> {
    await this.db
      .update(boostCheckouts)
      .set({
        campaignDollarsCents: split.campaignDollarsCents,
        usdCents: split.usdCents,
        status: split.paid ? "paid" : "pending",
        paidAt: split.paid ? split.at : null,
        updatedAt: split.at,
      })
      .where(eq(boostCheckouts.id, checkoutId));
  }

  async activateBoost(boostId: string, at: Date): Promise<BoostRow | null> {
    const [row] = await this.db
      .update(boosts)
      .set({ status: "active", updatedAt: at })
      .where(eq(boosts.id, boostId))
      .returning();
    return row ?? null;
  }

  async findCheckout(checkoutId: string): Promise<BoostCheckoutRecord | null> {
    const [row] = await this.db.select(checkoutRecord).from(boostCheckouts).where(eq(boostCheckouts.id, checkoutId)).limit(1);
    return row ?? null;
  }

  /** Latest checkout of a boost. */
  async findCheckoutForBoost(boostId: string): Promise<BoostCheckoutRecord | null> {
    const [row] = await this.db
      .select(checkoutRecord)
      .from(boostCheckouts)
      .where(eq(boostCheckouts.boostId, boostId))
      .orderBy(desc(boostCheckouts.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** pending → paid with this provider payment id, in ONE statement, only
   *  when the id isn't already used by any boost checkout, token pack,
   *  course checkout or job boost. True only for the call that claimed it. */
  async claimCheckoutPayment(checkoutId: string, providerPaymentId: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(boostCheckouts)
      .set({ providerPaymentId, status: "paid", paidAt: at, updatedAt: at })
      .where(
        and(
          eq(boostCheckouts.id, checkoutId),
          eq(boostCheckouts.status, "pending"),
          sql`NOT EXISTS (SELECT 1 FROM ${boostCheckouts} AS used WHERE used.provider_payment_id = ${providerPaymentId})`,
          sql`NOT EXISTS (SELECT 1 FROM ${tokenPackPurchases} WHERE ${tokenPackPurchases.stripePaymentIntentId} = ${providerPaymentId})`,
          sql`NOT EXISTS (SELECT 1 FROM ${courseCheckouts} WHERE ${courseCheckouts.providerPaymentId} = ${providerPaymentId})`,
          sql`NOT EXISTS (SELECT 1 FROM ${jobBoosts} WHERE ${jobBoosts.stripePaymentIntentId} = ${providerPaymentId})`,
        ),
      )
      .returning({ id: boostCheckouts.id });
    return rows.length > 0;
  }
}
