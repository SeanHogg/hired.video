/**
 * Checkout kind "token_pack" — Pro AI-token top-ups. Adapts the token-pack
 * use cases (services/billing/token-packs/tokenPackUseCases.ts), which keep
 * the pending-first ledger, the reconcile cron and the webhook path (#2352).
 *
 * A pack checkout has no row until confirm: its key is the pack id, `start`
 * checks the pack can be bought (known pack + Pro), `pay` opens the widget
 * for the pack's server price, and `confirm` records the charge pending,
 * verifies it with the provider and credits the pack exactly once.
 */
import { checkoutIdFor, type CheckoutDTO } from "../../../../../../shared/checkout.js";
import { tokenPackPriceCents, type TokenPack } from "../../../../../../shared/pricing.js";
import { buildTokenPackDeps } from "../../token-packs/tokenPackDeps.js";
import {
  confirmTokenPackPurchase,
  requirePurchasablePack,
  startTokenPackCheckout,
  TokenPackError,
  type TokenPackDeps,
} from "../../token-packs/tokenPackUseCases.js";
import { CHECKOUT_CURRENCY, CheckoutError, type CheckoutKindHandler } from "../types.js";

function toDTO(pack: TokenPack): CheckoutDTO<"token_pack"> {
  const totalCents = tokenPackPriceCents(pack);
  return {
    id: checkoutIdFor("token_pack", pack.id),
    kind: "token_pack",
    status: "pending",
    totalCents,
    amountDueCents: totalCents,
    currency: CHECKOUT_CURRENCY,
    details: { packId: pack.id, tokens: pack.tokens },
  };
}

/** Token-pack refusals share the checkout error vocabulary. */
async function asCheckout<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TokenPackError) throw new CheckoutError(err.kind, err.message);
    throw err;
  }
}

export function createTokenPackCheckoutKind(
  depsFor: (env: Record<string, string | undefined>) => TokenPackDeps = buildTokenPackDeps,
): CheckoutKindHandler<"token_pack"> {
  return {
    kind: "token_pack",

    start: (ctx, input) =>
      asCheckout(async () => toDTO(await requirePurchasablePack(depsFor(ctx.env), { userId: ctx.userId, packId: input.packId }))),

    get: (ctx, key) =>
      asCheckout(async () => toDTO(await requirePurchasablePack(depsFor(ctx.env), { userId: ctx.userId, packId: key }))),

    pay: (ctx, key, urls) =>
      asCheckout(async () => {
        const { pack, collection } = await startTokenPackCheckout(depsFor(ctx.env), { userId: ctx.userId, packId: key, ...urls });
        return { id: checkoutIdFor("token_pack", pack.id), amountDueCents: tokenPackPriceCents(pack), collection };
      }),

    confirm: (ctx, key, transactionId) =>
      asCheckout(async () => {
        const r = await confirmTokenPackPurchase(depsFor(ctx.env), { userId: ctx.userId, packId: key, transactionId });
        return {
          id: checkoutIdFor("token_pack", key),
          kind: "token_pack",
          pending: r.pending,
          outcome: { granted: r.granted, tokensGranted: r.tokensGranted, tokenBudget: r.tokenBudget },
        };
      }),
  };
}
