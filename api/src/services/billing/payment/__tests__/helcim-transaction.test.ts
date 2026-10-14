/**
 * mapHelcimCardTransaction — the GET /card-transactions/{id} field mapping
 * used to credit token packs. Never hits a live Helcim account; pins the
 * documented v2 shape plus the `data` wrapper other Helcim endpoints use.
 *
 * Run: node --import tsx --test src/services/billing/payment/__tests__/helcim-transaction.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mapHelcimCardTransaction, unwrapHelcimRecord } from "../helcim.js";

const DOCUMENTED = {
  transactionId: 2211223,
  status: "APPROVED",
  type: "purchase",
  amount: 14.99,
  currency: "USD",
  customerCode: "CST1001",
  invoiceNumber: "token-pack:tokens_1m",
};

describe("unwrapHelcimRecord", () => {
  it("returns the record as-is, or the inner `data` object", () => {
    assert.deepEqual(unwrapHelcimRecord({ a: 1 }), { a: 1 });
    assert.deepEqual(unwrapHelcimRecord({ data: { a: 1 } }), { a: 1 });
    assert.equal(unwrapHelcimRecord(null), null);
    assert.equal(unwrapHelcimRecord("nope"), null);
  });
});

describe("mapHelcimCardTransaction", () => {
  it("maps Helcim v2 documented field names", () => {
    const tx = mapHelcimCardTransaction(DOCUMENTED, "0");
    assert.deepEqual(tx, {
      id: "2211223",
      approved: true,
      amountCents: 1499,
      currency: "USD",
      customerId: "CST1001",
      invoiceNumber: "token-pack:tokens_1m",
    });
  });

  it("unwraps a `{ data: { … } }` envelope (same shape as customer create)", () => {
    const tx = mapHelcimCardTransaction({ data: DOCUMENTED }, "0");
    assert.equal(tx?.id, "2211223");
    assert.equal(tx?.approved, true);
    assert.equal(tx?.customerId, "CST1001");
  });

  it("accepts amountCharged, currencyCode, nested customer.customerCode, and lowercase status", () => {
    const tx = mapHelcimCardTransaction({
      transactionId: "9",
      status: "approved",
      type: "CAPTURE",
      amountCharged: "3.99",
      currencyCode: "usd",
      customer: { customerCode: "CST9" },
    }, "fallback");
    assert.equal(tx?.approved, true);
    assert.equal(tx?.amountCents, 399);
    assert.equal(tx?.currency, "USD");
    assert.equal(tx?.customerId, "CST9");
    assert.equal(tx?.id, "9");
  });

  it("does not credit a verify (card-on-file) or a declined purchase", () => {
    assert.equal(mapHelcimCardTransaction({ ...DOCUMENTED, type: "verify" }, "0")?.approved, false);
    assert.equal(mapHelcimCardTransaction({ ...DOCUMENTED, status: "DECLINED" }, "0")?.approved, false);
  });

  it("falls back to the requested id when Helcim omits transactionId", () => {
    const tx = mapHelcimCardTransaction({ status: "APPROVED", type: "purchase", amount: 1, currency: "USD" }, "42");
    assert.equal(tx?.id, "42");
  });
});
