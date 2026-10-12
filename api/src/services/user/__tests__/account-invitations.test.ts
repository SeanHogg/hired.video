/**
 * Seat-invitation lifecycle tests (gaps #1673–#1685).
 *
 * Covers the security-critical halves the audit on 2026-05-28 found
 * unguarded: token-based accept (status / expiry / email-match), cancel +
 * resend authority, removed-user session revocation, and pending-invite
 * tenant scoping. Uses the project's `buildFakeDb` AST harness so WHERE
 * clauses are evaluated for real — a passing test proves the predicate
 * matched, not just that the code ran.
 *
 * Run: node --import tsx --test src/services/user/__tests__/account-invitations.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import { __setDefaultApiDepsForTests } from "../../apiDeps.js";
import {
  acceptInvitation,
  cancelInvitation,
  resendInvitation,
  removeAccountUser,
  listPendingInvitations,
  getInvitationDetailsByToken,
  inviteAccountUser,
} from "../account.js";

// resolveDeps() always calls defaultApiDeps(); stub it so it never tries to
// construct real repos / open a DB connection. The functions under test read
// only the injected `db`.
__setDefaultApiDepsForTests({ repos: {} } as any);

const DAY = 24 * 60 * 60 * 1000;
const future = () => new Date(Date.now() + 10 * DAY);
const past = () => new Date(Date.now() - 1000);

function makeDb(seed: Record<string, any[]> = {}) {
  return buildFakeDb({
    users: [],
    account_invitations: [],
    user_company_role_associations: [],
    company_profiles: [],
    sessions: [],
    refresh_tokens: [],
    company_subscriptions: [],
    billing_events: [],
    ...seed,
  });
}

const INVITEE = { id: "u-jane", name: "Jane", email: "jane@acme.com", role: "job_seeker", isActive: true };
const BOSS = { id: "u-boss", name: "Boss", email: "boss@acme.com", role: "employer", isActive: true };
const COMPANY = { id: "c-acme", name: "Acme", description: "We build things", logoUrl: null, ownerId: "u-boss" };

function pendingInvite(over: Record<string, any> = {}) {
  return {
    id: "inv-1",
    token: "tok-secret",
    email: "jane@acme.com",
    role: "recruiter",
    status: "pending",
    invitedBy: "u-boss",
    companyId: "c-acme",
    createdAt: new Date(),
    expiresAt: future(),
    ...over,
  };
}

// ─── acceptInvitation (gap #1674) ────────────────────────────────────────────

describe("acceptInvitation — token + auth + lifecycle", () => {
  it("binds membership for an authenticated, email-matched invitee", async () => {
    const { db, state } = makeDb({
      users: [{ ...INVITEE }, { ...BOSS }],
      account_invitations: [pendingInvite()],
      company_profiles: [{ ...COMPANY }],
    });

    const res = await acceptInvitation("tok-secret", "u-jane", { db });

    assert.equal(res.success, true);
    assert.equal(res.companyName, "Acme");
    assert.equal(state.account_invitations[0]!.status, "accepted");
    assert.ok(state.account_invitations[0]!.acceptedAt);
    const ucra = state.user_company_role_associations.find((r) => r.userId === "u-jane");
    assert.ok(ucra, "UCRA row created");
    assert.equal(ucra!.companyId, "c-acme");
    assert.equal(ucra!.role, "recruiter");
    assert.equal(ucra!.isActive, true);
    assert.equal(state.users.find((u) => u.id === "u-jane")!.role, "recruiter");
  });

  it("rejects a CANCELLED invite and does not join (no resurrection)", async () => {
    const { db, state } = makeDb({
      users: [{ ...INVITEE }],
      account_invitations: [pendingInvite({ status: "cancelled" })],
      company_profiles: [{ ...COMPANY }],
    });

    await assert.rejects(() => acceptInvitation("tok-secret", "u-jane", { db }), /no longer active/i);
    assert.equal(state.account_invitations[0]!.status, "cancelled");
    assert.equal(state.user_company_role_associations.length, 0);
  });

  it("rejects an already-ACCEPTED invite", async () => {
    const { db } = makeDb({
      users: [{ ...INVITEE }],
      account_invitations: [pendingInvite({ status: "accepted" })],
    });
    await assert.rejects(() => acceptInvitation("tok-secret", "u-jane", { db }), /no longer active/i);
  });

  it("rejects an EXPIRED invite", async () => {
    const { db, state } = makeDb({
      users: [{ ...INVITEE }],
      account_invitations: [pendingInvite({ expiresAt: past() })],
    });
    await assert.rejects(() => acceptInvitation("tok-secret", "u-jane", { db }), /expired/i);
    assert.equal(state.account_invitations[0]!.status, "pending");
  });

  it("rejects when the caller's email does not match the invite (no side effects)", async () => {
    const { db, state } = makeDb({
      users: [{ ...INVITEE, id: "u-other", email: "someone@else.com" }],
      account_invitations: [pendingInvite()],
    });
    await assert.rejects(
      () => acceptInvitation("tok-secret", "u-other", { db }),
      /sent to jane@acme.com/i,
    );
    assert.equal(state.account_invitations[0]!.status, "pending");
    assert.equal(state.user_company_role_associations.length, 0);
  });

  it("404s an unknown token", async () => {
    const { db } = makeDb({ users: [{ ...INVITEE }], account_invitations: [pendingInvite()] });
    await assert.rejects(() => acceptInvitation("wrong-token", "u-jane", { db }), /not found/i);
  });
});

// ─── getInvitationDetailsByToken (gap #1673/#1674) ───────────────────────────

describe("getInvitationDetailsByToken", () => {
  it("returns rich details for a pending invite", async () => {
    const { db } = makeDb({
      users: [{ ...INVITEE }, { ...BOSS }],
      account_invitations: [pendingInvite()],
      company_profiles: [{ ...COMPANY }],
    });
    const d = await getInvitationDetailsByToken("tok-secret", { db });
    assert.equal(d.companyName, "Acme");
    assert.equal(d.inviterName, "Boss");
    assert.equal(d.invitedEmail, "jane@acme.com");
    assert.deepEqual(d.rolesToAssign, ["recruiter"]);
    assert.equal(d.userExists, true);
  });

  it("throws for cancelled / expired / unknown tokens", async () => {
    const cancelled = makeDb({ account_invitations: [pendingInvite({ status: "cancelled" })] });
    await assert.rejects(() => getInvitationDetailsByToken("tok-secret", { db: cancelled.db }), /no longer active/i);

    const expired = makeDb({ account_invitations: [pendingInvite({ expiresAt: past() })] });
    await assert.rejects(() => getInvitationDetailsByToken("tok-secret", { db: expired.db }), /expired/i);

    const empty = makeDb();
    await assert.rejects(() => getInvitationDetailsByToken("tok-secret", { db: empty.db }), /not found/i);
  });
});

// ─── cancelInvitation (gap #1675) ────────────────────────────────────────────

describe("cancelInvitation — authority", () => {
  it("lets the inviter cancel their invite", async () => {
    const { db, state } = makeDb({
      users: [{ ...BOSS }],
      account_invitations: [pendingInvite()],
    });
    await cancelInvitation("u-boss", "inv-1", { db });
    assert.equal(state.account_invitations[0]!.status, "cancelled");
    assert.ok(state.account_invitations[0]!.cancelledAt);
  });

  it("lets a platform admin cancel any invite", async () => {
    const { db, state } = makeDb({
      users: [{ id: "u-admin", name: "Admin", email: "a@x.com", role: "admin", isActive: true }],
      account_invitations: [pendingInvite()],
    });
    await cancelInvitation("u-admin", "inv-1", { db });
    assert.equal(state.account_invitations[0]!.status, "cancelled");
  });

  it("forbids an unrelated user from cancelling", async () => {
    const { db, state } = makeDb({
      users: [{ id: "u-stranger", name: "S", email: "s@x.com", role: "job_seeker", isActive: true }],
      account_invitations: [pendingInvite()],
    });
    await assert.rejects(() => cancelInvitation("u-stranger", "inv-1", { db }), /not allowed/i);
    assert.equal(state.account_invitations[0]!.status, "pending");
  });
});

// ─── resendInvitation (gap #1675) ────────────────────────────────────────────

describe("resendInvitation — authority + no resurrection", () => {
  it("rotates the token + extends expiry for a pending invite (inviter)", async () => {
    const { db, state } = makeDb({
      users: [{ ...BOSS }],
      account_invitations: [pendingInvite()],
      company_profiles: [{ ...COMPANY }],
    });
    const oldExpiry = (state.account_invitations[0]!.expiresAt as Date).getTime();
    await resendInvitation("u-boss", "inv-1", { db });
    assert.notEqual(state.account_invitations[0]!.token, "tok-secret");
    assert.equal(state.account_invitations[0]!.status, "pending");
    assert.ok((state.account_invitations[0]!.expiresAt as Date).getTime() >= oldExpiry);
  });

  it("refuses to resend a CANCELLED invite (no resurrection)", async () => {
    const { db, state } = makeDb({
      users: [{ ...BOSS }],
      account_invitations: [pendingInvite({ status: "cancelled" })],
    });
    await assert.rejects(() => resendInvitation("u-boss", "inv-1", { db }), /only pending/i);
    assert.equal(state.account_invitations[0]!.status, "cancelled");
    assert.equal(state.account_invitations[0]!.token, "tok-secret");
  });

  it("forbids an unrelated user from resending", async () => {
    const { db } = makeDb({
      users: [{ id: "u-stranger", name: "S", email: "s@x.com", role: "job_seeker", isActive: true }],
      account_invitations: [pendingInvite()],
    });
    await assert.rejects(() => resendInvitation("u-stranger", "inv-1", { db }), /not allowed/i);
  });
});

// ─── removeAccountUser session revocation (gap #1676) ────────────────────────

describe("removeAccountUser — revokes live access", () => {
  it("employer removal deactivates UCRA + revokes sessions + refresh tokens", async () => {
    const { db, state } = makeDb({
      users: [
        { ...BOSS },
        { id: "u-emp", name: "Emp", email: "emp@acme.com", role: "employee", isActive: true },
      ],
      user_company_role_associations: [
        { id: "ucra-boss", userId: "u-boss", companyId: "c-acme", role: "employer", isActive: true },
        { id: "ucra-emp", userId: "u-emp", companyId: "c-acme", role: "employee", isActive: true },
      ],
      sessions: [{ id: "s1", userId: "u-emp", revokedAt: null, expiresAt: future() }],
      refresh_tokens: [{ id: "rt1", userId: "u-emp", revoked: false }],
    });

    await removeAccountUser("u-boss", "u-emp", { db });

    assert.equal(state.user_company_role_associations.find((r) => r.id === "ucra-emp")!.isActive, false);
    assert.ok(state.sessions[0]!.revokedAt, "session revoked");
    assert.equal(state.refresh_tokens[0]!.revoked, true);
  });

  it("admin removal deactivates the user + revokes sessions", async () => {
    const { db, state } = makeDb({
      users: [
        { id: "u-admin", name: "Admin", email: "a@x.com", role: "admin", isActive: true },
        { id: "u-emp", name: "Emp", email: "emp@acme.com", role: "employee", isActive: true },
      ],
      sessions: [{ id: "s1", userId: "u-emp", revokedAt: null, expiresAt: future() }],
      refresh_tokens: [{ id: "rt1", userId: "u-emp", revoked: false }],
    });

    await removeAccountUser("u-admin", "u-emp", { db });

    assert.equal(state.users.find((u) => u.id === "u-emp")!.isActive, false);
    assert.ok(state.sessions[0]!.revokedAt, "session revoked");
    assert.equal(state.refresh_tokens[0]!.revoked, true);
  });
});

// ─── Seat soft-cap on employee invites (gap #1678) ───────────────────────────

describe("inviteAccountUser — seat soft-cap", () => {
  const EMPLOYER = { id: "u-boss", name: "Boss", email: "boss@acme.com", role: "employer", isActive: true };

  it("requires owner confirmation for an employee invite past the authorized limit", async () => {
    const { db, state } = makeDb({
      users: [{ ...EMPLOYER }],
      company_profiles: [{ ...COMPANY }],
    });
    const res = await inviteAccountUser(
      { email: "new@acme.com", role: "employee" as any, companyId: "c-acme" },
      "u-boss",
      { db },
    );
    assert.equal(res.success, false);
    assert.equal(res.requiresSeatConfirmation, true);
    assert.equal(res.seatInfo?.committedSeats, 0);
    assert.equal(state.account_invitations.length, 0, "no invite sent without confirmation");
  });

  it("authorizes the seat + sends the invite when confirmPaidSeat is set", async () => {
    const { db, state } = makeDb({
      users: [{ ...EMPLOYER }],
      company_profiles: [{ ...COMPANY }],
    });
    const res = await inviteAccountUser(
      { email: "new@acme.com", role: "employee" as any, companyId: "c-acme", confirmPaidSeat: true },
      "u-boss",
      { db },
    );
    assert.equal(res.success, true);
    assert.equal(state.account_invitations.length, 1);
    const sub = state.company_subscriptions.find((s) => s.companyId === "c-acme");
    assert.ok(sub, "company_subscriptions row created by authorizeSeats");
    assert.equal(sub!.seatLimit, 1);
  });

  it("sends directly when within the already-authorized seat limit", async () => {
    const { db, state } = makeDb({
      users: [{ ...EMPLOYER }],
      company_profiles: [{ ...COMPANY }],
      company_subscriptions: [{ id: "s1", companyId: "c-acme", seatCount: 0, seatLimit: 5 }],
    });
    const res = await inviteAccountUser(
      { email: "new@acme.com", role: "employee" as any, companyId: "c-acme" },
      "u-boss",
      { db },
    );
    assert.equal(res.success, true);
    assert.notEqual(res.requiresSeatConfirmation, true);
    assert.equal(state.account_invitations.length, 1);
  });

  it("does not gate non-employee invites (recruiter)", async () => {
    const { db, state } = makeDb({
      users: [{ ...EMPLOYER }],
      company_profiles: [{ ...COMPANY }],
    });
    const res = await inviteAccountUser(
      { email: "rec@acme.com", role: "recruiter" as any, companyId: "c-acme" },
      "u-boss",
      { db },
    );
    assert.equal(res.success, true);
    assert.notEqual(res.requiresSeatConfirmation, true);
    assert.equal(state.account_invitations.length, 1);
  });
});

// ─── listPendingInvitations scoping (gap #1682) ──────────────────────────────

describe("listPendingInvitations — tenant scoping", () => {
  const seed = () => ({
    account_invitations: [
      pendingInvite({ id: "mine", token: "t-mine", invitedBy: "u-boss", companyId: "c-acme" }),
      pendingInvite({ id: "other", token: "t-other", invitedBy: "u-other", companyId: "c-other", email: "x@y.com" }),
      pendingInvite({ id: "accepted", token: "t-acc", status: "accepted", invitedBy: "u-boss" }),
    ],
    user_company_role_associations: [
      { id: "ucra-boss", userId: "u-boss", companyId: "c-acme", role: "employer", isActive: true },
    ],
  });

  it("an employer sees only their own/company pending invites", async () => {
    const { db } = makeDb({
      users: [{ ...BOSS }],
      ...seed(),
    });
    const list = await listPendingInvitations("u-boss", { db });
    const ids = list.map((r) => r.id).sort();
    assert.deepEqual(ids, ["mine"]);
  });

  it("a platform admin sees every pending invite", async () => {
    const { db } = makeDb({
      users: [{ id: "u-admin", name: "Admin", email: "a@x.com", role: "admin", isActive: true }],
      ...seed(),
    });
    const list = await listPendingInvitations("u-admin", { db });
    const ids = list.map((r) => r.id).sort();
    assert.deepEqual(ids, ["mine", "other"]);
  });
});
