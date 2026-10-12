/**
 * Tremendous outbound payout provider (gift cards / digital rewards).
 *
 * Onboarding   — no-op on the provider side. The recipient's email IS the
 *                account reference; we just confirm + store it. Returns
 *                flowType="email" so the frontend skips the hosted-widget
 *                step and POSTs straight to /complete.
 *
 * Push payment — POST /api/v2/orders with a single reward. Tremendous
 *                emails a claim link the recipient redeems for their
 *                choice of Visa / Amazon / Venmo / PayPal / 1000+ options.
 *                Default reward catalog is "ACH" + major gift cards;
 *                creators in regions without those rails fall back to
 *                gift cards.
 *
 * Webhook      — POST /api/payouts/webhook/tremendous (separate URL from
 *                the inbound payment webhook; Tremendous uses its own
 *                signature scheme so the inbound dispatcher would reject
 *                it). Events: REWARDS.DELIVERED / REDEEMED / FAILED.
 *
 * Required secret (wrangler secret put):
 *   TREMENDOUS_API_KEY      — generated in Tremendous dashboard
 * Optional:
 *   TREMENDOUS_FUNDING_ID   — which funding source to debit (defaults to
 *                             the account's primary; required if multiple)
 *   TREMENDOUS_CAMPAIGN_ID  — branded campaign template id; if absent we
 *                             pass `products: [...]` directly per call
 *   TREMENDOUS_WEBHOOK_SECRET — for webhook signature verification
 *   TREMENDOUS_ENV          — "production" | "sandbox" (defaults sandbox
 *                             so accidental real money requires a flip)
 */

import type {
  PayoutProvider,
  PayoutOnboardingSession,
  CreatePayoutInput,
  CreatePayoutResult,
  NormalizedPayoutWebhookPayload,
  PayoutEventType,
} from "./types.js";

interface TremendousConfig {
  apiKey: string;
  fundingId?: string;
  campaignId?: string;
  webhookSecret?: string;
  env: "production" | "sandbox";
}

function baseUrl(config: TremendousConfig): string {
  return config.env === "production"
    ? "https://api.tremendous.com/api/v2"
    : "https://testflight.tremendous.com/api/v2";
}

async function tremendousRequest<T = unknown>(
  config: TremendousConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${baseUrl(config)}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Tremendous API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// Tremendous webhook event names. Anything outside this set returns null
// from verifyAndNormalizeWebhook so the dispatcher can drop the event.
const TREMENDOUS_EVENT_MAP: Record<string, PayoutEventType> = {
  "REWARDS.DELIVERED": "payout.sent",
  "REWARDS.REDEEMED": "payout.settled",
  "REWARDS.FAILED": "payout.failed",
  "REWARDS.CANCELED": "payout.reversed",
};

interface TremendousOrderResponse {
  order?: {
    id: string;
    status?: string;
    rewards?: Array<{ id: string; status?: string }>;
  };
}

export class TremendousPayoutProvider implements PayoutProvider {
  readonly name = "tremendous" as const;

  constructor(private readonly config: TremendousConfig) {}

  async startOnboardingSession(
    _userId: string,
    _successUrl: string,
    _cancelUrl: string,
  ): Promise<PayoutOnboardingSession> {
    // No hosted widget — the frontend just collects the recipient email
    // and POSTs to /complete. flowType=email signals that.
    return { flowType: "email" };
  }

  async createPayout(input: CreatePayoutInput): Promise<CreatePayoutResult> {
    // The minimal order shape works for both campaign-based and direct
    // product orders. If a campaign id is configured the reward inherits
    // its branding + product list; otherwise default to the digital
    // catalog (Visa + major gift cards).
    const body: Record<string, unknown> = {
      external_id: input.payoutId,
      payment: this.config.fundingId
        ? { funding_source_id: this.config.fundingId }
        : undefined,
      reward: {
        value: { denomination: input.amountCents / 100, currency_code: input.currency },
        recipient: { email: input.providerAccountId },
        delivery: { method: "EMAIL" },
        ...(this.config.campaignId
          ? { campaign_id: this.config.campaignId }
          : { products: ["OKMZ4D03U18F"] }), // Visa Virtual digital — global default
        ...(input.memo ? { custom_fields: [{ id: "memo", value: input.memo }] } : {}),
      },
    };

    const res = await tremendousRequest<TremendousOrderResponse>(
      this.config,
      "POST",
      "/orders",
      body,
    );

    const orderId = res.order?.id;
    if (!orderId) throw new Error("Tremendous order creation did not return an id");

    // Tremendous emails the reward as part of order creation — we consider
    // it 'sent' on the synchronous response. Settlement (REDEEMED) lands
    // later via webhook when the recipient claims the card.
    return {
      providerPayoutId: orderId,
      providerStatus: res.order?.status ?? "EXECUTED",
      isSettled: false,
    };
  }

  async verifyAndNormalizeWebhook(
    body: string,
    headers: Headers,
  ): Promise<NormalizedPayoutWebhookPayload | null> {
    if (!this.config.webhookSecret) {
      throw new Error("TREMENDOUS_WEBHOOK_SECRET is not configured");
    }
    // Tremendous signs webhooks with HMAC-SHA256 over the raw body. The
    // signature header is `Tremendous-Webhook-Signature` and carries a
    // `t=<unix>,v1=<hex>` pair like Stripe does.
    const sigHeader = headers.get("tremendous-webhook-signature");
    if (!sigHeader) throw new Error("Missing tremendous-webhook-signature header");

    const parts = Object.fromEntries(
      sigHeader.split(",").map((p) => {
        const [k, v] = p.split("=");
        return [k.trim(), v?.trim() ?? ""];
      }),
    );
    const timestamp = parts.t;
    const v1 = parts.v1;
    if (!timestamp || !v1) throw new Error("Malformed tremendous-webhook-signature header");

    const { createHmac, timingSafeEqual } = await import("node:crypto");
    const signed = `${timestamp}.${body}`;
    const expected = createHmac("sha256", this.config.webhookSecret).update(signed).digest("hex");
    const a = Buffer.from(v1, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error("Tremendous webhook signature verification failed");
    }

    const payload = JSON.parse(body) as Record<string, unknown>;
    const eventName = String(payload.event ?? "");
    const eventType = TREMENDOUS_EVENT_MAP[eventName];
    if (!eventType) return null;

    const meta = payload.meta as { external_id?: string; order_id?: string } | undefined;
    const providerPayoutId = meta?.order_id ?? meta?.external_id;

    return {
      eventId: String(payload.id ?? `${eventName}-${timestamp}`),
      eventType,
      providerPayoutId,
      providerStatus: eventName,
      failureReason: (payload.failure_reason ?? payload.error_message) as string | undefined,
      raw: payload,
    };
  }
}
