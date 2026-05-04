/**
 * Integration tests for the plan-override handlers.
 *
 * Uses a hand-rolled in-memory fake DB + a fake audit port injected
 * via `PlanOverrideDeps`. Every success and failure path is exercised
 * through observable outcomes (response, DB rows, audit calls) — no
 * implementation-detail assertions.
 *
 * Run: node --import tsx --test src/routes/__tests__/plan-override-handlers.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  handleSetPlanOverride,
  handleClearPlanOverride,
  type PlanOverrideDeps,
  type AuditEntry,
} from "../superadmin/plan-override-handlers.js";
import type {
  IUsersRepository,
  ISubscriptionsRepository,
  UserRow,
  PlanOverrideRow,
} from "../../repositories/index.js";
import { UNLIMITED_TOKEN_LIMIT } from "../../domains/planOverride/resolver.js";
import { AUDIT_ACTIONS } from "../../utils/audit.js";

// ---------------------------------------------------------------------------
// Fake DB — just the shapes the handlers actually use.
// ---------------------------------------------------------------------------

interface FakeUser { id: string }
interface FakeOverride {
  userId: string;
  planSlug: string | null;
  monthlyTokenLimit: number | null;
  expiresAt: Date | null;
  reason: string;
  grantedBy: string;
  grantedAt: Date;
  updatedAt: Date;
}

/** Fake repositories backed by in-memory arrays. Only the subset of
 *  methods the two handlers call is implemented — ISP keeps the surface
 *  small so tests don't drown in irrelevant stubs. */
function makeFakeRepos(seed: { users?: FakeUser[]; overrides?: FakeOverride[] } = {}) {
  const state = {
    users: seed.users ?? [],
    userPlanOverrides: seed.overrides ?? [],
  };

  const users: Partial<IUsersRepository> = {
    findById: async (id) => {
      const row = state.users.find((u) => u.id === id);
      return row ? ({ id: row.id } as UserRow) : null;
    },
  };

  const subscriptions: Partial<ISubscriptionsRepository> = {
    findOverrideByUserId: async (userId) => {
      const row = state.userPlanOverrides.find((r) => r.userId === userId);
      return row ? (row as unknown as PlanOverrideRow) : null;
    },
    upsertOverride: async (input: any) => {
      const existingIdx = state.userPlanOverrides.findIndex((r) => r.userId === input.userId);
      if (existingIdx >= 0) {
        Object.assign(state.userPlanOverrides[existingIdx], input);
        return state.userPlanOverrides[existingIdx] as unknown as PlanOverrideRow;
      }
      const row: FakeOverride = {
        userId: input.userId,
        planSlug: input.planSlug ?? null,
        monthlyTokenLimit: input.monthlyTokenLimit ?? null,
        expiresAt: input.expiresAt ?? null,
        reason: input.reason,
        grantedBy: input.grantedBy,
        grantedAt: input.grantedAt,
        updatedAt: input.updatedAt ?? input.grantedAt,
      };
      state.userPlanOverrides.push(row);
      return row as unknown as PlanOverrideRow;
    },
    deleteOverrideByUserId: async (userId) => {
      const idx = state.userPlanOverrides.findIndex((r) => r.userId === userId);
      if (idx < 0) return false;
      state.userPlanOverrides.splice(idx, 1);
      return true;
    },
  };

  return {
    users: users as IUsersRepository,
    subscriptions: subscriptions as ISubscriptionsRepository,
    state,
  };
}

// ---------------------------------------------------------------------------
// Fake audit port
// ---------------------------------------------------------------------------

function makeFakeAudit() {
  const entries: AuditEntry[] = [];
  return {
    entries,
    log: async (e: AuditEntry) => { entries.push(e); },
  };
}

function makeFakeCache() {
  const invalidations: string[] = [];
  return {
    invalidations,
    invalidateForUser: (userId: string) => { invalidations.push(userId); },
  };
}

function makeFakeEmail() {
  const sent: any[] = [];
  return {
    sent,
    sendPlanUpgrade: async (params: any) => { sent.push(params); },
  };
}

const ADMIN_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-0000000000aa";
const NOW = new Date("2026-04-19T12:00:00.000Z");
const FUTURE = new Date("2026-05-20T00:00:00.000Z");

function makeDeps(seed: { users?: FakeUser[]; overrides?: FakeOverride[] } = {}): PlanOverrideDeps & {
  _state: any;
  _audit: ReturnType<typeof makeFakeAudit>;
  _cache: ReturnType<typeof makeFakeCache>;
  _email: ReturnType<typeof makeFakeEmail>;
} {
  const { users, subscriptions, state } = makeFakeRepos(seed);
  const audit = makeFakeAudit();
  const cache = makeFakeCache();
  const email = makeFakeEmail();
  return {
    users,
    subscriptions,
    audit,
    cache,
    email,
    now: () => NOW,
    _state: state,
    _audit: audit,
    _cache: cache,
    _email: email,
  } as any;
}

// ═══════════════════════════════════════════════════════════════════════════
// handleSetPlanOverride
// ═══════════════════════════════════════════════════════════════════════════

describe("handleSetPlanOverride", () => {
  it("creates a Pro override with a future expiry and writes an audit entry", async () => {
    const deps = makeDeps({ users: [{ id: USER_ID }] });

    const res = await handleSetPlanOverride(deps, ADMIN_ID, USER_ID, {
      planSlug: "pro",
      expiresAt: FUTURE.toISOString(),
      reason: "30-day trial comp",
    });

    assert.equal(res.status, 200);
    const body = (res.body as any).data;
    assert.equal(body.planSlug, "pro");
    assert.equal(body.expiresAt, FUTURE.toISOString());
    assert.equal(body.reason, "30-day trial comp");
    assert.equal(body.grantedBy, ADMIN_ID);

    // Persisted
    assert.equal(deps._state.userPlanOverrides.length, 1);
    const row = deps._state.userPlanOverrides[0];
    assert.equal(row.userId, USER_ID);
    assert.equal(row.planSlug, "pro");
    assert.equal(row.expiresAt?.toISOString(), FUTURE.toISOString());
    assert.equal(row.grantedBy, ADMIN_ID);

    // Audited with from=null (first time)
    assert.equal(deps._audit.entries.length, 1);
    const entry = deps._audit.entries[0];
    assert.equal(entry.action, AUDIT_ACTIONS.ADMIN_OVERRIDE_SET);
    assert.equal(entry.targetId, USER_ID);
    const meta = entry.metadata as any;
    assert.equal(meta.from, null);
    assert.equal(meta.to.planSlug, "pro");
    assert.equal(meta.to.reason, "30-day trial comp");

    // Plan cache for the target user is invalidated so the user-facing
    // billing endpoints don't keep serving the pre-override snapshot.
    assert.deepEqual(deps._cache.invalidations, [USER_ID]);
  });

  it("does NOT bust the cache when validation fails", async () => {
    const deps = makeDeps({ users: [{ id: USER_ID }] });
    await handleSetPlanOverride(deps, ADMIN_ID, USER_ID, {
      planSlug: "pro",
      // missing reason
    });
    assert.deepEqual(deps._cache.invalidations, []);
  });

  it("returns 404 when the target user does not exist", async () => {
    const deps = makeDeps({ users: [] });
    const res = await handleSetPlanOverride(deps, ADMIN_ID, USER_ID, {
      planSlug: "pro",
      reason: "nope",
    });
    assert.equal(res.status, 404);
    assert.equal((res.body as any).error.code, "NOT_FOUND");
    assert.equal(deps._state.userPlanOverrides.length, 0);
    assert.equal(deps._audit.entries.length, 0, "no audit write when user missing");
  });

  it("rejects missing reason with 400 VALIDATION_ERROR", async () => {
    const deps = makeDeps({ users: [{ id: USER_ID }] });
    const res = await handleSetPlanOverride(deps, ADMIN_ID, USER_ID, {
      planSlug: "pro",
      // reason intentionally omitted
    });
    assert.equal(res.status, 400);
    assert.equal((res.body as any).error.code, "VALIDATION_ERROR");
  });

  it("rejects expiresAt in the past", async () => {
    const deps = makeDeps({ users: [{ id: USER_ID }] });
    const past = new Date(NOW.getTime() - 1000).toISOString();
    const res = await handleSetPlanOverride(deps, ADMIN_ID, USER_ID, {
      planSlug: "pro",
      expiresAt: past,
      reason: "trial",
    });
    assert.equal(res.status, 400);
    assert.match((res.body as any).error.message, /expiresAt must be in the future/);
  });

  it("rejects a body with neither planSlug nor monthlyTokenLimit", async () => {
    const deps = makeDeps({ users: [{ id: USER_ID }] });
    const res = await handleSetPlanOverride(deps, ADMIN_ID, USER_ID, {
      reason: "reason but no change",
    });
    assert.equal(res.status, 400);
    assert.equal((res.body as any).error.code, "VALIDATION_ERROR");
  });

  it("stores 'unlimited' as UNLIMITED_TOKEN_LIMIT sentinel", async () => {
    const deps = makeDeps({ users: [{ id: USER_ID }] });
    const res = await handleSetPlanOverride(deps, ADMIN_ID, USER_ID, {
      planSlug: "pro",
      monthlyTokenLimit: "unlimited",
      reason: "VIP",
    });
    assert.equal(res.status, 200);
    const row = deps._state.userPlanOverrides[0];
    assert.equal(row.monthlyTokenLimit, UNLIMITED_TOKEN_LIMIT);
  });

  it("accepts a token-limit-only override (planSlug null)", async () => {
    const deps = makeDeps({ users: [{ id: USER_ID }] });
    const res = await handleSetPlanOverride(deps, ADMIN_ID, USER_ID, {
      planSlug: null,
      monthlyTokenLimit: 250_000,
      reason: "temporary bump for free user",
    });
    assert.equal(res.status, 200);
    const row = deps._state.userPlanOverrides[0];
    assert.equal(row.planSlug, null);
    assert.equal(row.monthlyTokenLimit, 250_000);
  });

  it("upserts an existing override — previous values recorded as `from` in audit", async () => {
    const previous: FakeOverride = {
      userId: USER_ID,
      planSlug: "pro",
      monthlyTokenLimit: null,
      expiresAt: null,
      reason: "initial comp",
      grantedBy: ADMIN_ID,
      grantedAt: NOW,
      updatedAt: NOW,
    };
    const deps = makeDeps({ users: [{ id: USER_ID }], overrides: [previous] });

    const res = await handleSetPlanOverride(deps, ADMIN_ID, USER_ID, {
      planSlug: "unlimited",
      reason: "upgraded",
    });

    assert.equal(res.status, 200);
    // Upsert — still one row
    assert.equal(deps._state.userPlanOverrides.length, 1);
    const row = deps._state.userPlanOverrides[0];
    assert.equal(row.planSlug, "unlimited");

    // Audit captures the before/after
    const meta = deps._audit.entries[0].metadata as any;
    assert.equal(meta.from.planSlug, "pro");
    assert.equal(meta.from.reason, "initial comp");
    assert.equal(meta.to.planSlug, "unlimited");
    assert.equal(meta.to.reason, "upgraded");
  });

  it("rejects an invalid plan slug", async () => {
    const deps = makeDeps({ users: [{ id: USER_ID }] });
    const res = await handleSetPlanOverride(deps, ADMIN_ID, USER_ID, {
      planSlug: "admin", // not grantable via override
      reason: "try to promote to admin",
    });
    assert.equal(res.status, 400);
    assert.equal((res.body as any).error.code, "VALIDATION_ERROR");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleClearPlanOverride
// ═══════════════════════════════════════════════════════════════════════════

describe("handleClearPlanOverride", () => {
  it("deletes the existing override and writes an ADMIN_OVERRIDE_CLEARED audit entry", async () => {
    const existing: FakeOverride = {
      userId: USER_ID,
      planSlug: "pro",
      monthlyTokenLimit: null,
      expiresAt: FUTURE,
      reason: "30-day trial",
      grantedBy: ADMIN_ID,
      grantedAt: NOW,
      updatedAt: NOW,
    };
    const deps = makeDeps({ users: [{ id: USER_ID }], overrides: [existing] });

    const res = await handleClearPlanOverride(deps, ADMIN_ID, USER_ID);

    assert.equal(res.status, 200);
    assert.equal((res.body as any).data.cleared, true);
    assert.equal(deps._state.userPlanOverrides.length, 0);

    assert.equal(deps._audit.entries.length, 1);
    const entry = deps._audit.entries[0];
    assert.equal(entry.action, AUDIT_ACTIONS.ADMIN_OVERRIDE_CLEARED);
    const meta = entry.metadata as any;
    assert.equal(meta.clearedOverride.planSlug, "pro");
    assert.equal(meta.clearedOverride.reason, "30-day trial");

    // Cache invalidated so the user reverts to subscription-derived plan
    // on the next request rather than waiting out the cache TTL.
    assert.deepEqual(deps._cache.invalidations, [USER_ID]);
  });

  it("returns 404 when the target user does not exist", async () => {
    const deps = makeDeps({ users: [] });
    const res = await handleClearPlanOverride(deps, ADMIN_ID, USER_ID);
    assert.equal(res.status, 404);
    assert.equal(deps._audit.entries.length, 0);
  });

  it("is idempotent — clearing when no override exists returns 200 cleared:false and writes no audit", async () => {
    const deps = makeDeps({ users: [{ id: USER_ID }], overrides: [] });
    const res = await handleClearPlanOverride(deps, ADMIN_ID, USER_ID);
    assert.equal(res.status, 200);
    assert.equal((res.body as any).data.cleared, false);
    assert.equal(deps._audit.entries.length, 0, "no audit entry for a no-op clear");
  });
});
