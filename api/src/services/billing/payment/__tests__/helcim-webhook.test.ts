/**
 * HelcimPaymentProvider.verifyWebhook — signature verification + event
 * normalisation. The HMAC compare is now constant-time (timingSafeEqual) so
 * the verifier can't be used as a timing oracle; these tests pin that a valid
 * signature passes, a forged/short one is rejected, and the normalised payload
 * maps Helcim event types to our NormalizedEventType vocabulary.
 *
 * No network — verifyWebhook is pure crypto + JSON parsing.
 *
 * Run: node --import tsx --test src/services/billing/payment/__tests__/helcim-webhook.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { HelcimPaymentProvider } from "../helcim.js";

const WEBHOOK_TOKEN = "whsec_helcim_test";

function provider() {
  // collectionFlow is the only required non-secret field; webhookToken drives
  // the verification under test.
  return new HelcimPaymentProvider({
    apiToken: "api-test",
    webhookToken: WEBHOOK_TOKEN,
    collectionFlow: "modal",
  } as any);
}

function sign(body: string, token = WEBHOOK_TOKEN): string {
  return createHmac("sha256", token).update(body).digest("hex");
}

function headers(sig?: string): Headers {
  const h = new Headers();
  if (sig !== undefined) h.set("helcim-signature", sig);
  return h;
}

describe("HelcimPaymentProvider.verifyWebhook", () => {
  it("accepts a correctly-signed body and normalises the event", async () => {
    const body = JSON.stringify({
      eventId: "evt-1",
      eventType: "transaction.approved",
      transactionId: "txn-9",
      amount: "25.00",
      currency: "usd",
      customerId: "CST123",
    });
    const payload = await provider().verifyWebhook(body, headers(sign(body)));

    assert.equal(payload.eventId, "evt-1");
    assert.equal(payload.eventType, "invoice.paid"); // mapped from transaction.approved
    assert.equal(payload.providerInvoiceId, "txn-9");
    assert.equal(payload.amount, 25);
    assert.equal(payload.currency, "USD");
    assert.equal(payload.billingReason, "transaction.approved");
  });

  it("maps recurring plan + declined events to the right normalized types", async () => {
    const cancelBody = JSON.stringify({ eventId: "e", eventType: "recurring.plan.cancelled", recurringPlanId: "rp-1" });
    const cancel = await provider().verifyWebhook(cancelBody, headers(sign(cancelBody)));
    assert.equal(cancel.eventType, "subscription.deleted");
    assert.equal(cancel.providerSubscriptionId, "rp-1");

    const declinedBody = JSON.stringify({ eventId: "e2", eventType: "transaction.declined" });
    const declined = await provider().verifyWebhook(declinedBody, headers(sign(declinedBody)));
    assert.equal(declined.eventType, "invoice.payment_failed");

    const unknownBody = JSON.stringify({ eventId: "e3", eventType: "something.else" });
    const unknown = await provider().verifyWebhook(unknownBody, headers(sign(unknownBody)));
    assert.equal(unknown.eventType, "unknown");
  });

  it("rejects a body signed with the wrong secret", async () => {
    const body = JSON.stringify({ eventId: "x", eventType: "transaction.approved" });
    await assert.rejects(
      () => provider().verifyWebhook(body, headers(sign(body, "wrong-secret"))),
      /signature verification failed/,
    );
  });

  it("rejects a tampered body (valid-shape signature, mutated payload)", async () => {
    const original = JSON.stringify({ eventId: "x", eventType: "transaction.approved", amount: "1.00" });
    const sig = sign(original);
    const tampered = JSON.stringify({ eventId: "x", eventType: "transaction.approved", amount: "9999.00" });
    await assert.rejects(
      () => provider().verifyWebhook(tampered, headers(sig)),
      /signature verification failed/,
    );
  });

  it("rejects a wrong-length signature without throwing a buffer-length error", async () => {
    const body = JSON.stringify({ eventId: "x", eventType: "transaction.approved" });
    // 'deadbeef' is far shorter than a 64-char sha256 hex digest — the length
    // guard must turn this into the normal verification failure, not a
    // timingSafeEqual length throw.
    await assert.rejects(
      () => provider().verifyWebhook(body, headers("deadbeef")),
      /signature verification failed/,
    );
  });

  it("throws when the signature header is missing", async () => {
    const body = JSON.stringify({ eventId: "x", eventType: "transaction.approved" });
    await assert.rejects(() => provider().verifyWebhook(body, headers()), /Missing helcim-signature/);
  });

  it("derives a deterministic eventId from the body when Helcim sends no id (no Date.now drift)", async () => {
    // No eventId / transactionId in the payload → fall back to a stable,
    // body-derived id so a redelivered identical webhook dedupes.
    const body = JSON.stringify({ eventType: "transaction.approved", amount: "5.00" });
    const a = await provider().verifyWebhook(body, headers(sign(body)));
    const b = await provider().verifyWebhook(body, headers(sign(body)));
    assert.equal(a.eventId, b.eventId, "same body must yield the same eventId");
    assert.ok(a.eventId.startsWith("helcim:"), `expected hmac-derived fallback id, got ${a.eventId}`);

    // A different body must produce a different fallback id.
    const otherBody = JSON.stringify({ eventType: "transaction.approved", amount: "6.00" });
    const other = await provider().verifyWebhook(otherBody, headers(sign(otherBody)));
    assert.notEqual(a.eventId, other.eventId);
  });

  it("throws when no webhook token is configured", async () => {
    const p = new HelcimPaymentProvider({ apiToken: "a", collectionFlow: "modal" } as any);
    const body = "{}";
    await assert.rejects(() => p.verifyWebhook(body, headers(sign(body))), /HELCIM_WEBHOOK_TOKEN is not configured/);
  });
});
