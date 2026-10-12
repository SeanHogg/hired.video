/**
 * RoleAccessService tests (gap #2041) — the cached read + write-invalidation
 * and the per-role feature gate (#2039).
 *
 * Uses an in-memory fake repository (no Postgres). The edge-cache falls back to
 * its L1 Map when no KV binding is present, so caching is exercised for real;
 * each test uses a distinct role to avoid cross-test L1 contamination.
 *
 * Run: node --import tsx --test src/services/admin/__tests__/role-access-service.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { RoleAccessService } from "../RoleAccessService.js";
import type {
  IRoleFeatureAccessRepository,
  RoleFeatureAccessRow as DbRow,
  UpsertRoleFeatureAccessInput,
} from "../../../repositories/roleFeatureAccessRepository.js";
import { USER_ROLES } from "../../../../../shared/user-roles.js";

class FakeRepo implements IRoleFeatureAccessRepository {
  rows: DbRow[] = [];
  listByRoleCalls = 0;

  async listAll(): Promise<DbRow[]> {
    return this.rows;
  }
  async listByRole(role: string): Promise<DbRow[]> {
    this.listByRoleCalls++;
    return this.rows.filter((r) => r.role === role);
  }
  async upsert(input: UpsertRoleFeatureAccessInput): Promise<DbRow> {
    const existing = this.rows.find(
      (r) => r.role === input.role && r.featureKey === input.featureKey,
    );
    const row: DbRow = {
      id: `${input.role}:${input.featureKey}`,
      role: input.role,
      featureKey: input.featureKey,
      visible: input.visible ?? null,
      enabled: input.enabled ?? null,
      rank: input.rank ?? null,
      updatedBy: input.updatedBy ?? null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as DbRow;
    if (existing) Object.assign(existing, row);
    else this.rows.push(row);
    return row;
  }
  async remove(role: string, featureKey: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter(
      (r) => !(r.role === role && r.featureKey === featureKey),
    );
    return this.rows.length < before;
  }
  async removeByRole(role: string): Promise<number> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.role !== role);
    return before - this.rows.length;
  }
}

describe("RoleAccessService — cache + write invalidation", () => {
  it("caches a role's overrides and invalidates on upsert", async () => {
    const repo = new FakeRepo();
    const svc = new RoleAccessService(repo);
    const role = USER_ROLES.EMPLOYER;

    await svc.getOverridesForRole(role);
    await svc.getOverridesForRole(role);
    assert.equal(repo.listByRoleCalls, 1, "second read should hit the cache");

    await svc.upsert({ role, featureKey: "nav:jobs", visible: false });

    const after = await svc.getOverridesForRole(role);
    assert.equal(repo.listByRoleCalls, 2, "upsert should invalidate the cache");
    assert.equal(after.length, 1);
    assert.equal(after[0].featureKey, "nav:jobs");
    assert.equal(after[0].visible, false);
  });

  it("resetRole clears the role's deltas and invalidates", async () => {
    const repo = new FakeRepo();
    const svc = new RoleAccessService(repo);
    const role = USER_ROLES.CREATOR;

    await svc.upsert({ role, featureKey: "nav:studio", visible: false });
    await svc.upsert({ role, featureKey: "nav:services", visible: false });
    assert.equal((await svc.getOverridesForRole(role)).length, 2);

    const removed = await svc.resetRole(role);
    assert.equal(removed, 2);
    assert.equal((await svc.getOverridesForRole(role)).length, 0);
  });
});

describe("RoleAccessService — isFeatureEnabledForRole (#2039 gate)", () => {
  it("respects an explicit per-role disable override", async () => {
    const repo = new FakeRepo();
    const svc = new RoleAccessService(repo);
    await svc.upsert({ role: USER_ROLES.RECRUITER, featureKey: "module:ads", enabled: false });
    assert.equal(await svc.isFeatureEnabledForRole(USER_ROLES.RECRUITER, "module:ads"), false);
  });

  it("falls back to the registry default (enabled) with no override", async () => {
    const svc = new RoleAccessService(new FakeRepo());
    assert.equal(await svc.isFeatureEnabledForRole(USER_ROLES.JOB_SEEKER, "module:ai"), true);
  });

  it("treats an unknown key as enabled (the global module gate handles it)", async () => {
    const svc = new RoleAccessService(new FakeRepo());
    assert.equal(
      await svc.isFeatureEnabledForRole(USER_ROLES.JOB_SEEKER, "module:does-not-exist"),
      true,
    );
  });

  it("bypasses for an unmanageable role string", async () => {
    const svc = new RoleAccessService(new FakeRepo());
    assert.equal(await svc.isFeatureEnabledForRole("not_a_role", "module:ads"), true);
  });

  it("rejects an upsert for an unknown feature key", async () => {
    const svc = new RoleAccessService(new FakeRepo());
    await assert.rejects(
      () => svc.upsert({ role: USER_ROLES.RECRUITER, featureKey: "bogus:thing", visible: false }),
      /Unknown feature key/,
    );
  });

  it("accepts a dynamic tool: override key", async () => {
    const repo = new FakeRepo();
    const svc = new RoleAccessService(repo);
    await svc.upsert({ role: USER_ROLES.AFFILIATE, featureKey: "tool:resume-optimizer", visible: false });
    assert.equal(repo.rows.length, 1);
  });
});

describe("RoleAccessService — per-user module grant (#2042)", () => {
  // Minimal authz stub: only the method the per-user gate calls.
  const authz = {
    findActiveAssignmentsForUser: async (userId: string) =>
      userId === "u-grant" ? [{ slug: "ads" } as any] : [],
  } as any;

  it("a per-user module grant overrides a role-level disable", async () => {
    const repo = new FakeRepo();
    const svc = new RoleAccessService(repo, authz);
    await svc.upsert({ role: USER_ROLES.RECRUITER, featureKey: "module:ads", enabled: false });

    // Role-level: disabled.
    assert.equal(await svc.isFeatureEnabledForRole(USER_ROLES.RECRUITER, "module:ads"), false);
    // User with an explicit assignment: enabled despite the role disable.
    assert.equal(await svc.isFeatureEnabledForUser("u-grant", USER_ROLES.RECRUITER, "module:ads"), true);
    // User without a grant: falls through to the role gate (disabled).
    assert.equal(await svc.isFeatureEnabledForUser("u-none", USER_ROLES.RECRUITER, "module:ads"), false);
  });
});
