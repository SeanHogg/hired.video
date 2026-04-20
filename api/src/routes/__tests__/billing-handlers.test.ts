/**
 * Integration tests for the pure billing handlers (billing-handlers.ts).
 *
 * Covers the high-value write endpoints that used to have ad-hoc inline
 * DB logic in routes/billing.ts:
 *
 *   • handleRefundRequest    — success, auth gate, validation,
 *                              amountCents → decimal-dollars conversion
 *   • handleCancelAccount    — success, CANCELLATION: prefix, requestRefund
 *                              flag carried through, auth gate
 *   • handleStartTrial       — success (creates trialing sub), 409 when
 *                              user already has active/trialing sub
 *
 * Read endpoints (subscription, payment-methods, invoices) already
 * delegate to billingService and are tested at that layer in
 * access-policy.test.ts.
 *
 * Run: node --import tsx --test src/routes/__tests__/billing-handlers.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  handleRefundRequest,
  handleCancelAccount,
  handleStartTrial,
  type BillingDeps,
} from "../billing-handlers.js";

// ---------------------------------------------------------------------------
// Fake DB
// ---------------------------------------------------------------------------

function makeFakeDb(seed: {
  refundRequests?: any[];
  subscriptions?: any[];
} = {}) {
  const state = {
    refundRequests: seed.refundRequests ?? [],
    subscriptions: seed.subscriptions ?? [],
  };

  function inferTable(t: any): keyof typeof state | null {
    const sym = Object.getOwnPropertySymbols(t ?? {}).find((s) =>
      /name/i.test(s.description ?? ""),
    );
    const name =
      (sym ? (t as any)[sym] : null) ??
      (t as any)?._?.name ??
      (t as any)?._?.baseName ??
      null;
    if (name === "refund_requests") return "refundRequests";
    if (name === "subscriptions") return "subscriptions";
    return null;
  }

  const db: any = {
    select(columns?: unknown) {
      void columns;
      return {
        from(table: any) {
          const key = inferTable(table);
          return {
            where(_: unknown) {
              return {
                limit(n: number) {
                  return Promise.resolve(key ? (state as any)[key].slice(0, n) : []);
                },
                orderBy(_ob: unknown) {
                  return Promise.resolve(key ? (state as any)[key].slice() : []);
                },
                then(resolve: any) {
                  resolve(key ? (state as any)[key].slice() : []);
                },
              };
            },
          };
        },
      };
    },
    insert(table: any) {
      const key = inferTable(table);
      return {
        values(vs: any) {
          const row = {
            id: vs.id ?? randomUUID(),
            ...vs,
            createdAt: vs.createdAt ?? new Date(),
            updatedAt: vs.updatedAt ?? new Date(),
          };
          if (key) (state as any)[key].push(row);
          return {
            returning(_?: unknown) {
              return Promise.resolve([row]);
            },
            then(resolve: any) {
              resolve(undefined);
            },
          };
        },
      };
    },
  };

  return { db, state };
}

function makeDeps(seed: Parameters<typeof makeFakeDb>[0] = {}): BillingDeps & { _state: ReturnType<typeof makeFakeDb>["state"] } {
  const { db, state } = makeFakeDb(seed);
  return {
    db,
    now: () => new Date("2026-04-19T00:00:00.000Z"),
    _state: state,
  } as any;
}

// ═══════════════════════════════════════════════════════════════════════════
// handleRefundRequest
// ═══════════════════════════════════════════════════════════════════════════

describe("handleRefundRequest", () => {
  it("creates a pending refund_requests row and returns 201", async () => {
    const deps = makeDeps();
    const res = await handleRefundRequest(deps, "user-1", {
      reason: "billing_error",
      amountCents: 995, // $9.95
      invoiceId: "inv-123",
    });
    assert.equal(res.status, 201);
    assert.equal(deps._state.refundRequests.length, 1);
    const row = deps._state.refundRequests[0];
    assert.equal(row.userId, "user-1");
    assert.equal(row.reason, "billing_error");
    assert.equal(row.status, "pending");
    assert.equal(row.invoiceId, "inv-123");
  });

  it("converts amountCents (integer) to decimal-dollars string (schema uses numeric as string)", async () => {
    const deps = makeDeps();
    await handleRefundRequest(deps, "user-1", { reason: "x", amountCents: 1234 });
    // 1234 cents → "12.34"
    assert.equal(deps._state.refundRequests[0].amount, "12.34");
  });

  it("stores null amount when amountCents is omitted", async () => {
    const deps = makeDeps();
    await handleRefundRequest(deps, "user-1", { reason: "x" });
    assert.equal(deps._state.refundRequests[0].amount, null);
  });

  it("returns 401 for anonymous callers (no row inserted)", async () => {
    const deps = makeDeps();
    const res = await handleRefundRequest(deps, null, { reason: "x" });
    assert.equal(res.status, 401);
    assert.equal(deps._state.refundRequests.length, 0);
  });

  it("returns 400 with code=VALIDATION_ERROR when reason is missing or empty", async () => {
    const deps = makeDeps();
    assert.equal((await handleRefundRequest(deps, "user-1", {})).status, 400);
    assert.equal((await handleRefundRequest(deps, "user-1", { reason: "" })).status, 400);
    assert.equal(deps._state.refundRequests.length, 0);
  });

  it("rejects negative amountCents (no phantom credits)", async () => {
    const deps = makeDeps();
    const res = await handleRefundRequest(deps, "user-1", { reason: "x", amountCents: -100 });
    assert.equal(res.status, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleCancelAccount
// ═══════════════════════════════════════════════════════════════════════════

describe("handleCancelAccount", () => {
  it("writes a CANCELLATION:-prefixed refund_requests row", async () => {
    const deps = makeDeps();
    const res = await handleCancelAccount(deps, "user-1", {
      reason: "too_expensive",
    });
    assert.equal(res.status, 201);
    const row = deps._state.refundRequests[0];
    assert.equal(row.reason, "CANCELLATION: too_expensive");
    assert.equal(row.status, "pending");
  });

  it("defaults reason to 'user_requested' when omitted", async () => {
    const deps = makeDeps();
    await handleCancelAccount(deps, "user-1", {});
    assert.equal(deps._state.refundRequests[0].reason, "CANCELLATION: user_requested");
  });

  it("echoes type='cancellation' + requestRefund in the response body (for CX flow)", async () => {
    const deps = makeDeps();
    const res = await handleCancelAccount(deps, "user-1", {
      reason: "switching_provider",
      requestRefund: true,
    });
    const body = (res.body as any).data;
    assert.equal(body.type, "cancellation");
    assert.equal(body.requestRefund, true);
  });

  it("coerces non-boolean requestRefund to false (safe default)", async () => {
    const deps = makeDeps();
    const res = await handleCancelAccount(deps, "user-1", {});
    const body = (res.body as any).data;
    assert.equal(body.requestRefund, false);
  });

  it("returns 401 for anonymous callers", async () => {
    const deps = makeDeps();
    const res = await handleCancelAccount(deps, null, {});
    assert.equal(res.status, 401);
    assert.equal(deps._state.refundRequests.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleStartTrial
// ═══════════════════════════════════════════════════════════════════════════

describe("handleStartTrial", () => {
  it("creates a 14-day trialing subscription on the target plan", async () => {
    const deps = makeDeps();
    const res = await handleStartTrial(deps, "user-1", { planId: "pro_monthly" });
    assert.equal(res.status, 201);
    assert.equal(deps._state.subscriptions.length, 1);
    const sub = deps._state.subscriptions[0];
    assert.equal(sub.userId, "user-1");
    assert.equal(sub.planId, "pro_monthly");
    assert.equal(sub.status, "trialing");
    // 14 days from the injected clock = 2026-05-03
    assert.equal(
      new Date(sub.trialEnd).toISOString(),
      new Date("2026-05-03T00:00:00.000Z").toISOString(),
    );
  });

  it("honours a custom durationDays", async () => {
    const deps = makeDeps();
    await handleStartTrial(deps, "user-1", { planId: "pro_monthly", durationDays: 7 });
    const sub = deps._state.subscriptions[0];
    assert.equal(
      new Date(sub.trialEnd).toISOString(),
      new Date("2026-04-26T00:00:00.000Z").toISOString(),
    );
  });

  it("returns 409 CONFLICT when user already has an active subscription", async () => {
    const deps = makeDeps({
      subscriptions: [{ id: "s1", userId: "user-1", status: "active", planId: "pro_yearly" }],
    });
    const res = await handleStartTrial(deps, "user-1", { planId: "pro_monthly" });
    assert.equal(res.status, 409);
    assert.equal((res.body as any).error.code, "CONFLICT");
    // No new subscription row.
    assert.equal(deps._state.subscriptions.length, 1);
  });

  it("returns 409 CONFLICT when user already has a trialing subscription (one trial per user)", async () => {
    const deps = makeDeps({
      subscriptions: [{ id: "s1", userId: "user-1", status: "trialing", planId: "pro_monthly" }],
    });
    const res = await handleStartTrial(deps, "user-1", { planId: "pro_monthly" });
    assert.equal(res.status, 409);
  });

  it("returns 401 for anonymous callers", async () => {
    const deps = makeDeps();
    const res = await handleStartTrial(deps, null, { planId: "pro_monthly" });
    assert.equal(res.status, 401);
    assert.equal(deps._state.subscriptions.length, 0);
  });
});
