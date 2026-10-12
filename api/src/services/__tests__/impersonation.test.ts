/**
 * Service-level tests for the SuperAdmin impersonation state machine.
 *
 * Covers the lifecycle (start → switch-role → end) plus the failure
 * modes that have to hold regardless of call order:
 *   - SA cannot impersonate another SA  → 403 FORBIDDEN
 *   - Target user missing               → 404 NOT_FOUND
 *   - SA with an active session blocked → 409 CONFLICT
 *   - End by a different admin          → 404 NOT_FOUND (scoped to adminId)
 *   - Ending an already-ended session   → 409 CONFLICT
 *   - Switch role writes a history row
 *   - Every lifecycle event writes an audit entry
 *
 * Uses the shared `buildFakeDb` harness + fake LLM-client-style stubs
 * for `buildToken` and `audit`. No real Postgres, no real JWT secret,
 * no real audit log — the contract the impersonation service promises
 * is what we assert.
 *
 * Run:
 *   node --import tsx --test src/services/__tests__/impersonation.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  startImpersonation,
  endImpersonation,
  switchImpersonationRole,
  getActiveSession,
  listSessions,
  getSessionDetail,
  type ImpersonationDeps,
} from "../auth/impersonation.js";
import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import { AUDIT_ACTIONS } from "../../utils/audit.js";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type AuditCall = Parameters<ImpersonationDeps["audit"]>[0];
type BuildTokenCall = Parameters<ImpersonationDeps["buildToken"]>[0];

function makeDeps(opts: {
  users?: any[];
  impersonationSessions?: any[];
  impersonationRoleSwitches?: any[];
  now?: Date;
  tokenId?: string;
} = {}): ImpersonationDeps & {
  _state: any;
  _audit: AuditCall[];
  _tokens: BuildTokenCall[];
} {
  const fake = buildFakeDb({
    users: opts.users ?? [],
    impersonation_sessions: opts.impersonationSessions ?? [],
    impersonation_role_switches: opts.impersonationRoleSwitches ?? [],
    admin_audit_log: [],
  });
  const state = fake.state as any;
  // Alias DB-snake names to camelCase so tests read naturally.
  Object.defineProperty(state, "impersonationSessions", {
    get: () => state.impersonation_sessions,
  });
  Object.defineProperty(state, "impersonationRoleSwitches", {
    get: () => state.impersonation_role_switches,
  });

  const audit: AuditCall[] = [];
  const tokens: BuildTokenCall[] = [];
  const fixedNow = opts.now ?? new Date("2026-04-21T12:00:00Z");

  return {
    db: fake.db,
    now: () => fixedNow,
    buildToken: async (payload) => {
      tokens.push(payload);
      return { token: `fake.token.${tokens.length}`, jti: opts.tokenId ?? `jti-${tokens.length}` };
    },
    audit: async (entry) => {
      audit.push(entry);
    },
    _state: state,
    _audit: audit,
    _tokens: tokens,
  } as any;
}

function seedUser(overrides: any = {}) {
  return {
    id: overrides.id ?? randomUUID(),
    email: overrides.email ?? "jane@example.com",
    name: overrides.name ?? "Jane Doe",
    role: overrides.role ?? "JobSeeker",
    isSuperAdmin: overrides.isSuperAdmin ?? false,
    isSuspended: overrides.isSuspended ?? false,
    ...overrides,
  };
}

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";

// ---------------------------------------------------------------------------
// startImpersonation — happy path
// ---------------------------------------------------------------------------

describe("startImpersonation — happy path", () => {
  it("creates a session, signs a token, writes audit log, returns caller-usable envelope", async () => {
    const target = seedUser();
    const deps = makeDeps({ users: [target] });

    const r = await startImpersonation(
      { adminId: ADMIN_ID, targetUserId: target.id, reason: "customer reported bug #4231" },
      deps,
    );

    assert.equal(r.ok, true);
    if (!r.ok) return; // type narrow
    // Response envelope
    assert.equal(r.result.user.id, target.id);
    assert.equal(r.result.user.email, target.email);
    assert.equal(r.result.role, "JobSeeker");
    assert.ok(r.result.sessionId);
    assert.ok(r.result.token.startsWith("fake.token."));
    // TTL: expiresAt is exactly 1 hour after deps.now()
    assert.equal(r.result.expiresAt.getTime() - deps.now().getTime(), 60 * 60 * 1000);

    // DB state: one session row, belonging to the admin, targeting the right user
    const sessions = deps._state.impersonationSessions;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].superAdminId, ADMIN_ID);
    assert.equal(sessions[0].targetUserId, target.id);
    assert.equal(sessions[0].reason, "customer reported bug #4231");
    assert.equal(sessions[0].endedAt, undefined);

    // Signed token payload
    assert.equal(deps._tokens.length, 1);
    assert.equal(deps._tokens[0].targetUserId, target.id);
    assert.equal(deps._tokens[0].adminId, ADMIN_ID);

    // Audit trail
    assert.equal(deps._audit.length, 1);
    assert.equal(deps._audit[0].action, AUDIT_ACTIONS.IMPERSONATION_STARTED);
    assert.equal(deps._audit[0].actorId, ADMIN_ID);
    assert.equal(deps._audit[0].targetId, target.id);
    assert.equal((deps._audit[0].metadata as any)?.reason, "customer reported bug #4231");
  });

  it("trims whitespace from reason before persisting (not a silent footgun)", async () => {
    const target = seedUser();
    const deps = makeDeps({ users: [target] });
    await startImpersonation(
      { adminId: ADMIN_ID, targetUserId: target.id, reason: "  spaces  " },
      deps,
    );
    assert.equal(deps._state.impersonationSessions[0].reason, "spaces");
  });

  it("debuggerEnabled defaults to false and surfaces as-is when passed", async () => {
    const target = seedUser();
    const deps = makeDeps({ users: [target] });
    await startImpersonation(
      { adminId: ADMIN_ID, targetUserId: target.id, reason: "x", enableDebugger: true },
      deps,
    );
    assert.equal(deps._state.impersonationSessions[0].debuggerEnabled, true);
  });
});

// ---------------------------------------------------------------------------
// startImpersonation — failure modes
// ---------------------------------------------------------------------------

describe("startImpersonation — failure modes", () => {
  it("404 when the target user doesn't exist", async () => {
    const deps = makeDeps({ users: [] });
    const r = await startImpersonation(
      { adminId: ADMIN_ID, targetUserId: randomUUID(), reason: "debug" },
      deps,
    );
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, "NOT_FOUND");
    // No session row, no token, no audit.
    assert.equal(deps._state.impersonationSessions.length, 0);
    assert.equal(deps._tokens.length, 0);
    assert.equal(deps._audit.length, 0);
  });

  it("403 FORBIDDEN when target is another SuperAdmin", async () => {
    const otherAdmin = seedUser({ isSuperAdmin: true });
    const deps = makeDeps({ users: [otherAdmin] });
    const r = await startImpersonation(
      { adminId: ADMIN_ID, targetUserId: otherAdmin.id, reason: "debug" },
      deps,
    );
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, "FORBIDDEN");
    assert.match(r.message, /SuperAdmin/);
  });

  it("409 CONFLICT when the admin already has an active session", async () => {
    const target = seedUser();
    const target2 = seedUser({ email: "two@example.com" });
    const existingSession = {
      id: randomUUID(),
      superAdminId: ADMIN_ID,
      targetUserId: target.id,
      tokenId: "prior",
      reason: "prior",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
      endedAt: null,
    };
    const deps = makeDeps({
      users: [target, target2],
      impersonationSessions: [existingSession],
    });
    const r = await startImpersonation(
      { adminId: ADMIN_ID, targetUserId: target2.id, reason: "debug" },
      deps,
    );
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, "CONFLICT");
    // Original session untouched; no second insert
    assert.equal(deps._state.impersonationSessions.length, 1);
  });

  it("an ENDED prior session does NOT block a new start", async () => {
    const target = seedUser();
    const endedSession = {
      id: randomUUID(),
      superAdminId: ADMIN_ID,
      targetUserId: target.id,
      tokenId: "prior",
      reason: "prior",
      startedAt: new Date(Date.now() - 7_200_000),
      expiresAt: new Date(Date.now() - 3_600_000),
      endedAt: new Date(Date.now() - 3_600_000),
    };
    const deps = makeDeps({
      users: [target],
      impersonationSessions: [endedSession],
    });
    const r = await startImpersonation(
      { adminId: ADMIN_ID, targetUserId: target.id, reason: "new session" },
      deps,
    );
    assert.equal(r.ok, true);
    assert.equal(deps._state.impersonationSessions.length, 2);
  });

  it("another admin's active session does NOT block this admin", async () => {
    const target = seedUser();
    const otherAdminSession = {
      id: randomUUID(),
      superAdminId: randomUUID(), // different admin
      targetUserId: target.id,
      tokenId: "other",
      reason: "other admin",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
      endedAt: null,
    };
    const deps = makeDeps({
      users: [target],
      impersonationSessions: [otherAdminSession],
    });
    const r = await startImpersonation(
      { adminId: ADMIN_ID, targetUserId: target.id, reason: "mine" },
      deps,
    );
    assert.equal(r.ok, true);
  });
});

// ---------------------------------------------------------------------------
// endImpersonation
// ---------------------------------------------------------------------------

describe("endImpersonation", () => {
  it("marks the session ended, computes duration, writes audit", async () => {
    const target = seedUser();
    const startedAt = new Date("2026-04-21T11:30:00Z");
    const expiresAt = new Date("2026-04-21T12:30:00Z");
    const session = {
      id: randomUUID(),
      superAdminId: ADMIN_ID,
      targetUserId: target.id,
      tokenId: "t",
      reason: "r",
      startedAt,
      expiresAt,
      endedAt: null,
      writeBlockCount: 3,
    };
    const deps = makeDeps({
      users: [target],
      impersonationSessions: [session],
      now: new Date("2026-04-21T12:00:00Z"),
    });
    const r = await endImpersonation(ADMIN_ID, session.id, deps);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    // Duration: 30 minutes = 1800s
    assert.equal(r.result.durationSeconds, 1800);
    // DB updated — endedAt set
    assert.ok(deps._state.impersonationSessions[0].endedAt);
    // Audit event emitted with writeBlockCount metadata
    assert.equal(deps._audit.length, 1);
    assert.equal(deps._audit[0].action, AUDIT_ACTIONS.IMPERSONATION_ENDED);
    assert.equal((deps._audit[0].metadata as any)?.writeBlockCount, 3);
  });

  it("404 when the session doesn't exist", async () => {
    const deps = makeDeps();
    const r = await endImpersonation(ADMIN_ID, randomUUID(), deps);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, "NOT_FOUND");
  });

  it("404 when a DIFFERENT admin tries to end the session (WHERE scoped to superAdminId)", async () => {
    const target = seedUser();
    const session = {
      id: randomUUID(),
      superAdminId: ADMIN_ID,
      targetUserId: target.id,
      tokenId: "t",
      reason: "r",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
      endedAt: null,
      writeBlockCount: 0,
    };
    const deps = makeDeps({ users: [target], impersonationSessions: [session] });
    const otherAdminId = randomUUID();
    const r = await endImpersonation(otherAdminId, session.id, deps);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, "NOT_FOUND");
    // Unchanged
    assert.equal(deps._state.impersonationSessions[0].endedAt, null);
  });

  it("409 CONFLICT when the session is already ended", async () => {
    const target = seedUser();
    const session = {
      id: randomUUID(),
      superAdminId: ADMIN_ID,
      targetUserId: target.id,
      tokenId: "t",
      reason: "r",
      startedAt: new Date(Date.now() - 3_600_000),
      expiresAt: new Date(),
      endedAt: new Date(Date.now() - 1_800_000),
      writeBlockCount: 0,
    };
    const deps = makeDeps({ users: [target], impersonationSessions: [session] });
    const r = await endImpersonation(ADMIN_ID, session.id, deps);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, "CONFLICT");
  });
});

// ---------------------------------------------------------------------------
// switchImpersonationRole
// ---------------------------------------------------------------------------

describe("switchImpersonationRole", () => {
  it("signs a new token with the new role, writes a history row + audit", async () => {
    const target = seedUser({ role: "JobSeeker" });
    const session = {
      id: randomUUID(),
      superAdminId: ADMIN_ID,
      targetUserId: target.id,
      tokenId: "t",
      reason: "r",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
      endedAt: null,
    };
    const deps = makeDeps({ users: [target], impersonationSessions: [session] });
    const r = await switchImpersonationRole(ADMIN_ID, session.id, "Recruiter", deps);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.result.role, "Recruiter");
    assert.equal(deps._tokens.length, 1);
    assert.equal(deps._tokens[0].targetRole, "Recruiter");

    // History row written
    const switches = deps._state.impersonationRoleSwitches;
    assert.equal(switches.length, 1);
    assert.equal(switches[0].fromRole, "JobSeeker");
    assert.equal(switches[0].toRole, "Recruiter");

    // Audit entry
    assert.equal(deps._audit[0].action, AUDIT_ACTIONS.IMPERSONATION_PERSONA_SWITCHED);
  });

  it("404 when the session is ended (cannot switch after end)", async () => {
    const target = seedUser();
    const session = {
      id: randomUUID(),
      superAdminId: ADMIN_ID,
      targetUserId: target.id,
      tokenId: "t",
      reason: "r",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
      endedAt: new Date(), // ← ended
    };
    const deps = makeDeps({ users: [target], impersonationSessions: [session] });
    const r = await switchImpersonationRole(ADMIN_ID, session.id, "Recruiter", deps);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, "NOT_FOUND");
  });

  it("404 when a different admin tries to switch role on this session", async () => {
    const target = seedUser();
    const session = {
      id: randomUUID(),
      superAdminId: ADMIN_ID,
      targetUserId: target.id,
      tokenId: "t",
      reason: "r",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
      endedAt: null,
    };
    const deps = makeDeps({ users: [target], impersonationSessions: [session] });
    const r = await switchImpersonationRole(randomUUID(), session.id, "Recruiter", deps);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, "NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// getActiveSession / listSessions / getSessionDetail
// ---------------------------------------------------------------------------

describe("getActiveSession", () => {
  it("returns null when the admin has no active session", async () => {
    const deps = makeDeps();
    const r = await getActiveSession(ADMIN_ID, deps);
    assert.equal(r, null);
  });

  it("returns the session + targetUser when active", async () => {
    const target = seedUser({ email: "active@example.com", role: "Employer" });
    const session = {
      id: randomUUID(),
      superAdminId: ADMIN_ID,
      targetUserId: target.id,
      tokenId: "t",
      reason: "r",
      debuggerEnabled: true,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
      endedAt: null,
    };
    const deps = makeDeps({ users: [target], impersonationSessions: [session] });
    const r = await getActiveSession(ADMIN_ID, deps);
    assert.ok(r);
    assert.equal(r!.id, session.id);
    assert.equal(r!.targetUser?.email, "active@example.com");
    assert.equal(r!.debuggerEnabled, true);
  });

  it("returns null when the session is ended", async () => {
    const target = seedUser();
    const session = {
      id: randomUUID(),
      superAdminId: ADMIN_ID,
      targetUserId: target.id,
      tokenId: "t",
      reason: "r",
      startedAt: new Date(),
      expiresAt: new Date(),
      endedAt: new Date(),
    };
    const deps = makeDeps({ users: [target], impersonationSessions: [session] });
    const r = await getActiveSession(ADMIN_ID, deps);
    assert.equal(r, null);
  });
});

describe("listSessions", () => {
  it("returns paginated slices + total", async () => {
    const target = seedUser();
    const sessions = Array.from({ length: 25 }, (_, i) => ({
      id: randomUUID(),
      superAdminId: ADMIN_ID,
      targetUserId: target.id,
      tokenId: `t${i}`,
      reason: `r${i}`,
      startedAt: new Date(Date.now() - i * 1000),
      expiresAt: new Date(Date.now() + 3_600_000),
      endedAt: null,
      endReason: null,
      writeBlockCount: i,
    }));
    const deps = makeDeps({ users: [target], impersonationSessions: sessions });
    const r = await listSessions(1, 10, deps);
    assert.equal(r.sessions.length, 10);
    assert.equal(r.total, 25);
    assert.equal(r.page, 1);
    assert.equal(r.limit, 10);
  });
});

describe("getSessionDetail", () => {
  it("returns session + roleSwitches + targetUser", async () => {
    const target = seedUser();
    const session = {
      id: randomUUID(),
      superAdminId: ADMIN_ID,
      targetUserId: target.id,
      tokenId: "t",
      reason: "r",
      startedAt: new Date(),
      expiresAt: new Date(),
      endedAt: null,
    };
    const roleSwitch = {
      id: randomUUID(),
      sessionId: session.id,
      fromRole: "JobSeeker",
      toRole: "Recruiter",
      switchedAt: new Date(),
    };
    const deps = makeDeps({
      users: [target],
      impersonationSessions: [session],
      impersonationRoleSwitches: [roleSwitch],
    });
    const r = await getSessionDetail(session.id, deps);
    assert.ok(r);
    assert.equal(r!.session.id, session.id);
    assert.equal(r!.roleSwitches.length, 1);
    assert.equal(r!.targetUser?.id, target.id);
  });

  it("returns null when the session doesn't exist", async () => {
    const deps = makeDeps();
    const r = await getSessionDetail(randomUUID(), deps);
    assert.equal(r, null);
  });
});
