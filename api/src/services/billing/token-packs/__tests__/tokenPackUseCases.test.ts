/**
 * Token-pack purchase use cases — server pricing, provider-verified credit,
 * single credit per payment reference (gap #2200), and the pending state +
 * bounded reconcile that keeps a paid-but-unconfirmed pack from being lost
 * (gap #2352).
 *
 * Run: node --import tsx --test src/services/billing/token-packs/__tests__/tokenPackUseCases.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TOKEN_PACKS, tokenPackPriceCents } from "../../../../../../shared/pricing.js";
import type { TokenBudgetDTO } from "../../../../../../shared/billing.js";
import type { ProviderTransaction } from "../../payment/types.js";
import {
  confirmTokenPackPurchase,
  creditPendingPurchase,
  isPaymentForPack,
  startTokenPackCheckout,
  TokenPackError,
  TOKEN_PACK_MAX_CHECKS,
  type TokenPackDeps,
} from "../tokenPackUseCases.js";
import { reconcilePendingTokenPacks, TOKEN_PACK_RECONCILE_BATCH } from "../tokenPackReconcile.js";

const PACK = TOKEN_PACKS[1];
const CUSTOMER = "CST1001";

const BUDGET: TokenBudgetDTO = {
  planId: "pro",
  isPro: true,
  isUnlimited: false,
  monthly: { used: 0, limit: 150_000, remaining: 150_000, resetAt: "2026-11-01T00:00:00.000Z" },
  pack: { balance: 0 },
  totalAvailable: 150_000,
};

function tx(overrides: Partial<ProviderTransaction> = {}): ProviderTransaction {
  return {
    id: "9001",
    approved: true,
    amountCents: tokenPackPriceCents(PACK),
    currency: "USD",
    customerId: CUSTOMER,
    ...overrides,
  };
}

interface FakeRow {
  id: string;
  userId: string;
  packId: string;
  tokensGranted: number;
  stripePaymentIntentId: string;
  status: string;
  checkAttempts: number;
  checkedAt: Date | null;
  createdAt: Date;
}

function makeDeps(
  opts: {
    isPro?: boolean;
    transactions?: Record<string, ProviderTransaction>;
    payments?: boolean;
    providerDown?: boolean;
  } = {},
) {
  // In-memory ledger with the repository's guarantees: one row per payment
  // reference, and the pending -> paid flip (with its credit) happens once.
  const rows: FakeRow[] = [];
  const balance = new Map<string, number>();
  const inits: Array<{ amount: number; currency: string }> = [];
  const granted: string[] = [];
  const deps: TokenPackDeps = {
    payments: opts.payments === false ? null : {
      supportsOneOffPurchases: true,
      customerIdFor: async () => CUSTOMER,
      initPurchase: async ({ amount, currency }) => {
        inits.push({ amount, currency });
        return { flowType: "embedded", checkoutToken: "tok", providerName: "helcim" };
      },
      getTransaction: async (id) => {
        if (opts.providerDown) throw new Error("helcim 503");
        return opts.transactions?.[id] ?? null;
      },
    },
    plans: { isPro: async () => opts.isPro ?? true },
    ledger: {
      recordPending: async (input) => {
        const ref = String(input.stripePaymentIntentId);
        const existing = rows.find((r) => r.stripePaymentIntentId === ref);
        if (existing) return { ...existing } as never;
        const row: FakeRow = {
          id: `p${rows.length + 1}`,
          userId: input.userId,
          packId: input.packId,
          tokensGranted: input.tokensGranted,
          stripePaymentIntentId: ref,
          status: "pending",
          checkAttempts: 0,
          checkedAt: null,
          createdAt: new Date("2026-10-10T12:00:00Z"),
        };
        rows.push(row);
        return { ...row } as never;
      },
      settlePaid: async (purchaseId) => {
        const row = rows.find((r) => r.id === purchaseId);
        if (!row || row.status !== "pending") return false;
        row.status = "paid";
        row.checkAttempts += 1;
        balance.set(row.userId, (balance.get(row.userId) ?? 0) + row.tokensGranted);
        return true;
      },
      markChecked: async (purchaseId, status) => {
        const row = rows.find((r) => r.id === purchaseId);
        if (!row || row.status !== "pending") return;
        row.status = status;
        row.checkAttempts += 1;
        row.checkedAt = new Date("2026-10-10T12:01:00Z");
      },
      budgetFor: async () => BUDGET,
    },
    onGranted: async ({ paymentRef }) => {
      granted.push(paymentRef);
    },
  };
  const listCalls: Array<{ limit: number; createdBefore: Date; checkedBefore: Date }> = [];
  const pending = {
    listPending: async (input: { limit: number; createdBefore: Date; checkedBefore: Date }) => {
      listCalls.push(input);
      return rows.filter((r) => r.status === "pending").slice(0, input.limit).map((r) => ({ ...r })) as never[];
    },
  };
  return { deps, rows, balance, inits, granted, pending, listCalls };
}

const isKind = (kind: TokenPackError["kind"]) => (e: unknown) => e instanceof TokenPackError && e.kind === kind;

describe("startTokenPackCheckout", () => {
  const input = { userId: "u1", packId: PACK.id, successUrl: "https://x/s", cancelUrl: "https://x/c" };

  it("prices the charge from TOKEN_PACKS, never from the client", async () => {
    const { deps, inits } = makeDeps();
    const res = await startTokenPackCheckout(deps, input);
    assert.equal(res.pack.id, PACK.id);
    assert.deepEqual(inits, [{ amount: PACK.price, currency: "USD" }]);
  });

  it("rejects unknown packs, free accounts, and missing payments", async () => {
    await assert.rejects(startTokenPackCheckout(makeDeps().deps, { ...input, packId: "nope" }), isKind("UNKNOWN_PACK"));
    await assert.rejects(startTokenPackCheckout(makeDeps({ isPro: false }).deps, input), isKind("PRO_REQUIRED"));
    await assert.rejects(startTokenPackCheckout(makeDeps({ payments: false }).deps, input), isKind("PAYMENTS_UNAVAILABLE"));
  });
});

describe("isPaymentForPack", () => {
  it("accepts an approved charge for the exact price on this customer", () => {
    assert.equal(isPaymentForPack(tx(), PACK, CUSTOMER), true);
    assert.equal(isPaymentForPack(tx({ customerId: undefined }), PACK, CUSTOMER), true);
  });

  it("rejects declined, wrong amount, wrong currency, or another customer's charge", () => {
    assert.equal(isPaymentForPack(tx({ approved: false }), PACK, CUSTOMER), false);
    assert.equal(isPaymentForPack(tx({ amountCents: 1 }), PACK, CUSTOMER), false);
    assert.equal(isPaymentForPack(tx({ currency: "CAD" }), PACK, CUSTOMER), false);
    assert.equal(isPaymentForPack(tx({ customerId: "CST9999" }), PACK, CUSTOMER), false);
  });
});

describe("confirmTokenPackPurchase", () => {
  it("credits a verified purchase once and returns the fresh budget", async () => {
    const { deps, balance, granted } = makeDeps({ transactions: { "9001": tx() } });
    const res = await confirmTokenPackPurchase(deps, { userId: "u1", packId: PACK.id, transactionId: "9001" });
    assert.equal(res.granted, true);
    assert.equal(res.tokensGranted, PACK.tokens);
    assert.equal(balance.get("u1"), PACK.tokens);
    assert.deepEqual(granted, ["9001"]);
    assert.equal(res.tokenBudget, BUDGET);
  });

  it("a replayed confirm for the same transaction never credits twice", async () => {
    const { deps, balance, rows } = makeDeps({ transactions: { "9001": tx() } });
    await confirmTokenPackPurchase(deps, { userId: "u1", packId: PACK.id, transactionId: "9001" });
    const again = await confirmTokenPackPurchase(deps, { userId: "u1", packId: PACK.id, transactionId: "9001" });
    assert.equal(again.granted, false);
    assert.equal(again.tokensGranted, 0);
    assert.equal(rows.length, 1);
    assert.equal(again.pending, false);
    assert.equal(balance.get("u1"), PACK.tokens);
  });

  it("refuses a charge paid at a cheaper pack's price and marks it rejected", async () => {
    const cheap = TOKEN_PACKS[0];
    const { deps, balance, rows } = makeDeps({ transactions: { "9002": tx({ amountCents: tokenPackPriceCents(cheap) }) } });
    await assert.rejects(
      confirmTokenPackPurchase(deps, { userId: "u1", packId: PACK.id, transactionId: "9002" }),
      isKind("PAYMENT_NOT_VERIFIED"),
    );
    assert.equal(rows[0].status, "rejected");
    assert.equal(balance.get("u1"), undefined);
  });

  it("records the charge as pending FIRST and keeps it pending when the provider is down", async () => {
    const { deps, balance, rows } = makeDeps({ providerDown: true });
    const res = await confirmTokenPackPurchase(deps, { userId: "u1", packId: PACK.id, transactionId: "9004" });
    assert.equal(res.pending, true);
    assert.equal(res.granted, false);
    assert.equal(res.tokensGranted, 0);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "pending");
    assert.equal(rows[0].checkAttempts, 1);
    assert.equal(balance.get("u1"), undefined);
  });

  it("keeps a not-yet-visible transaction pending instead of refusing it", async () => {
    const { deps, rows } = makeDeps({ transactions: {} });
    const res = await confirmTokenPackPurchase(deps, { userId: "u1", packId: PACK.id, transactionId: "9005" });
    assert.equal(res.pending, true);
    assert.equal(rows[0].status, "pending");
  });

  it("refuses a reference already recorded for another account", async () => {
    const { deps, balance } = makeDeps({ transactions: { "9006": tx() } });
    await confirmTokenPackPurchase(deps, { userId: "u1", packId: PACK.id, transactionId: "9006" });
    await assert.rejects(
      confirmTokenPackPurchase(deps, { userId: "u2", packId: PACK.id, transactionId: "9006" }),
      isKind("PAYMENT_NOT_VERIFIED"),
    );
    assert.equal(balance.get("u2"), undefined);
  });
});

describe("creditPendingPurchase", () => {
  it("a failing side effect does not undo the credit", async () => {
    const { deps, balance, rows } = makeDeps({ providerDown: true });
    await confirmTokenPackPurchase(deps, { userId: "u1", packId: PACK.id, transactionId: "9003" });
    deps.onGranted = async () => {
      throw new Error("points service down");
    };
    const res = await creditPendingPurchase(deps, { purchaseId: rows[0].id, userId: "u1", pack: PACK, paymentRef: "9003" });
    assert.equal(res.granted, true);
    assert.equal(balance.get("u1"), PACK.tokens);
  });

  it("idempotent double credit: two settles of the same row credit once", async () => {
    const { deps, balance, rows, granted } = makeDeps({ providerDown: true });
    await confirmTokenPackPurchase(deps, { userId: "u1", packId: PACK.id, transactionId: "9007" });
    const input = { purchaseId: rows[0].id, userId: "u1", pack: PACK, paymentRef: "9007" };
    const [a, b] = await Promise.all([creditPendingPurchase(deps, input), creditPendingPurchase(deps, input)]);
    assert.deepEqual([a.granted, b.granted].sort(), [false, true]);
    assert.equal(balance.get("u1"), PACK.tokens);
    assert.deepEqual(granted, ["9007"]);
  });
});

describe("reconcilePendingTokenPacks", () => {
  const NOW = new Date("2026-10-10T13:00:00Z");

  it("credits a pending purchase once the provider answers, and a replayed confirm adds nothing", async () => {
    const transactions: Record<string, ProviderTransaction> = {};
    const fx = makeDeps({ transactions });
    await confirmTokenPackPurchase(fx.deps, { userId: "u1", packId: PACK.id, transactionId: "9001" });
    assert.equal(fx.rows[0].status, "pending");
    transactions["9001"] = tx(); // the transaction becomes visible
    const summary = await reconcilePendingTokenPacks({ ...fx.deps, pending: fx.pending }, { now: NOW });
    assert.equal(summary.credited, 1);
    assert.equal(fx.balance.get("u1"), PACK.tokens);
    const replay = await confirmTokenPackPurchase(fx.deps, { userId: "u1", packId: PACK.id, transactionId: "9001" });
    assert.equal(replay.granted, false);
    assert.equal(fx.balance.get("u1"), PACK.tokens);
  });

  it("checks at most TOKEN_PACK_RECONCILE_BATCH rows per run, even when asked for more", async () => {
    const fx = makeDeps({ providerDown: true });
    for (let i = 0; i < TOKEN_PACK_RECONCILE_BATCH + 3; i++) {
      await confirmTokenPackPurchase(fx.deps, { userId: "u1", packId: PACK.id, transactionId: String(9100 + i) });
    }
    const summary = await reconcilePendingTokenPacks({ ...fx.deps, pending: fx.pending }, { now: NOW, limit: 50 });
    assert.equal(summary.scanned, TOKEN_PACK_RECONCILE_BATCH);
    assert.equal(fx.listCalls[0].limit, TOKEN_PACK_RECONCILE_BATCH);
    assert.ok(fx.listCalls[0].createdBefore < NOW);
  });

  it("expires a reference the provider never confirms after TOKEN_PACK_MAX_CHECKS", async () => {
    const fx = makeDeps({ providerDown: true });
    await confirmTokenPackPurchase(fx.deps, { userId: "u1", packId: PACK.id, transactionId: "9200" });
    for (let i = 1; i < TOKEN_PACK_MAX_CHECKS; i++) {
      await reconcilePendingTokenPacks({ ...fx.deps, pending: fx.pending }, { now: NOW });
    }
    assert.equal(fx.rows[0].status, "expired");
    assert.equal(fx.rows[0].checkAttempts, TOKEN_PACK_MAX_CHECKS);
    assert.equal(fx.balance.get("u1"), undefined);
  });

  it("does nothing without a payment provider", async () => {
    const fx = makeDeps({ payments: false });
    const summary = await reconcilePendingTokenPacks({ ...fx.deps, pending: fx.pending }, { now: NOW });
    assert.equal(summary.scanned, 0);
    assert.equal(fx.listCalls.length, 0);
  });
});
