/**
 * Token-pack purchase use cases (shared/token-packs.ts is the contract).
 *
 *   startTokenPackCheckout   — Pro user picks a pack; the SERVER prices it
 *                              from TOKEN_PACKS and opens a one-off charge in
 *                              the payment widget. The client never sends
 *                              an amount.
 *   confirmTokenPackPurchase — after the widget charges the card, record the
 *                              charge as `pending` FIRST (gap #2352), then
 *                              re-read the transaction from the payment
 *                              provider and credit the pack only if it is
 *                              approved, for the exact pack price, in USD, on
 *                              this user's provider customer. A provider
 *                              outage leaves the row pending for the
 *                              reconcile cron (tokenPackReconcile.ts) instead
 *                              of losing a paid purchase.
 *   checkPendingPurchase     — the one provider check + settle step, shared
 *                              by confirm and the cron.
 *   creditPendingPurchase    — the credit itself: the pending → paid flip and
 *                              the balance bump are one statement, and only
 *                              the call that flips the row credits — a
 *                              replayed confirm, a concurrent cron run or a
 *                              webhook can never credit twice (#2200).
 *
 * Throws a typed `TokenPackError(kind)`; the token_pack checkout kind
 * (services/billing/checkout/kinds/tokenPack.ts) maps it to CheckoutError.
 */
import {
  findTokenPack,
  tokenPackPriceCents,
  type TokenPack,
} from "../../../../../shared/pricing.js";
import type { TokenBudgetDTO } from "../../../../../shared/billing.js";
import {
  parseTokenPackInvoiceNumber,
  tokenPackInvoiceNumber,
  type ConfirmTokenPackResultDTO,
  type TokenPackErrorKind,
} from "../../../../../shared/token-packs.js";
import type {
  CollectPaymentMethodResult,
  ProviderTransaction,
} from "../payment/types.js";
import { isApprovedOneOffPayment, type OneOffPaymentsPort } from "../payment/oneOffPayments.js";
import {
  PaymentAlreadyClaimedError,
  type TokenPackPurchaseInsert,
  type TokenPackPurchaseRow,
} from "../../../repositories/tokensRepository.js";

export class TokenPackError extends Error {
  constructor(public readonly kind: TokenPackErrorKind, message: string) {
    super(message);
    this.name = "TokenPackError";
  }
}

const PACK_CURRENCY = "USD";

// ── ports ──────────────────────────────────────────────────────────────────

/** One-off payments, provider-agnostic (shared with paid boosts). Null when
 *  no provider is configured. */
export type PackPaymentsPort = OneOffPaymentsPort;

export interface PackLedgerPort {
  /** Insert the charge as pending, or return the row its reference already has. */
  recordPending(input: TokenPackPurchaseInsert): Promise<TokenPackPurchaseRow>;
  /** pending → paid + balance credit, atomically; true only for the flipper. */
  settlePaid(purchaseId: string): Promise<boolean>;
  markChecked(purchaseId: string, status: "pending" | "rejected" | "expired"): Promise<void>;
  budgetFor(userId: string): Promise<TokenBudgetDTO>;
}

export interface TokenPackDeps {
  payments: PackPaymentsPort | null;
  ledger: PackLedgerPort;
  plans: { isPro(userId: string): Promise<boolean> };
  /** Best-effort side effects after a credit (points, cache busts). */
  onGranted(input: { userId: string; pack: TokenPack; paymentRef: string }): Promise<void>;
}

function requirePack(packId: string): TokenPack {
  const pack = findTokenPack(packId);
  if (!pack) throw new TokenPackError("UNKNOWN_PACK", "That token pack doesn't exist");
  return pack;
}

function requirePayments(deps: TokenPackDeps): PackPaymentsPort {
  if (!deps.payments || !deps.payments.supportsOneOffPurchases) {
    throw new TokenPackError("PAYMENTS_UNAVAILABLE", "Token packs can't be bought right now");
  }
  return deps.payments;
}

// ── use cases ──────────────────────────────────────────────────────────────

/** The pack this user may buy right now (known pack + Pro), without opening
 *  the payment widget. */
export async function requirePurchasablePack(
  deps: Pick<TokenPackDeps, "plans">,
  input: { userId: string; packId: string },
): Promise<TokenPack> {
  const pack = requirePack(input.packId);
  // Packs top up the Pro allowance; free accounts upgrade to Pro first
  // (paid AI is a Pro feature — feedback_paid_ai_is_pro).
  if (!(await deps.plans.isPro(input.userId))) {
    throw new TokenPackError("PRO_REQUIRED", "Token packs are available on Pro");
  }
  return pack;
}

export async function startTokenPackCheckout(
  deps: TokenPackDeps,
  input: { userId: string; packId: string; successUrl: string; cancelUrl: string },
): Promise<{ pack: TokenPack; collection: CollectPaymentMethodResult }> {
  const pack = await requirePurchasablePack(deps, input);
  const payments = requirePayments(deps);
  const customerId = await payments.customerIdFor(input.userId);
  const collection = await payments.initPurchase({
    customerId,
    amount: pack.price,
    currency: PACK_CURRENCY,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    invoiceNumber: tokenPackInvoiceNumber(pack.id),
  });
  return { pack, collection };
}

/** Pure: does the provider's record prove this user paid for this pack? */
export function isPaymentForPack(
  tx: ProviderTransaction,
  pack: TokenPack,
  customerId: string,
): boolean {
  return isApprovedOneOffPayment(tx, { amountCents: tokenPackPriceCents(pack), currency: PACK_CURRENCY, customerId });
}

/** Provider checks a pending purchase gets (confirm + cron) before it expires. */
export const TOKEN_PACK_MAX_CHECKS = 12;

export type PendingCheckOutcome = "credited" | "already_credited" | "pending" | "rejected" | "expired";

type PendingRow = Pick<TokenPackPurchaseRow, "id" | "userId" | "packId" | "status" | "checkAttempts" | "stripePaymentIntentId">;

/**
 * Ask the provider about one pending purchase and settle it: credit when the
 * charge proves this pack was paid, reject when the provider says it wasn't,
 * keep it pending when the provider can't answer (outage, not visible yet) —
 * until TOKEN_PACK_MAX_CHECKS, then expire it. Shared by confirm and the
 * reconcile cron so both settle a row the same way.
 */
export async function checkPendingPurchase(
  deps: Pick<TokenPackDeps, "ledger" | "onGranted"> & { payments: PackPaymentsPort },
  row: PendingRow,
): Promise<PendingCheckOutcome> {
  if (row.status === "paid") return "already_credited";
  if (row.status !== "pending") return row.status === "expired" ? "expired" : "rejected";
  const pack = findTokenPack(row.packId);
  const ref = row.stripePaymentIntentId;
  if (!pack || !ref) {
    await deps.ledger.markChecked(row.id, "rejected");
    return "rejected";
  }
  let tx: ProviderTransaction | null = null;
  let customerId: string | null = null;
  try {
    [tx, customerId] = await Promise.all([
      deps.payments.getTransaction(ref),
      deps.payments.customerIdFor(row.userId),
    ]);
  } catch (err) {
    console.warn("[token-packs] provider check failed; purchase stays pending", { purchaseId: row.id, err: String(err) });
  }
  if (tx && customerId) {
    if (!isPaymentForPack(tx, pack, customerId)) {
      await deps.ledger.markChecked(row.id, "rejected");
      return "rejected";
    }
    const { granted } = await creditPendingPurchase(deps, { purchaseId: row.id, userId: row.userId, pack, paymentRef: ref });
    return granted ? "credited" : "already_credited";
  }
  // No answer: the transaction isn't visible yet or the provider is down.
  const expired = (row.checkAttempts ?? 0) + 1 >= TOKEN_PACK_MAX_CHECKS;
  await deps.ledger.markChecked(row.id, expired ? "expired" : "pending");
  return expired ? "expired" : "pending";
}

export async function confirmTokenPackPurchase(
  deps: TokenPackDeps,
  input: { userId: string; packId: string; transactionId: string },
): Promise<ConfirmTokenPackResultDTO> {
  const pack = requirePack(input.packId);
  const payments = requirePayments(deps);
  // Recorded BEFORE the provider check: from here on the charge can't be
  // lost — if this request dies, the cron finishes the job.
  const row = await deps.ledger
    .recordPending({
      userId: input.userId,
      packId: pack.id,
      tokensGranted: pack.tokens,
      pricePaid: pack.price.toFixed(2),
      currency: PACK_CURRENCY,
      // Legacy column name; holds the provider transaction id for any provider.
      stripePaymentIntentId: input.transactionId,
    })
    .catch((err: unknown) => {
      // The payment already paid for a boost or course checkout.
      if (err instanceof PaymentAlreadyClaimedError) {
        throw new TokenPackError("PAYMENT_NOT_VERIFIED", "We couldn't verify that payment");
      }
      throw err;
    });
  // The reference is already recorded for another account or another pack.
  if (row.userId !== input.userId || row.packId !== pack.id) {
    throw new TokenPackError("PAYMENT_NOT_VERIFIED", "We couldn't verify that payment");
  }
  const outcome = await checkPendingPurchase({ ...deps, payments }, row);
  if (outcome === "rejected" || outcome === "expired") {
    throw new TokenPackError("PAYMENT_NOT_VERIFIED", "We couldn't verify that payment");
  }
  const granted = outcome === "credited";
  return {
    granted,
    pending: outcome === "pending",
    tokensGranted: granted ? pack.tokens : 0,
    tokenBudget: await deps.ledger.budgetFor(input.userId),
  };
}

export async function creditPendingPurchase(
  deps: Pick<TokenPackDeps, "ledger" | "onGranted">,
  input: { purchaseId: string; userId: string; pack: TokenPack; paymentRef: string },
): Promise<{ granted: boolean }> {
  if (!(await deps.ledger.settlePaid(input.purchaseId))) return { granted: false };
  try {
    await deps.onGranted({ userId: input.userId, pack: input.pack, paymentRef: input.paymentRef });
  } catch (err) {
    console.warn("[token-packs] post-grant side effects failed", { userId: input.userId, err: String(err) });
  }
  return { granted: true };
}

export type TokenPackWebhookOutcome =
  | "credited"
  | "already_credited"
  | "pending"
  | "rejected"
  | "unresolved"
  | "ignored";

/** Pack id + provider transaction id from a normalised webhook, or null. */
export function tokenPackConfirmFromWebhook(payload: {
  invoiceNumber?: string;
  providerInvoiceId?: string | number;
  raw?: unknown;
}): { packId: string; transactionId: string } | null {
  const raw = payload.raw && typeof payload.raw === "object"
    ? (payload.raw as Record<string, unknown>)
    : null;
  const nested = raw?.data && typeof raw.data === "object"
    ? (raw.data as Record<string, unknown>)
    : null;
  const invoiceNumber =
    payload.invoiceNumber
    ?? (typeof raw?.invoiceNumber === "string" ? raw.invoiceNumber : undefined)
    ?? (typeof nested?.invoiceNumber === "string" ? nested.invoiceNumber : undefined);
  const packId = parseTokenPackInvoiceNumber(invoiceNumber);
  const transactionId = payload.providerInvoiceId != null ? String(payload.providerInvoiceId) : "";
  if (!packId || !transactionId) return null;
  return { packId, transactionId };
}

/**
 * Credit a token pack from `invoice.paid` / Helcim `transaction.approved`
 * when the checkout tagged HelcimPay with `token-pack:{packId}`. The tab
 * can close before POST /confirm; this is the path that still records
 * pending and settles (gap #2352). Returns `ignored` when the event is
 * not a pack purchase so the Stripe invoice handler can run.
 */
export async function confirmTokenPackFromWebhook(
  deps: TokenPackDeps,
  payload: {
    invoiceNumber?: string;
    providerInvoiceId?: string | number;
    customerId?: string;
    raw?: unknown;
  },
  userIdForCustomer: (customerId: string) => Promise<string | null>,
): Promise<TokenPackWebhookOutcome> {
  const pack = tokenPackConfirmFromWebhook(payload);
  if (!pack) return "ignored";

  let userId = payload.customerId ? await userIdForCustomer(payload.customerId) : null;
  if (!userId && deps.payments) {
    try {
      const tx = await deps.payments.getTransaction(pack.transactionId);
      if (tx?.customerId) userId = await userIdForCustomer(tx.customerId);
    } catch (err) {
      console.warn("[token-packs] webhook customer lookup failed", { err: String(err) });
    }
  }
  if (!userId) return "unresolved";

  try {
    const result = await confirmTokenPackPurchase(deps, {
      userId,
      packId: pack.packId,
      transactionId: pack.transactionId,
    });
    if (result.granted) return "credited";
    if (result.pending) return "pending";
    return "already_credited";
  } catch (err) {
    if (err instanceof TokenPackError) {
      if (err.kind === "PAYMENT_NOT_VERIFIED") return "rejected";
      console.warn("[token-packs] webhook confirm failed", { kind: err.kind, err: err.message });
      return "unresolved";
    }
    throw err;
  }
}
