/**
 * Tremendous API client — the ONLY HTTP client for Tremendous. Used by the
 * gamification redemption engine (gift cards), the partner pool, and the
 * creator payout rail (services/payout/tremendous.ts wraps it).
 *
 * Env:
 *   TREMENDOUS_API_KEY        — bearer token (sandbox: testapi-* /
 *                                production: prodapi-*)
 *   TREMENDOUS_BASE_URL       — defaults to production
 *                                (https://api.tremendous.com/api/v2).
 *                                Set to https://testflight.tremendous.com/api/v2
 *                                for sandbox.
 *   TREMENDOUS_FUNDING_SOURCE_ID — Tremendous funding source uuid (one
 *                                per Tremendous account). REQUIRED.
 *   TREMENDOUS_CAMPAIGN_ID    — Campaign uuid that defines the catalog
 *                                of giftable products. REQUIRED for
 *                                public orders.
 *
 * The client is intentionally thin — one method per Tremendous endpoint
 * we touch, no Tremendous-specific logic outside this file. The
 * redemption engine composes against this surface.
 *
 * On error: throws `TremendousError` with the HTTP status + parsed body
 * so the redemption engine can decide whether to retry or fail the row.
 */

export const TREMENDOUS_PRODUCTION_BASE_URL = "https://api.tremendous.com/api/v2";
export const TREMENDOUS_SANDBOX_BASE_URL = "https://testflight.tremendous.com/api/v2";

export interface TremendousEnv {
  apiKey: string;
  baseUrl?: string;
  /** Funding source to debit; omitted → the account's primary source. */
  fundingSourceId?: string;
  /** Campaign (catalog + branding); omitted → pass `productIds` per order. */
  campaignId?: string;
}

export interface CreateOrderArgs {
  /** External id we own — Tremendous dedups on this. Use the redemption
   *  row id so the SAME redemption never dispatches twice. */
  externalId: string;
  /** Optional — payout recipients are identified by email alone. */
  recipientName?: string;
  recipientEmail: string;
  /** Amount in dollars (NOT cents). Tremendous expects a number. */
  amountDollars: number;
  /** ISO-4217; defaults to USD. */
  currency?: string;
  /** Optional message in the gift-card email. */
  message?: string;
  /** Extra custom fields (e.g. a payout memo). */
  customFields?: Array<{ id: string; value: string }>;
  /** Optional product id list to restrict the user's catalog of choices.
   *  When omitted, uses the campaign-default catalog. */
  productIds?: string[];
}

export interface TremendousOrderResult {
  orderId: string;
  status: string;
  rewardId?: string;
  /** Cents-equivalent value Tremendous accepted (echo of our request). */
  valueCents: number;
}

export class TremendousError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(`Tremendous ${status}: ${message}`);
    this.name = "TremendousError";
  }
}

export class TremendousClient {
  private readonly baseUrl: string;

  constructor(private readonly env: TremendousEnv) {
    this.baseUrl = env.baseUrl ?? TREMENDOUS_PRODUCTION_BASE_URL;
  }

  async createOrder(args: CreateOrderArgs): Promise<TremendousOrderResult> {
    const customFields = [
      ...(args.message ? [{ id: "message", value: args.message }] : []),
      ...(args.customFields ?? []),
    ];
    const body = {
      external_id: args.externalId,
      ...(this.env.fundingSourceId ? { payment: { funding_source_id: this.env.fundingSourceId } } : {}),
      rewards: [
        {
          value: { denomination: args.amountDollars, currency_code: args.currency ?? "USD" },
          delivery: { method: "EMAIL" },
          recipient: { ...(args.recipientName ? { name: args.recipientName } : {}), email: args.recipientEmail },
          ...(this.env.campaignId ? { campaign_id: this.env.campaignId } : {}),
          ...(args.productIds ? { products: args.productIds } : {}),
          ...(customFields.length > 0 ? { custom_fields: customFields } : {}),
        },
      ],
    };

    const res = await this.request("POST", "/orders", body);
    const order = res?.order as Record<string, unknown> | undefined;
    if (!order || typeof order.id !== "string") {
      throw new TremendousError(500, "Malformed Tremendous response", res);
    }
    const rewards = Array.isArray(order.rewards) ? (order.rewards as Array<Record<string, unknown>>) : [];
    const reward = rewards[0];
    return {
      orderId: order.id,
      status: typeof order.status === "string" ? order.status : "unknown",
      rewardId: reward && typeof reward.id === "string" ? reward.id : undefined,
      valueCents: Math.round(args.amountDollars * 100),
    };
  }

  async getOrder(orderId: string): Promise<{ status: string }> {
    const res = await this.request("GET", `/orders/${orderId}`);
    const order = res?.order as Record<string, unknown> | undefined;
    return { status: typeof order?.status === "string" ? order.status : "unknown" };
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.env.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new TremendousError(res.status, "Non-JSON response", text);
    }

    if (!res.ok) {
      const msg = (parsed as { errors?: { message?: string } } | undefined)?.errors?.message ?? res.statusText;
      throw new TremendousError(res.status, msg, parsed);
    }
    return (parsed as Record<string, unknown>) ?? {};
  }
}

/** Build a Tremendous client from the Cloudflare Worker env. Throws when
 *  required env is missing — the redemption engine catches and surfaces
 *  this as a "vendor not configured" failure on the redemption row. */
export function buildTremendousClient(env: Record<string, string | undefined>): TremendousClient {
  const apiKey = env.TREMENDOUS_API_KEY;
  const fundingSourceId = env.TREMENDOUS_FUNDING_SOURCE_ID;
  const campaignId = env.TREMENDOUS_CAMPAIGN_ID;
  if (!apiKey || !fundingSourceId || !campaignId) {
    throw new TremendousError(
      503,
      "Tremendous env missing: set TREMENDOUS_API_KEY + TREMENDOUS_FUNDING_SOURCE_ID + TREMENDOUS_CAMPAIGN_ID",
    );
  }
  return new TremendousClient({
    apiKey,
    fundingSourceId,
    campaignId,
    baseUrl: env.TREMENDOUS_BASE_URL,
  });
}
