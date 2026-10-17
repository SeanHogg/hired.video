/**
 * AdminBillingService — SuperAdmin-initiated subscription cancel / refund.
 * Delegates the money movement to the configured payment provider (when
 * present) and always records the cancellation in our DB.
 */
import { tryGetPaymentProvider } from "../billing/payment/index.js";
import { invalidateSubscriptionCache } from "../billing/BillingService.js";
import { logger } from "../../lib/logger.js";
import {
  AdminBillingRepository,
  type SubscriptionSearch,
} from "../../repositories/admin/adminBillingRepository.js";

type Env = Record<string, string | undefined>;

export class AdminBillingService {
  constructor(private readonly repo: AdminBillingRepository) {}

  static create(): AdminBillingService {
    return new AdminBillingService(AdminBillingRepository.create());
  }

  async listSubscriptions(query: SubscriptionSearch) {
    const [{ rows, total }, summary] = await Promise.all([
      this.repo.listSubscriptions(query),
      this.repo.summary(),
    ]);
    return { subscriptions: rows, total, page: query.page, limit: query.limit, summary };
  }

  /** Returns null when the subscription does not exist. */
  async cancel(env: Env, subscriptionId: string): Promise<{ id: string; status: "canceled" } | null> {
    const sub = await this.repo.findSubscriptionOwner(subscriptionId);
    if (!sub) return null;
    const provider = tryGetPaymentProvider(env);
    if (provider?.cancelSubscription) {
      try {
        await provider.cancelSubscription(subscriptionId, false);
      } catch (err) {
        logger.error("[admin] Provider cancelSubscription failed", { subscriptionId, error: err });
        // Continue — still mark canceled in our DB
      }
    }
    await this.repo.markCanceled(subscriptionId, true);
    invalidateSubscriptionCache(sub.userId);
    return { id: subscriptionId, status: "canceled" };
  }

  /** Refunds one month and cancels immediately. Returns null when not found. */
  async refund(env: Env, subscriptionId: string, reason: string | undefined) {
    const sub = await this.repo.findSubscriptionWithPrice(subscriptionId);
    if (!sub) return null;
    const provider = tryGetPaymentProvider(env);
    let refundId: string | undefined;
    if (provider?.refundPayment) {
      try {
        const amountCents = Math.round(Number(sub.priceMonthly) * 100);
        refundId = (await provider.refundPayment(subscriptionId, amountCents, reason)).refundId;
      } catch (err) {
        logger.error("[admin] Provider refundPayment failed", { subscriptionId, error: err });
        // Continue — still mark canceled in our DB
      }
    }
    await this.repo.markCanceled(subscriptionId, false);
    invalidateSubscriptionCache(sub.userId);
    return {
      id: subscriptionId,
      status: "refunded" as const,
      amount: Number(sub.priceMonthly),
      reason: reason ?? "admin_refund",
      refundId,
    };
  }
}
