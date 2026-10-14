/**
 * Token-pack purchase contract — shared by the API (routes/token-packs.ts →
 * services/billing/token-packs) and the frontend buy sheet.
 *
 * Flow: the client asks the server to START a checkout for a pack id; the
 * server prices it from TOKEN_PACKS (the client never sends an amount) and
 * returns the payment-widget init. After the widget charges the card, the
 * client CONFIRMS with the provider transaction id; the server re-reads that
 * transaction from the provider and credits the pack only when it is
 * approved, for the exact pack price, on this user's customer record. The
 * transaction id is unique in `token_pack_purchases`, so a replayed confirm
 * can never credit twice. The charge is recorded `pending` before that check;
 * if the provider can't answer, confirm returns `pending: true` and the
 * 5-minute cron finishes the credit (gap #2352).
 */
import { z } from "zod";
import type { TokenBudgetDTO } from "./billing.js";

/** `token_pack_purchases.pack_id` for SuperAdmin grants (price 0) — never
 *  counted as revenue. */
export const ADMIN_GRANT_PACK_ID = "admin_grant";

export const StartTokenPackCheckoutSchema = z.object({
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});
export type StartTokenPackCheckoutInput = z.infer<typeof StartTokenPackCheckoutSchema>;

export const ConfirmTokenPackSchema = z.object({
  packId: z.string().min(1).max(50),
  transactionId: z.string().min(1).max(100),
});
export type ConfirmTokenPackInput = z.infer<typeof ConfirmTokenPackSchema>;

/**
 * HelcimPay.js `invoiceNumber` for a pack checkout (gap #2352). The widget
 * does not tell the webhook which pack was bought; tagging the initialize
 * call lets `transaction.approved` credit the same SKU if the tab closes
 * before POST /confirm. Format is ours, not Helcim's.
 */
export const TOKEN_PACK_INVOICE_PREFIX = "token-pack:";

export function tokenPackInvoiceNumber(packId: string): string {
  return `${TOKEN_PACK_INVOICE_PREFIX}${packId}`;
}

/** Pack id encoded in a Helcim invoiceNumber, or null when it isn't ours. */
export function parseTokenPackInvoiceNumber(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(TOKEN_PACK_INVOICE_PREFIX)) return null;
  const packId = value.slice(TOKEN_PACK_INVOICE_PREFIX.length);
  return packId.length > 0 && packId.length <= 50 ? packId : null;
}

export const TOKEN_PACK_ERROR_KINDS = [
  "UNKNOWN_PACK",
  "PRO_REQUIRED",
  "PAYMENTS_UNAVAILABLE",
  "PAYMENT_NOT_VERIFIED",
] as const;
export type TokenPackErrorKind = (typeof TOKEN_PACK_ERROR_KINDS)[number];

export function isTokenPackErrorKind(v: unknown): v is TokenPackErrorKind {
  return typeof v === "string" && (TOKEN_PACK_ERROR_KINDS as readonly string[]).includes(v);
}

/** i18n key for a purchase failure — the one mapping every surface uses. */
export function tokenPackErrorKey(kind: unknown): string {
  return isTokenPackErrorKind(kind) ? `billing.tokenPacks.error.${kind}` : "billing.tokenPacks.error.generic";
}

export interface ConfirmTokenPackResultDTO {
  /** False when this transaction was already credited (idempotent replay)
   *  or is still pending. */
  granted: boolean;
  /** True when the payment provider couldn't confirm the charge yet: the
   *  purchase is recorded and the reconcile cron credits it within minutes
   *  (gap #2352). */
  pending: boolean;
  tokensGranted: number;
  tokenBudget: TokenBudgetDTO;
}
