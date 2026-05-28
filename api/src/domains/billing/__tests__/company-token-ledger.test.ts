/**
 * Company AI token pool + per-member sub-cap tests (gap #1679).
 *
 * Exercises the accounting that routes an active employee's AI spend to the
 * employer's shared pool: context resolution, pool budget math (seats × the
 * per-seat monthly allowance), the gate (pool-exhausted + member sub-cap),
 * the debit (monthly → pack overflow), and the employer's set-sub-cap
 * authority. Uses the fake-db AST harness (now SUM-aware) so the token math
 * is evaluated for real.
 *
 * Run: node --import tsx --test src/domains/billing/__tests__/company-token-ledger.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import { PRO_AI_MONTHLY_TOKENS } from "../../../../../shared/pricing.js";
import {
  resolveEmployeeAiContext,
  getCompanyTokenBudget,
  getMemberMonthlyCompanyUsage,
  checkCompanyBudget,
  recordCompanyTokenUsage,
  setMemberTokenLimit,
} from "../company-token-ledger.js";

const COMPANY = "co-1";

function makeDb(seed: Record<string, any[]> = {}) {
  return buildFakeDb({
    users: [],
    user_company_role_associations: [],
    company_subscriptions: [],
    ai_usage_records: [],
    company_token_balance: [],
    ...seed,
  });
}

function usage(over: Record<string, any> = {}) {
  return {
    userId: "u-emp",
    companyId: COMPANY,
    totalTokens: 1000,
    source: "monthly",
    createdAt: new Date(),
    ...over,
  };
}

describe("company-token-ledger — context", () => {
  it("resolves an active employee's company + sub-cap", async () => {
    const { db } = makeDb({
      user_company_role_associations: [
        { id: "u1", userId: "u-emp", companyId: COMPANY, role: "employee", isActive: true, monthlyTokenLimit: 50000 },
      ],
    });
    const ctx = await resolveEmployeeAiContext("u-emp", db);
    assert.deepEqual(ctx, { companyId: COMPANY, monthlyTokenLimit: 50000 });
  });

  it("returns null for non-employees (per-user path)", async () => {
    const { db } = makeDb({
      user_company_role_associations: [
        { id: "u1", userId: "u-rec", companyId: COMPANY, role: "recruiter", isActive: true },
      ],
    });
    assert.equal(await resolveEmployeeAiContext("u-rec", db), null);
  });

  it("returns null for a deactivated membership", async () => {
    const { db } = makeDb({
      user_company_role_associations: [
        { id: "u1", userId: "u-emp", companyId: COMPANY, role: "employee", isActive: false },
      ],
    });
    assert.equal(await resolveEmployeeAiContext("u-emp", db), null);
  });
});

describe("company-token-ledger — pool budget (SUM-aware)", () => {
  it("monthly limit = seats × per-seat allowance, minus attributed usage", async () => {
    const { db } = makeDb({
      company_subscriptions: [{ id: "s1", companyId: COMPANY, seatCount: 2 }],
      ai_usage_records: [
        usage({ totalTokens: 300000 }),
        usage({ totalTokens: 200000, userId: "u-emp2" }),
      ],
      company_token_balance: [{ id: "b1", companyId: COMPANY, balance: 10000 }],
    });
    const budget = await getCompanyTokenBudget(COMPANY, db);
    assert.equal(budget.monthlyLimit, 2 * PRO_AI_MONTHLY_TOKENS);
    assert.equal(budget.monthlyUsed, 500000);
    assert.equal(budget.monthlyRemaining, 2 * PRO_AI_MONTHLY_TOKENS - 500000);
    assert.equal(budget.packBalance, 10000);
    assert.equal(budget.totalAvailable, 2 * PRO_AI_MONTHLY_TOKENS - 500000 + 10000);
  });

  it("a member's MTD usage only counts their own company-attributed rows", async () => {
    const { db } = makeDb({
      ai_usage_records: [
        usage({ userId: "u-emp", totalTokens: 1000 }),
        usage({ userId: "u-emp", totalTokens: 2000 }),
        usage({ userId: "u-other", totalTokens: 9999 }),
      ],
    });
    assert.equal(await getMemberMonthlyCompanyUsage(COMPANY, "u-emp", db), 3000);
  });
});

describe("company-token-ledger — gate", () => {
  it("passes (null) when the pool has budget and no sub-cap", async () => {
    const { db } = makeDb({
      company_subscriptions: [{ id: "s1", companyId: COMPANY, seatCount: 1 }],
    });
    const blocked = await checkCompanyBudget({ companyId: COMPANY, monthlyTokenLimit: null }, "u-emp", db);
    assert.equal(blocked, null);
  });

  it("blocks when the shared pool is exhausted (no seats, no pack)", async () => {
    const { db } = makeDb({
      company_subscriptions: [{ id: "s1", companyId: COMPANY, seatCount: 0 }],
    });
    const blocked = await checkCompanyBudget({ companyId: COMPANY, monthlyTokenLimit: null }, "u-emp", db);
    assert.ok(blocked, "should be blocked");
    assert.equal(blocked!.totalAvailable, 0);
  });

  it("blocks a member who hit their sub-cap even when the pool has room", async () => {
    const { db } = makeDb({
      company_subscriptions: [{ id: "s1", companyId: COMPANY, seatCount: 5 }],
      ai_usage_records: [usage({ userId: "u-emp", totalTokens: 50000 })],
    });
    const blocked = await checkCompanyBudget({ companyId: COMPANY, monthlyTokenLimit: 50000 }, "u-emp", db);
    assert.ok(blocked, "should be blocked by sub-cap");
    assert.equal(blocked!.monthlyLimit, 50000);
    assert.equal(blocked!.monthlyUsed, 50000);
  });
});

describe("company-token-ledger — debit", () => {
  it("attributes usage to the company and uses the monthly source by default", async () => {
    const { db, state } = makeDb({
      company_subscriptions: [{ id: "s1", companyId: COMPANY, seatCount: 1 }],
    });
    await recordCompanyTokenUsage(
      { companyId: COMPANY, userId: "u-emp", model: "gpt", featureKey: "chat", promptTokens: 100, completionTokens: 50 },
      db,
    );
    assert.equal(state.ai_usage_records.length, 1);
    const row = state.ai_usage_records[0]!;
    assert.equal(row.companyId, COMPANY);
    assert.equal(row.totalTokens, 150);
    assert.equal(row.source, "monthly");
  });

  it("routes to the pack source once the monthly pool is spent", async () => {
    const { db, state } = makeDb({
      // seatCount 0 → monthly pool 0 → the call must overflow to the pack.
      company_subscriptions: [{ id: "s1", companyId: COMPANY, seatCount: 0 }],
      company_token_balance: [{ id: "b1", companyId: COMPANY, balance: 5000, lifetimeConsumed: 0 }],
    });
    await recordCompanyTokenUsage(
      { companyId: COMPANY, userId: "u-emp", model: "gpt", featureKey: "chat", promptTokens: 1000, completionTokens: 0 },
      db,
    );
    // The routing decision (monthly exhausted → debit the pack) is what this
    // covers. The exact decremented balance is a GREATEST(0, balance - n) SQL
    // upsert the fake-db can't evaluate; the decrement SQL mirrors the proven
    // per-user recordTokenUsage path.
    assert.equal(state.ai_usage_records[0]!.source, "pack");
    assert.equal(state.ai_usage_records[0]!.companyId, COMPANY);
  });

  it("stays on the monthly source while the pool has room even with a pack balance", async () => {
    const { db, state } = makeDb({
      company_subscriptions: [{ id: "s1", companyId: COMPANY, seatCount: 1 }],
      company_token_balance: [{ id: "b1", companyId: COMPANY, balance: 5000 }],
    });
    await recordCompanyTokenUsage(
      { companyId: COMPANY, userId: "u-emp", model: "gpt", featureKey: "chat", promptTokens: 1000, completionTokens: 0 },
      db,
    );
    assert.equal(state.ai_usage_records[0]!.source, "monthly");
  });
});

describe("company-token-ledger — employer sets sub-cap", () => {
  it("lets an employer cap a member in their workspace", async () => {
    const { db, state } = makeDb({
      user_company_role_associations: [
        { id: "er", userId: "u-boss", companyId: COMPANY, role: "employer", isActive: true },
        { id: "ee", userId: "u-emp", companyId: COMPANY, role: "employee", isActive: true, monthlyTokenLimit: null },
      ],
    });
    await setMemberTokenLimit("u-boss", "u-emp", 25000, db);
    assert.equal(state.user_company_role_associations.find((r) => r.id === "ee")!.monthlyTokenLimit, 25000);
  });

  it("forbids capping a member outside the employer's workspace", async () => {
    const { db } = makeDb({
      user_company_role_associations: [
        { id: "er", userId: "u-boss", companyId: COMPANY, role: "employer", isActive: true },
        { id: "ee", userId: "u-emp", companyId: "other-co", role: "employee", isActive: true },
      ],
    });
    await assert.rejects(() => setMemberTokenLimit("u-boss", "u-emp", 25000, db), /not in your workspace/i);
  });

  it("forbids a non-employer from setting caps", async () => {
    const { db } = makeDb({
      user_company_role_associations: [
        { id: "ee", userId: "u-emp", companyId: COMPANY, role: "employee", isActive: true },
      ],
    });
    await assert.rejects(() => setMemberTokenLimit("u-rando", "u-emp", 1, db), /not an employer/i);
  });
});
