/**
 * grantTokenPack idempotency — a Stripe/Helcim webhook can redeliver the same
 * payment-intent, and the SAME pack can also be granted from the cart-finalize
 * path. Without the in-function guard the user is credited tokens twice. These
 * tests pin single-credit per payment-intent.
 *
 * Balance arithmetic is only asserted on paths that DON'T hit the
 * userTokenBalance upsert SET (the fake-db can't evaluate the `balance + n`
 * SQL expression on the conflict path) — i.e. the first grant for a fresh user
 * and the no-op second grant. The purchase-row COUNT is the idempotency signal
 * and is asserted everywhere.
 *
 * Run: node --import tsx --test src/services/__tests__/grant-token-pack.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// resolveDeps() in BillingService eagerly constructs defaultApiDeps() (which
// builds a neon() client) even when we inject a fake db, so a connection
// string must exist. The fake db handles all actual queries — nothing
// connects. Mirrors job-update-roundtrip.test.ts.
process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";

import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import { grantTokenPack } from "../billing/BillingService.js";

function makeDeps(seed: { purchases?: any[]; balances?: any[] } = {}) {
  const fake = buildFakeDb({
    token_pack_purchases: seed.purchases ?? [],
    user_token_balance: seed.balances ?? [],
  });
  const state = fake.state as any;
  return {
    deps: { db: fake.db } as any,
    purchases: () => state.token_pack_purchases as any[],
    balances: () => state.user_token_balance as any[],
  };
}

const PACK = { packId: "tokens_standard_2m", tokens: 2_000_000, pricePaid: 11.99 };

describe("grantTokenPack idempotency", () => {
  it("credits the user once on the first grant (purchase row + balance)", async () => {
    const { deps, purchases, balances } = makeDeps();
    await grantTokenPack({ userId: "user-1", ...PACK, stripePaymentIntentId: "pi_1" }, deps);

    assert.equal(purchases().length, 1);
    assert.equal(purchases()[0].tokensGranted, PACK.tokens);
    assert.equal(purchases()[0].stripePaymentIntentId, "pi_1");
    assert.equal(balances().length, 1);
    assert.equal(balances()[0].balance, PACK.tokens);
    assert.equal(balances()[0].lifetimeGranted, PACK.tokens);
  });

  it("does NOT double-credit when the same payment-intent is granted twice", async () => {
    const { deps, purchases, balances } = makeDeps();
    await grantTokenPack({ userId: "user-1", ...PACK, stripePaymentIntentId: "pi_1" }, deps);
    await grantTokenPack({ userId: "user-1", ...PACK, stripePaymentIntentId: "pi_1" }, deps);

    // Second call short-circuits: one purchase row, balance unchanged.
    assert.equal(purchases().length, 1, "duplicate intent must not add a second purchase row");
    assert.equal(balances()[0].balance, PACK.tokens, "balance must not double");
  });

  it("credits distinct payment-intents separately (two purchase rows)", async () => {
    const { deps, purchases } = makeDeps();
    await grantTokenPack({ userId: "user-1", ...PACK, stripePaymentIntentId: "pi_1" }, deps);
    await grantTokenPack({ userId: "user-1", ...PACK, stripePaymentIntentId: "pi_2" }, deps);
    assert.equal(purchases().length, 2);
  });

  it("does not dedupe grants that carry no payment-intent (guard only applies when present)", async () => {
    const { deps, purchases } = makeDeps();
    await grantTokenPack({ userId: "user-1", ...PACK }, deps);
    await grantTokenPack({ userId: "user-1", ...PACK }, deps);
    assert.equal(purchases().length, 2);
  });
});
