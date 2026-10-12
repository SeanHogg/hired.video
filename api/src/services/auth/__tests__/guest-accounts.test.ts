import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { jwtVerify } from "jose";
import { issueJwt } from "../AuthService.js";
import { guestIdFromToken } from "../guest-accounts.js";
import { buildRetentionDeleteSql, RETENTION_POLICIES } from "../../maintenance/retention-sweep.js";
import { guestEmailFor, isGuestEmail } from "../../../../../shared/guest-accounts.js";

const SECRET = "test-secret-guest-accounts-0123456789";
const GUEST_ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

before(() => {
  process.env.JWT_SECRET = SECRET;
});

const base = { email: guestEmailFor(GUEST_ID), roles: ["job_seeker"], emailVerified: false, mustChangePassword: false };

describe("guest JWTs", () => {
  it("carry the guest claim and a 30-day lifetime", async () => {
    const token = await issueJwt({ ...base, sub: GUEST_ID, guest: true }, SECRET);
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET));
    assert.equal(payload["guest"], true);
    const days = ((payload.exp ?? 0) - (payload.iat ?? 0)) / 86400;
    assert.equal(days, 30);
  });

  it("regular tokens carry no guest claim and keep 7 days", async () => {
    const token = await issueJwt({ ...base, sub: GUEST_ID }, SECRET);
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET));
    assert.equal(payload["guest"], undefined);
    assert.equal(((payload.exp ?? 0) - (payload.iat ?? 0)) / 86400, 7);
  });
});

describe("guestIdFromToken", () => {
  it("returns the guest id for a guest token", async () => {
    const token = await issueJwt({ ...base, sub: GUEST_ID, guest: true }, SECRET);
    assert.equal(await guestIdFromToken(token), GUEST_ID);
  });

  it("rejects a real-account token (no guest claim)", async () => {
    const token = await issueJwt({ ...base, sub: GUEST_ID }, SECRET);
    assert.equal(await guestIdFromToken(token), null);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await issueJwt({ ...base, sub: GUEST_ID, guest: true }, "some-other-secret-value-xyz");
    assert.equal(await guestIdFromToken(token), null);
  });

  it("rejects junk", async () => {
    assert.equal(await guestIdFromToken("not.a.jwt"), null);
  });
});

describe("guest email", () => {
  it("is on the non-deliverable .invalid TLD and detected case-insensitively", () => {
    const email = guestEmailFor(GUEST_ID);
    assert.match(email, /@guest\.invalid$/);
    assert.equal(isGuestEmail(email.toUpperCase()), true);
    assert.equal(isGuestEmail("jane@example.com"), false);
    assert.equal(isGuestEmail(null), false);
  });
});

describe("stale-guest retention policy", () => {
  it("only ever deletes guest users", () => {
    const policy = RETENTION_POLICIES.find((p) => p.table === "users");
    assert.ok(policy, "users policy missing");
    const q = buildRetentionDeleteSql(policy);
    assert.match(q, /\(created_at < NOW\(\) - INTERVAL '30 days'\) AND \(is_guest\)/);
  });

  it("leaves unscoped policies unchanged", () => {
    const q = buildRetentionDeleteSql({ table: "tool_runs", ageColumns: ["created_at"], retentionDays: 90, batchSize: 10 });
    assert.match(q, /WHERE created_at < NOW\(\) - INTERVAL '90 days'\s/);
    assert.doesNotMatch(q, /AND/);
  });
});

describe("tool-run retention policy", () => {
  it("never ages out a run tied to a studio session (it lives as long as the session)", () => {
    const policy = RETENTION_POLICIES.find((p) => p.table === "tool_runs");
    assert.ok(policy, "tool_runs policy missing");
    const q = buildRetentionDeleteSql(policy);
    assert.match(q, /\(created_at < NOW\(\) - INTERVAL '90 days'\) AND \(studio_project_id IS NULL\)/);
  });
});
