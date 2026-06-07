/**
 * isSuperAdmin predicate unit tests.
 *
 * Regression guard for the analytics-stats 403 bug: the JWT payload
 * (parseJwtPayload in middleware/auth.ts) carries `roles: string[]` +
 * `isSuperAdmin: boolean` and has NO singular `role` field. A previous
 * inline check in routes/analytics.ts read `user.role === "super_admin"`
 * — always undefined → false → genuine super-admins 403'd on
 * GET /api/analytics/artifacts/:kind/:id. Every super-admin gate must
 * go through this canonical predicate, which reads the fields that
 * actually exist on the payload.
 *
 * Run: node --test middleware/__tests__/superAdmin.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { isSuperAdmin } from "../superAdmin.js";
import { USER_ROLES } from "../../../../shared/user-roles.js";
import type { JwtPayload } from "../../types/index.js";

function payload(overrides: Partial<JwtPayload>): JwtPayload {
  return {
    sub: "user-1",
    email: "u@example.com",
    roles: [],
    emailVerified: true,
    mustChangePassword: false,
    isSuperAdmin: false,
    emu: false,
    emuReadonly: false,
    ...overrides,
  } as JwtPayload;
}

describe("isSuperAdmin", () => {
  it("recognises the boolean isSuperAdmin claim even with no role/roles", () => {
    // The exact shape that 403'd: isSuperAdmin true, empty roles, and
    // crucially NO `role` field at all.
    assert.equal(isSuperAdmin(payload({ isSuperAdmin: true })), true);
  });

  it("recognises super_admin via the roles[] array", () => {
    assert.equal(
      isSuperAdmin(payload({ isSuperAdmin: false, roles: [USER_ROLES.SUPER_ADMIN] })),
      true,
    );
  });

  it("rejects a plain admin (admin role is intentionally not super-admin)", () => {
    assert.equal(
      isSuperAdmin(payload({ roles: [USER_ROLES.ADMIN] })),
      false,
    );
  });

  it("rejects an ordinary user", () => {
    assert.equal(isSuperAdmin(payload({ roles: [USER_ROLES.JOB_SEEKER] })), false);
  });

  it("does NOT honour a stray singular `role` field (the field doesn't exist on the payload)", () => {
    // Belt-and-braces: even if some caller smuggles a `role` string in,
    // the predicate ignores it — only the real claims grant access.
    assert.equal(
      isSuperAdmin(payload({ role: "super_admin" } as Partial<JwtPayload>)),
      false,
    );
  });

  it("returns false for null/undefined", () => {
    assert.equal(isSuperAdmin(null), false);
    assert.equal(isSuperAdmin(undefined), false);
  });
});
