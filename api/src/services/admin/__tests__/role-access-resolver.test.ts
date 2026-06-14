/**
 * Role-access resolver tests (gap #2037 / #2041).
 *
 * The headline guarantee: deleting the hardcoded Sidebar `hideForRoles`
 * deny-list (#1995) must NOT change any role's menu. So we assert that
 * `resolveRoleAccess(role, [])` (registry defaults, empty override table)
 * reproduces the EXACT pre-#2037 visibility for every role — a snapshot of the
 * old Sidebar behaviour. Then we cover the override merge + reset semantics.
 *
 * Run: node --import tsx --test src/services/admin/__tests__/role-access-resolver.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolveRoleAccess,
  navSurfaces,
  findSurface,
  type RoleFeatureAccessRow,
} from "../../../../../shared/role-access.js";
import { ALL_ROLES } from "../../../../../shared/feature-registry.js";
import { USER_ROLES, type UserRole } from "../../../../../shared/user-roles.js";

/**
 * The pre-#2037 Sidebar deny-list, transcribed verbatim from
 * components/Sidebar.tsx as it was before the rewire. This is the oracle: the
 * resolver's default visibility must match it for every role.
 */
const LEGACY_NAV: { key: string; hideForRoles: UserRole[] }[] = [
  { key: "nav:dashboard", hideForRoles: [] },
  { key: "nav:studio", hideForRoles: [USER_ROLES.AFFILIATE] },
  { key: "nav:tools", hideForRoles: [] },
  { key: "nav:resumes", hideForRoles: [USER_ROLES.AFFILIATE] },
  { key: "nav:jobs", hideForRoles: [] },
  { key: "nav:companies", hideForRoles: [USER_ROLES.AFFILIATE] },
  { key: "nav:people", hideForRoles: [] },
  { key: "nav:tasks", hideForRoles: [] },
  { key: "nav:outreach", hideForRoles: [USER_ROLES.AFFILIATE, USER_ROLES.CREATOR] },
  { key: "nav:marketplace", hideForRoles: [] },
  { key: "nav:gigs", hideForRoles: [USER_ROLES.AFFILIATE] },
  { key: "nav:services", hideForRoles: [] },
];

describe("resolveRoleAccess — zero regression vs legacy hideForRoles", () => {
  for (const role of ALL_ROLES) {
    it(`reproduces the legacy menu for ${role}`, () => {
      const manifest = resolveRoleAccess(role, []);
      for (const legacy of LEGACY_NAV) {
        const surface = findSurface(manifest, legacy.key);
        assert.ok(surface, `${legacy.key} missing from manifest`);
        const expectedVisible = !legacy.hideForRoles.includes(role);
        assert.equal(
          surface!.visible,
          expectedVisible,
          `${legacy.key} visibility for ${role}: expected ${expectedVisible}`,
        );
      }
    });
  }

  it("keeps nav order stable (registry order) with no overrides", () => {
    const nav = navSurfaces(resolveRoleAccess(USER_ROLES.JOB_SEEKER, []));
    assert.deepEqual(
      nav.map((s) => s.key),
      LEGACY_NAV.map((l) => l.key),
    );
  });
});

describe("resolveRoleAccess — override merge", () => {
  it("a visible=false override hides a surface and flags it overridden", () => {
    const overrides: RoleFeatureAccessRow[] = [
      { role: USER_ROLES.RECRUITER, featureKey: "nav:resumes", visible: false, enabled: null, rank: null },
    ];
    const manifest = resolveRoleAccess(USER_ROLES.RECRUITER, overrides);
    const s = findSurface(manifest, "nav:resumes")!;
    assert.equal(s.visible, false);
    assert.equal(s.overridden, true);
  });

  it("a visible=true override re-shows a surface the registry default hides", () => {
    // affiliate hides studio by default; an explicit override brings it back.
    const overrides: RoleFeatureAccessRow[] = [
      { role: USER_ROLES.AFFILIATE, featureKey: "nav:studio", visible: true, enabled: null, rank: null },
    ];
    const manifest = resolveRoleAccess(USER_ROLES.AFFILIATE, overrides);
    const s = findSurface(manifest, "nav:studio")!;
    assert.equal(s.visible, true);
    assert.equal(s.overridden, true);
  });

  it("an override equal to the default is NOT flagged overridden", () => {
    // dashboard is visible to everyone by default; redundant visible=true.
    const overrides: RoleFeatureAccessRow[] = [
      { role: USER_ROLES.JOB_SEEKER, featureKey: "nav:dashboard", visible: true, enabled: null, rank: null },
    ];
    const s = findSurface(resolveRoleAccess(USER_ROLES.JOB_SEEKER, overrides), "nav:dashboard")!;
    assert.equal(s.overridden, false);
  });

  it("a rank override reorders nav for that role only", () => {
    const overrides: RoleFeatureAccessRow[] = [
      { role: USER_ROLES.EMPLOYER, featureKey: "nav:jobs", visible: null, enabled: null, rank: -1 },
    ];
    const nav = navSurfaces(resolveRoleAccess(USER_ROLES.EMPLOYER, overrides));
    assert.equal(nav[0].key, "nav:jobs", "jobs should sort first with rank -1");
  });

  it("overrides for a different role are ignored", () => {
    const overrides: RoleFeatureAccessRow[] = [
      { role: USER_ROLES.AFFILIATE, featureKey: "nav:jobs", visible: false, enabled: null, rank: null },
    ];
    // Resolving for recruiter must ignore the affiliate row.
    const s = findSurface(resolveRoleAccess(USER_ROLES.RECRUITER, overrides), "nav:jobs")!;
    assert.equal(s.visible, true);
  });
});
