/**
 * TremendousClient unit tests — closes part of gap #1344 (tremendous was on
 * the zero-test-domain list). The client dispatches gift cards for the
 * gamification redemption engine, so its request shaping (external_id dedup,
 * funding source, denomination, campaign) and error handling are money-
 * adjacent and must not drift.
 *
 * `fetch` is stubbed per-test (no network). Covers:
 *   • createOrder      — request URL/method/auth/body shape + parsed result
 *   • createOrder      — productIds + message wired only when provided
 *   • createOrder      — malformed success body → TremendousError(500)
 *   • request          — non-2xx → TremendousError with parsed message
 *   • request          — non-JSON body → TremendousError("Non-JSON response")
 *   • getOrder         — status parse + unknown fallback
 *   • buildTremendousClient — missing env → TremendousError(503)
 *
 * Run: node --import tsx --test src/services/tremendous/__tests__/tremendous-client.test.ts
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  TremendousClient,
  TremendousError,
  buildTremendousClient,
} from "../client.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Capture {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}

/** Install a fetch stub that records the request and returns `resp`. */
function stubFetch(resp: { ok?: boolean; status?: number; text: string }): Capture {
  const cap: Capture = {};
  globalThis.fetch = (async (url: any, init: any) => {
    cap.url = String(url);
    cap.method = init?.method;
    cap.headers = init?.headers;
    cap.body = init?.body ? JSON.parse(init.body) : undefined;
    return {
      ok: resp.ok ?? true,
      status: resp.status ?? 200,
      statusText: "STATUS",
      text: async () => resp.text,
    } as Response;
  }) as typeof fetch;
  return cap;
}

const ENV = {
  apiKey: "testapi-key",
  fundingSourceId: "fund-1",
  campaignId: "camp-1",
  baseUrl: "https://testflight.tremendous.com/api/v2",
};

describe("TremendousClient.createOrder", () => {
  it("POSTs /orders with auth header, funding source, denomination, campaign + dedup external_id", async () => {
    const cap = stubFetch({ text: JSON.stringify({ order: { id: "ord-1", status: "PENDING", rewards: [{ id: "rwd-1" }] } }) });
    const client = new TremendousClient(ENV);

    const result = await client.createOrder({
      externalId: "redemption-42",
      recipientName: "Ada",
      recipientEmail: "ada@example.com",
      amountDollars: 25,
    });

    assert.equal(cap.url, "https://testflight.tremendous.com/api/v2/orders");
    assert.equal(cap.method, "POST");
    assert.equal(cap.headers?.Authorization, "Bearer testapi-key");
    assert.equal(cap.body.external_id, "redemption-42");
    assert.equal(cap.body.payment.funding_source_id, "fund-1");
    const reward = cap.body.rewards[0];
    assert.equal(reward.value.denomination, 25);
    assert.equal(reward.value.currency_code, "USD");
    assert.equal(reward.campaign_id, "camp-1");
    assert.equal(reward.delivery.method, "EMAIL");
    assert.equal(reward.recipient.email, "ada@example.com");
    // products / custom_fields omitted when not supplied
    assert.equal(reward.products, undefined);
    assert.equal(reward.custom_fields, undefined);

    assert.deepEqual(result, { orderId: "ord-1", status: "PENDING", rewardId: "rwd-1", valueCents: 2500 });
  });

  it("includes products + custom message only when provided", async () => {
    const cap = stubFetch({ text: JSON.stringify({ order: { id: "ord-2", status: "PENDING", rewards: [] } }) });
    const client = new TremendousClient(ENV);

    await client.createOrder({
      externalId: "r-1",
      recipientName: "Grace",
      recipientEmail: "grace@example.com",
      amountDollars: 10,
      productIds: ["prod-a", "prod-b"],
      message: "Thanks!",
    });

    const reward = cap.body.rewards[0];
    assert.deepEqual(reward.products, ["prod-a", "prod-b"]);
    assert.deepEqual(reward.custom_fields, [{ id: "message", value: "Thanks!" }]);
  });

  it("throws TremendousError(500) on a malformed success body (no order.id)", async () => {
    stubFetch({ text: JSON.stringify({ order: { status: "PENDING" } }) });
    const client = new TremendousClient(ENV);
    await assert.rejects(
      () => client.createOrder({ externalId: "r", recipientName: "n", recipientEmail: "e", amountDollars: 5 }),
      (err: unknown) => err instanceof TremendousError && err.status === 500,
    );
  });

  it("rounds amountDollars to valueCents", async () => {
    stubFetch({ text: JSON.stringify({ order: { id: "o", status: "PENDING", rewards: [] } }) });
    const client = new TremendousClient(ENV);
    const res = await client.createOrder({ externalId: "r", recipientName: "n", recipientEmail: "e", amountDollars: 12.34 });
    assert.equal(res.valueCents, 1234);
  });
});

describe("TremendousClient.request error handling", () => {
  it("maps a non-2xx response to TremendousError carrying the parsed message", async () => {
    stubFetch({ ok: false, status: 422, text: JSON.stringify({ errors: { message: "funding source frozen" } }) });
    const client = new TremendousClient(ENV);
    await assert.rejects(
      () => client.getOrder("ord-x"),
      (err: unknown) => err instanceof TremendousError && err.status === 422 && /funding source frozen/.test(err.message),
    );
  });

  it("maps a non-JSON body to TremendousError('Non-JSON response')", async () => {
    stubFetch({ ok: true, status: 200, text: "<html>gateway</html>" });
    const client = new TremendousClient(ENV);
    await assert.rejects(
      () => client.getOrder("ord-x"),
      (err: unknown) => err instanceof TremendousError && /Non-JSON response/.test(err.message),
    );
  });
});

describe("TremendousClient.getOrder", () => {
  it("returns the order status", async () => {
    stubFetch({ text: JSON.stringify({ order: { id: "o", status: "DELIVERED" } }) });
    const client = new TremendousClient(ENV);
    assert.deepEqual(await client.getOrder("o"), { status: "DELIVERED" });
  });

  it("falls back to 'unknown' when status is absent", async () => {
    stubFetch({ text: JSON.stringify({ order: { id: "o" } }) });
    const client = new TremendousClient(ENV);
    assert.deepEqual(await client.getOrder("o"), { status: "unknown" });
  });
});

describe("buildTremendousClient", () => {
  it("throws TremendousError(503) when required env is missing", () => {
    assert.throws(
      () => buildTremendousClient({ TREMENDOUS_API_KEY: "k" }), // missing funding + campaign
      (err: unknown) => err instanceof TremendousError && err.status === 503,
    );
    assert.throws(
      () => buildTremendousClient({}),
      (err: unknown) => err instanceof TremendousError && err.status === 503,
    );
  });

  it("builds a usable client when all env is present", async () => {
    const client = buildTremendousClient({
      TREMENDOUS_API_KEY: "prodapi-k",
      TREMENDOUS_FUNDING_SOURCE_ID: "f",
      TREMENDOUS_CAMPAIGN_ID: "c",
    });
    assert.ok(client instanceof TremendousClient);
  });
});
