/**
 * Persona switch (hiring side restored 2026-10-16).
 *
 * `HIRING_PERSONAS_ENABLED` in user-roles.ts is the ONE switch that governs
 * the recruiter / employer side. These tests pin:
 *   • the live posture (switch ON → hiring signup, pipeline nav, Post-Job CTA
 *     and the hiring audiences are all available), and
 *   • both switch positions via the injectable pure helpers, so flipping the
 *     constant off again disables the hiring side verbatim.
 *   • staff / invite-only roles are NEVER public, in either position.
 *
 * Run: node --import tsx --test shared/__tests__/hiring-persona-switch.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HIRING_PERSONAS_ENABLED,
  HIRING_ROLES,
  PUBLIC_SIGNUP_ROLES,
  SIGNUP_PICKER_ROLES,
  USER_ROLES,
  isHiringRole,
  isPersonaEnabled,
  isPublicSignupRole,
  publicSignupRolesFor,
  resolveSignupPickerRole,
} from "../user-roles.js";
import {
  ALL_ROLES,
  MOBILE_PRIMARY_CTA,
  buildMobilePrimaryCta,
} from "../feature-registry.js";
import { STUDIO_NEW_JOB_PATH } from "../studio-paths.js";
import {
  findSurface,
  navSurfaces,
  resolveRoleAccess,
  type RoleFeatureAccessRow,
} from "../role-access.js";
import {
  LIFE_STAGE_AUDIENCE_REGISTRY,
  enabledLifeStageAudiences,
  lifeStageAudienceMeta,
} from "../audiences-registry.js";

const NEVER_PUBLIC = ["admin", "super_admin", "employee"] as const;

describe("persona switch — live posture", () => {
  it("hiring personas are switched on", () => {
    assert.equal(HIRING_PERSONAS_ENABLED, true);
  });

  it("HIRING_ROLES is exactly recruiter + employer", () => {
    assert.deepEqual([...HIRING_ROLES].sort(), ["employer", "recruiter"]);
  });

  it("public signup = all five self-serve personas", () => {
    assert.deepEqual(
      [...PUBLIC_SIGNUP_ROLES],
      ["job_seeker", "recruiter", "employer", "creator", "affiliate"],
    );
  });

  it("recruiter / employer can sign up publicly", () => {
    assert.equal(isPublicSignupRole("recruiter"), true);
    assert.equal(isPublicSignupRole("employer"), true);
  });

  it("the signup picker offers job_seeker, recruiter and employer", () => {
    assert.deepEqual([...SIGNUP_PICKER_ROLES], ["job_seeker", "recruiter", "employer"]);
  });

  it("?role=recruiter|employer preselects that persona; junk falls back to job_seeker", () => {
    assert.equal(resolveSignupPickerRole("recruiter"), "recruiter");
    assert.equal(resolveSignupPickerRole("employer"), "employer");
    assert.equal(resolveSignupPickerRole("creator"), "job_seeker");
    assert.equal(resolveSignupPickerRole("admin"), "job_seeker");
    assert.equal(resolveSignupPickerRole(null), "job_seeker");
  });
});

describe("staff / invite-only roles are never public", () => {
  for (const hiringEnabled of [true, false]) {
    it(`excludes admin / super_admin / employee (hiringEnabled=${hiringEnabled})`, () => {
      const roles = publicSignupRolesFor(hiringEnabled) as readonly string[];
      for (const r of NEVER_PUBLIC) assert.equal(roles.includes(r), false, r);
    });
  }

  it("isPublicSignupRole rejects staff roles, case variants, junk and empty input", () => {
    for (const r of [...NEVER_PUBLIC, "Admin", "SUPER_ADMIN", "JobSeeker", "Recruiter", "root", "", null, undefined]) {
      assert.equal(isPublicSignupRole(r), false, String(r));
    }
  });

  it("isPublicSignupRole accepts every public persona", () => {
    for (const r of ["job_seeker", "recruiter", "employer", "creator", "affiliate"]) {
      assert.equal(isPublicSignupRole(r), true, r);
    }
  });
});

describe("isHiringRole / isPersonaEnabled", () => {
  it("classifies hiring roles", () => {
    assert.equal(isHiringRole("recruiter"), true);
    assert.equal(isHiringRole("employer"), true);
    for (const r of ["job_seeker", "creator", "affiliate", "employee", "admin", "super_admin", "", null, undefined]) {
      assert.equal(isHiringRole(r), false, String(r));
    }
  });

  it("live switch enables every persona", () => {
    for (const r of ALL_ROLES) assert.equal(isPersonaEnabled(r), true, r);
  });

  it("switch off disables only hiring personas", () => {
    for (const r of ALL_ROLES) {
      assert.equal(isPersonaEnabled(r, false), !isHiringRole(r), r);
    }
  });

  it("empty role is never enabled", () => {
    assert.equal(isPersonaEnabled(null), false);
    assert.equal(isPersonaEnabled(""), false);
  });

  it("switch off narrows public signup to job_seeker, creator, affiliate", () => {
    assert.deepEqual([...publicSignupRolesFor(false)], ["job_seeker", "creator", "affiliate"]);
  });
});

describe("nav:pipeline follows the switch (resolver, not components)", () => {
  it("is visible for recruiter / employer / staff and hidden for job seekers (live)", () => {
    for (const role of [USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]) {
      const s = findSurface(resolveRoleAccess(role, []), "nav:pipeline");
      assert.ok(s, `nav:pipeline missing for ${role}`);
      assert.equal(s!.visible, true, role);
    }
    const js = findSurface(resolveRoleAccess(USER_ROLES.JOB_SEEKER, []), "nav:pipeline");
    assert.equal(js!.visible, false);
  });

  it("a DB visible=false override still hides it for a hiring role", () => {
    const rows: RoleFeatureAccessRow[] = [
      { role: "recruiter", featureKey: "nav:pipeline", visible: false, enabled: false, rank: null },
    ];
    const s = findSurface(resolveRoleAccess(USER_ROLES.RECRUITER, rows), "nav:pipeline");
    assert.equal(s!.visible, false);
  });

  it("switch off hides + disables it for every role, overrides included", () => {
    const rows: RoleFeatureAccessRow[] = [
      { role: "recruiter", featureKey: "nav:pipeline", visible: true, enabled: true, rank: null },
    ];
    for (const role of ALL_ROLES) {
      const s = findSurface(
        resolveRoleAccess(role, rows, undefined, { hiringPersonasEnabled: false }),
        "nav:pipeline",
      );
      assert.ok(s, `nav:pipeline missing for ${role}`);
      assert.equal(s!.visible, false, role);
      assert.equal(s!.enabled, false, role);
    }
  });

  it("recruiter / employer nav includes the pipeline; job-seeker nav does not", () => {
    const seekerNav = navSurfaces(resolveRoleAccess(USER_ROLES.JOB_SEEKER, [])).map((s) => s.key);
    assert.equal(seekerNav.includes("nav:pipeline"), false);
    for (const role of HIRING_ROLES) {
      const nav = navSurfaces(resolveRoleAccess(role, [])).map((s) => s.key);
      assert.ok(nav.includes("nav:pipeline"), role);
    }
  });

  it("switch off collapses recruiter / employer to the job-seeker nav", () => {
    const off = { hiringPersonasEnabled: false };
    const seekerNav = navSurfaces(resolveRoleAccess(USER_ROLES.JOB_SEEKER, [], undefined, off)).map((s) => s.key);
    for (const role of HIRING_ROLES) {
      const nav = navSurfaces(resolveRoleAccess(role, [], undefined, off)).map((s) => s.key);
      assert.deepEqual(nav, seekerNav, role);
    }
  });
});

describe("mobile primary CTA", () => {
  it("live map has Post Job for recruiter + employer; admin CTA kept", () => {
    assert.equal(MOBILE_PRIMARY_CTA.recruiter?.href, STUDIO_NEW_JOB_PATH);
    assert.equal(MOBILE_PRIMARY_CTA.employer?.href, STUDIO_NEW_JOB_PATH);
    assert.equal(MOBILE_PRIMARY_CTA.admin?.href, "/admin/dashboard");
    assert.equal(MOBILE_PRIMARY_CTA.super_admin?.href, "/admin/dashboard");
    assert.equal(MOBILE_PRIMARY_CTA.job_seeker, undefined);
  });

  it("switch off drops Post Job for recruiter + employer", () => {
    const off = buildMobilePrimaryCta(false);
    assert.equal(off.recruiter, undefined);
    assert.equal(off.employer, undefined);
    assert.equal(off.admin?.href, "/admin/dashboard");
  });
});

describe("life-stage audiences follow the switch", () => {
  it("live registry includes employers + recruiters, order preserved", () => {
    const keys = LIFE_STAGE_AUDIENCE_REGISTRY.map((a) => a.key) as string[];
    assert.deepEqual(keys.slice(0, 3), ["job_seekers", "employers", "recruiters"]);
    assert.ok(keys.includes("senior_executives"));
  });

  it("hiring audience lookups resolve to their hiring role", () => {
    assert.equal(lifeStageAudienceMeta("employers")?.primaryRole, "employer");
    assert.equal(lifeStageAudienceMeta("recruiters")?.primaryRole, "recruiter");
    assert.equal(lifeStageAudienceMeta("job_seekers")?.primaryRole, "job_seeker");
  });

  it("switch off drops exactly the two hiring audiences", () => {
    const off = enabledLifeStageAudiences(false);
    const keys = off.map((a) => a.key) as string[];
    assert.equal(keys.includes("employers"), false);
    assert.equal(keys.includes("recruiters"), false);
    assert.equal(off.length, LIFE_STAGE_AUDIENCE_REGISTRY.length - 2);
    for (const a of off) assert.equal(isHiringRole(a.primaryRole), false, a.key);
  });
});
