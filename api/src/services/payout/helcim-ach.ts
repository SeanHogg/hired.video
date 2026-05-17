/**
 * Helcim ACH outbound payout provider.
 *
 * Onboarding   — opens a HelcimPay session in `verify` mode with
 *                paymentMethod=ach. The recipient enters their routing +
 *                account number into the Helcim-hosted modal; on success
 *                Helcim returns a `bankToken` we persist as the recipient's
 *                provider_account_id. We never see raw bank details.
 *
 * Push payment — POST /v2/payment/ach with type=credit. Funds debit our
 *                merchant account and credit the recipient's tokenised
 *                bank account on the next ACH effective date.
 *
 * Webhook      — Helcim shares its webhook URL across acquiring (inbound)
 *                and ACH (outbound). The PaymentProvider verifies the
 *                shared signature and hands raw events to this provider's
 *                `verifyAndNormalizeWebhook`, which returns null for events
 *                that aren't payout-related.
 *
 * Reuses HELCIM_API_TOKEN + HELCIM_WEBHOOK_TOKEN from the inbound config —
 * the user told us "we have helcim for ACH" so the merchant account is
 * already ACH-enabled.
 */

import type {
  PayoutProvider,
  PayoutOnboardingSession,
  CreatePayoutInput,
  CreatePayoutResult,
  NormalizedPayoutWebhookPayload,
  PayoutEventType,
} from "./types.js";

const HELCIM_API_BASE = "https://api.helcim.com/v2";
const HELCIM_PAY_JS = "https://secure.helcim.app/helcim-pay/services/start.js";

interface HelcimAchConfig {
  apiToken: string;
  webhookToken?: string;
}

async function helcimRequest<T = unknown>(
  config: HelcimAchConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${HELCIM_API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "api-token": config.apiToken,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Helcim ACH API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// Helcim ACH lifecycle events. Helcim names them under the same `ach.*`
// prefix as their dashboard; we only care about the three terminal-ish
// states. Any event not in this map returns null from verifyAndNormalizeWebhook
// so the PaymentProvider can claim it.
const HELCIM_ACH_EVENT_MAP: Record<string, PayoutEventType> = {
  "ach.credit.sent": "payout.sent",
  "ach.credit.settled": "payout.settled",
  "ach.credit.returned": "payout.reversed",
  "ach.credit.failed": "payout.failed",
};

export class HelcimAchPayoutProvider implements PayoutProvider {
  readonly name = "helcim_ach" as const;

  constructor(private readonly config: HelcimAchConfig) {}

  async startOnboardingSession(
    _userId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<PayoutOnboardingSession> {
    // `paymentType: verify` tokenises the bank without billing. Helcim's
    // success postMessage delivers a `bankToken` the frontend forwards to
    // /complete; we store that as the recipient's provider_account_id.
    const res = await helcimRequest<{ checkoutToken: string }>(
      this.config,
      "POST",
      "/helcim-pay/initialize",
      {
        paymentType: "verify",
        paymentMethod: "ach",
        currency: "USD",
        successUrl,
        cancelUrl,
      },
    );

    return {
      flowType: "embedded",
      checkoutToken: res.checkoutToken,
      sdkScriptUrl: HELCIM_PAY_JS,
    };
  }

  async createPayout(input: CreatePayoutInput): Promise<CreatePayoutResult> {
    // POST /v2/payment/ach — `type: credit` pushes funds OUT. The recipient
    // is identified by their tokenised bankToken (providerAccountId).
    // Helcim returns a transactionId plus a status — `pending` until the
    // ACH batch settles on the effective date.
    const body: Record<string, unknown> = {
      type: "credit",
      amount: input.amountCents / 100,
      currency: input.currency,
      bankToken: input.providerAccountId,
      idempotencyKey: input.payoutId,
    };
    if (input.memo) body.statementDescriptor = input.memo.slice(0, 22);

    const res = await helcimRequest<{
      transactionId: number | string;
      status?: string;
    }>(this.config, "POST", "/payment/ach", body);

    return {
      providerPayoutId: String(res.transactionId),
      providerStatus: res.status ?? "pending",
      isSettled: false,
    };
  }

  async verifyAndNormalizeWebhook(
    body: string,
    headers: Headers,
  ): Promise<NormalizedPayoutWebhookPayload | null> {
    if (!this.config.webhookToken) {
      throw new Error("HELCIM_WEBHOOK_TOKEN is not configured");
    }
    const signature = headers.get("helcim-signature");
    if (!signature) throw new Error("Missing helcim-signature header");

    const { createHmac } = await import("node:crypto");
    const expected = createHmac("sha256", this.config.webhookToken).update(body).digest("hex");
    if (signature !== expected) {
      throw new Error("Helcim webhook signature verification failed");
    }

    const payload = JSON.parse(body) as Record<string, unknown>;
    const eventTypeRaw = String(payload.eventType ?? "");
    const eventType = HELCIM_ACH_EVENT_MAP[eventTypeRaw];
    if (!eventType) return null; // Not an ACH payout event — let the PaymentProvider handle it.

    return {
      eventId: String(payload.eventId ?? payload.transactionId ?? Date.now()),
      eventType,
      providerPayoutId: payload.transactionId != null ? String(payload.transactionId) : undefined,
      providerStatus: payload.status as string | undefined,
      failureReason: payload.returnReason as string | undefined,
      raw: payload,
    };
  }
}
