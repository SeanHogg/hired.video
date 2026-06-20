/**
 * Tests for the Zod schemas in `superadmin/users.ts` — PRIORITY slice of the
 * schema-test backfill (#1528). Validators mirrored verbatim (route-local
 * consts). `userIds` / `moduleId` are DB-row UUIDs (seed-derived case
 * exercised).
 *
 * Run: node --import tsx --test src/routes/__tests__/superadmin-users-schemas.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { UuidLikeSchema, UUID_LIKE_REGEX } from "../../../../shared/validation.js";
import { SEED_DERIVED_UUID, V4_UUID } from "../../../../shared/__tests__/uuid-fixtures.js";

const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
const UserSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  role: z.string().optional(),
  status: z.enum(["active", "suspended", "banned"]).optional(),
  editorial: z.coerce.boolean().optional(),
});
const BulkUserActionSchema = z.object({ userIds: z.array(UuidLikeSchema).min(1).max(100) });
const AssignRoleSchema = z.object({ role: z.string().min(1, "role is required") });
const SetStatusSchema = z.object({
  status: z.enum(["active", "suspended"], { error: "status must be 'active' or 'suspended'" }),
});
const SetSystemSchema = z.object({ isSystem: z.boolean({ error: "isSystem must be a boolean" }) });
const AssignModuleSchema = z.object({
  moduleId: z.string().regex(UUID_LIKE_REGEX, "moduleId must be a valid UUID"),
});
const GrantTokensSchema = z.object({
  tokens: z.coerce.number().int().min(1, "tokens must be ≥ 1").max(1_000_000_000),
  reason: z.string().max(500).optional(),
});

describe("HistoryQuerySchema / UserSearchSchema", () => {
  it("default + coerce + clamp", () => {
    assert.equal(HistoryQuerySchema.parse({}).limit, 100);
    assert.equal(HistoryQuerySchema.safeParse({ limit: 501 }).success, false);
    const s = UserSearchSchema.parse({ page: "2" });
    assert.equal(s.page, 2);
    assert.equal(s.limit, 50);
  });
  it("rejects an unknown status enum", () => {
    assert.equal(UserSearchSchema.safeParse({ status: "deleted" }).success, false);
    assert.ok(UserSearchSchema.safeParse({ status: "banned" }).success);
  });
});

describe("BulkUserActionSchema", () => {
  it("accepts 1..100 uuids incl. seed-derived (#1522); rejects empty/over-cap/non-uuid", () => {
    assert.ok(BulkUserActionSchema.safeParse({ userIds: [SEED_DERIVED_UUID] }).success);
    assert.equal(BulkUserActionSchema.safeParse({ userIds: [] }).success, false);
    assert.equal(BulkUserActionSchema.safeParse({ userIds: Array(101).fill(V4_UUID) }).success, false);
    assert.equal(BulkUserActionSchema.safeParse({ userIds: ["x"] }).success, false);
  });
});

describe("AssignRoleSchema / SetStatusSchema / SetSystemSchema", () => {
  it("role must be non-empty", () => {
    assert.ok(AssignRoleSchema.safeParse({ role: "employer" }).success);
    assert.equal(AssignRoleSchema.safeParse({ role: "" }).success, false);
  });
  it("status enum is active|suspended only", () => {
    assert.ok(SetStatusSchema.safeParse({ status: "suspended" }).success);
    assert.equal(SetStatusSchema.safeParse({ status: "banned" }).success, false);
  });
  it("isSystem must be a boolean", () => {
    assert.ok(SetSystemSchema.safeParse({ isSystem: true }).success);
    assert.equal(SetSystemSchema.safeParse({ isSystem: "yes" }).success, false);
  });
});

describe("AssignModuleSchema / GrantTokensSchema", () => {
  it("moduleId must be a uuid", () => {
    assert.ok(AssignModuleSchema.safeParse({ moduleId: V4_UUID }).success);
    assert.equal(AssignModuleSchema.safeParse({ moduleId: "nope" }).success, false);
  });
  it("tokens coerces, is ≥1, and capped; reason optional ≤500", () => {
    assert.equal(GrantTokensSchema.parse({ tokens: "100" }).tokens, 100);
    assert.equal(GrantTokensSchema.safeParse({ tokens: 0 }).success, false);
    assert.equal(GrantTokensSchema.safeParse({ tokens: 2_000_000_000 }).success, false);
    assert.equal(GrantTokensSchema.safeParse({ tokens: 5, reason: "x".repeat(501) }).success, false);
  });
});
