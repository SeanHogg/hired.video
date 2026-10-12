/**
 * Production wiring for TokenPackDeps. Tests never import this file; they
 * build deps from in-memory fakes (see __tests__/tokenPackUseCases.test.ts).
 */
import { getDb } from "../../../db/index.js";
import { buildRepos } from "../../../repositories/index.js";
import { tryGetPaymentProvider } from "../payment/index.js";
import { buildOneOffPaymentsPort } from "../payment/oneOffPayments.js";
import { buildTokenBudgetDTO, getSubscription } from "../BillingService.js";
import type { TokenPackDeps } from "./tokenPackUseCases.js";
import type { PendingPurchaseSource } from "./tokenPackReconcile.js";

export function buildTokenPackDeps(env: Record<string, string | undefined>): TokenPackDeps {
  return buildTokenPackDepsWithRepos(env, buildRepos(getDb()));
}

/** The reconcile cron's deps: the purchase deps plus the pending-row source. */
export function buildTokenPackReconcileDeps(env: Record<string, string | undefined>): TokenPackDeps & { pending: PendingPurchaseSource } {
  const repos = buildRepos(getDb());
  return {
    ...buildTokenPackDepsWithRepos(env, repos),
    pending: { listPending: (input) => repos.tokens.listPendingPurchases(input) },
  };
}

function buildTokenPackDepsWithRepos(env: Record<string, string | undefined>, repos: ReturnType<typeof buildRepos>): TokenPackDeps {
  const provider = tryGetPaymentProvider(env);
  return {
    payments: provider ? buildOneOffPaymentsPort(provider) : null,
    plans: { isPro: async (userId) => (await getSubscription(userId)).isPro },
    ledger: {
      recordPending: (input) => repos.tokens.recordPendingPurchase(input),
      settlePaid: (purchaseId) => repos.tokens.settlePendingPurchase(purchaseId),
      markChecked: (purchaseId, status) => repos.tokens.markPurchaseChecked(purchaseId, status),
      budgetFor: buildTokenBudgetDTO,
    },
    async onGranted({ userId, pack, paymentRef }) {
      const { GamificationService } = await import("../../../domains/gamification/index.js");
      const game = new GamificationService(repos);
      await game.awardWithRoleLookup("purchase.token_pack", {
        userId,
        refId: paymentRef,
        refType: "token_pack_purchase",
        metadata: { packId: pack.id, tokens: pack.tokens, pricePaid: pack.price },
      });
      await game.awardWithRoleLookup("purchase.any", {
        userId,
        refId: `any:${paymentRef}`,
        refType: "token_pack_purchase",
        metadata: { packId: pack.id, pricePaid: pack.price },
      });
    },
  };
}
