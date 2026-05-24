/**
 * Tremendous API client. Used by the gamification redemption engine to
 * dispatch gift cards.
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

export interface TremendousEnv {
  apiKey: string;
  baseUrl?: string;
  fundingSourceId: string;
  campaignId: string;
}

export interface CreateOrderArgs {
  /** External id we own — Tremendous dedups on this. Use the redemption
   *  row id so the SAME redemption never dispatches twice. */
  externalId: string;
  recipientName: string;
  recipientEmail: string;
  /** Amount in dollars (NOT cents). Tremendous expects a number. */
  amountDollars: number;
  /** Optional message in the gift-card email. */
  message?: string;
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
    this.baseUrl = env.baseUrl ?? "https://api.tremendous.com/api/v2";
  }

  async createOrder(args: CreateOrderArgs): Promise<TremendousOrderResult> {
    const body = {
      external_id: args.externalId,
      payment: { funding_source_id: this.env.fundingSourceId },
      rewards: [
        {
          value: { denomination: args.amountDollars, currency_code: "USD" },
          delivery: { method: "EMAIL" },
          recipient: { name: args.recipientName, email: args.recipientEmail },
          campaign_id: this.env.campaignId,
          ...(args.productIds ? { products: args.productIds } : {}),
          ...(args.message ? { custom_fields: [{ id: "message", value: args.message }] } : {}),
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
