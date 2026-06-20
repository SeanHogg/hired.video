/**
 * Tests for the Zod schemas in `superadmin/sessions.ts` — PRIORITY slice of the
 * schema-test backfill (#1528). Validators mirrored verbatim (route-local
 * consts). `targetUserId` is a DB-row UUID (seed-derived case exercised).
 *
 * Run: node --import tsx --test src/routes/__tests__/superadmin-sessions-schemas.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { UUID_LIKE_REGEX } from "../../../../shared/validation.js";
import { SEED_DERIVED_UUID, V4_UUID } from "../../../../shared/__tests__/uuid-fixtures.js";

const StartSchema = z.object({
  targetUserId: z.string().regex(UUID_LIKE_REGEX, "targetUserId must be a valid UUID"),
  reason: z.string().min(1, "reason is required and must be non-empty").max(500),
  enableDebugger: z.boolean().optional().default(false),
});
const SwitchRoleSchema = z.object({ role: z.string().min(1, "role is required") });
const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

describe("StartSchema (impersonation start)", () => {
  it("accepts a valid target + reason, defaulting enableDebugger=false", () => {
    const out = StartSchema.parse({ targetUserId: V4_UUID, reason: "support ticket #42" });
    assert.equal(out.enableDebugger, false);
  });
  it("accepts a seed-derived target UUID (#1522)", () => {
    assert.ok(StartSchema.safeParse({ targetUserId: SEED_DERIVED_UUID, reason: "x" }).success);
  });
  it("rejects a non-uuid target, an empty reason, and an over-long reason", () => {
    assert.equal(StartSchema.safeParse({ targetUserId: "nope", reason: "x" }).success, false);
    assert.equal(StartSchema.safeParse({ targetUserId: V4_UUID, reason: "" }).success, false);
    assert.equal(StartSchema.safeParse({ targetUserId: V4_UUID, reason: "x".repeat(501) }).success, false);
  });
});

describe("SwitchRoleSchema", () => {
  it("requires a non-empty role", () => {
    assert.ok(SwitchRoleSchema.safeParse({ role: "recruiter" }).success);
    assert.equal(SwitchRoleSchema.safeParse({ role: "" }).success, false);
    assert.equal(SwitchRoleSchema.safeParse({}).success, false);
  });
});

describe("PaginationSchema", () => {
  it("defaults page=1, limit=50 and coerces strings", () => {
    assert.deepEqual(PaginationSchema.parse({}), { page: 1, limit: 50 });
    assert.equal(PaginationSchema.parse({ page: "3", limit: "25" }).page, 3);
  });
  it("clamps the ranges", () => {
    assert.equal(PaginationSchema.safeParse({ page: 0 }).success, false);
    assert.equal(PaginationSchema.safeParse({ limit: 101 }).success, false);
  });
});
