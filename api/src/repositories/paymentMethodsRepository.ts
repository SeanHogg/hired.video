/**
 * PaymentMethodsRepository — the local mirror of provider-saved payment
 * methods (`payment_methods`). The `stripe_payment_method_id` column stores
 * whichever provider's opaque id (Stripe pm_xxx, Helcim token).
 *
 * Every user-facing lookup is scoped by `userId` so a caller can never read,
 * flip or detach another user's method by guessing its row id.
 */

import { and, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { paymentMethods } = schema;

export type DbLike = any;

export type PaymentMethodRow = typeof paymentMethods.$inferSelect;
export type PaymentMethodInsert = typeof paymentMethods.$inferInsert;

export class PaymentMethodsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async clearDefaultsForUser(userId: string): Promise<void> {
    await this.db.update(paymentMethods).set({ isDefault: false } as any).where(eq(paymentMethods.userId, userId));
  }

  async findIdByProviderIdForUser(providerPaymentMethodId: string, userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(and(
        eq(paymentMethods.stripePaymentMethodId, providerPaymentMethodId),
        eq(paymentMethods.userId, userId),
      ))
      .limit(1);
    return (row?.id as string | undefined) ?? null;
  }

  /** Provider id of the user's own method row, or null when not theirs/missing. */
  async findProviderIdForUser(id: string, userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ stripePaymentMethodId: paymentMethods.stripePaymentMethodId })
      .from(paymentMethods)
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, userId)))
      .limit(1);
    return (row?.stripePaymentMethodId as string | undefined) ?? null;
  }

  async setDefaultFlag(id: string, isDefault: boolean): Promise<void> {
    await this.db
      .update(paymentMethods)
      .set({ isDefault, updatedAt: this.now() } as any)
      .where(eq(paymentMethods.id, id));
  }

  async insert(input: PaymentMethodInsert): Promise<void> {
    await this.db.insert(paymentMethods).values(input as any);
  }

  /** Provider webhook `payment_method.detached`. */
  async deleteByProviderId(providerPaymentMethodId: string): Promise<void> {
    await this.db.delete(paymentMethods).where(eq(paymentMethods.stripePaymentMethodId, providerPaymentMethodId));
  }
}
