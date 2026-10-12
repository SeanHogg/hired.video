/**
 * Persona switch (job-seeker-only product, 2026-10-03).
 *
 * `HIRING_PERSONAS_ENABLED` in user-roles.ts is the ONE switch that turns the
 * recruiter / employer side off. These tests pin:
 *   • the live posture (switch off → no hiring signup, no pipeline nav, no
 *     Post-Job CTA, no hiring audiences), and
 *   • both switch positions via the injectable pure helpers, so flipping the
 *     constant back restores the hiring side verbatim.
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
  it("hiring personas are switched off", () => {
    assert.equal(HIRING_PERSONAS_ENABLED, false);
  });

  it("HIRING_ROLES is exactly recruiter + employer", () => {
    assert.deepEqual([...HIRING_ROLES].sort(), ["employer", "recruiter"]);
  });

  it("public signup = job_seeker, creator, affiliate", () => {
    assert.deepEqual([...PUBLIC_SIGNUP_ROLES], ["job_seeker", "creator", "affiliate"]);
  });

  it("recruiter / employer are rejected at public signup", () => {
    assert.equal(isPublicSignupRole("recruiter"), false);
    assert.equal(isPublicSignupRole("employer"), false);
  });

  it("the signup picker collapses to job_seeker only (so no picker renders)", () => {
    assert.deepEqual([...SIGNUP_PICKER_ROLES], ["job_seeker"]);
  });

  it("?role=recruiter|employer falls back to job_seeker", () => {
    assert.equal(resolveSignupPickerRole("recruiter"), "job_seeker");
    assert.equal(resolveSignupPickerRole("employer"), "job_seeker");
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
    for (const r of [...NEVER_PUBLIC, "Admin", "SUPER_ADMIN", "JobSeeker", "root", "", null, undefined]) {
      assert.equal(isPublicSignupRole(r), false, String(r));
    }
  });

  it("isPublicSignupRole accepts the retained public personas", () => {
    for (const r of ["job_seeker", "creator", "affiliate"]) {
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

  it("switch off disables only hiring personas", () => {
    for (const r of ALL_ROLES) {
      assert.equal(isPersonaEnabled(r, false), !isHiringRole(r), r);
    }
  });

  it("switch on enables every persona", () => {
    for (const r of ALL_ROLES) assert.equal(isPersonaEnabled(r, true), true, r);
  });

  it("empty role is never enabled", () => {
    assert.equal(isPersonaEnabled(null), false);
    assert.equal(isPersonaEnabled(""), false);
  });

  it("switch on restores the original five-persona public set", () => {
    assert.deepEqual(
      [...publicSignupRolesFor(true)],
      ["job_seeker", "recruiter", "employer", "creator", "affiliate"],
    );
  });
});

describe("nav:pipeline follows the switch (resolver, not components)", () => {
  it("is hidden + disabled for every role while hiring is off", () => {
    for (const role of ALL_ROLES) {
      const s = findSurface(resolveRoleAccess(role, []), "nav:pipeline");
      assert.ok(s, `nav:pipeline missing for ${role}`);
      assert.equal(s!.visible, false, role);
      assert.equal(s!.enabled, false, role);
    }
  });

  it("a DB visible=true override cannot resurrect it while hiring is off", () => {
    const rows: RoleFeatureAccessRow[] = [
      { role: "recruiter", featureKey: "nav:pipeline", visible: true, enabled: true, rank: null },
    ];
    const s = findSurface(resolveRoleAccess(USER_ROLES.RECRUITER, rows), "nav:pipeline");
    assert.equal(s!.visible, false);
  });

  it("returns for recruiter / employer / staff when the switch is on", () => {
    for (const role of [USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]) {
      const s = findSurface(
        resolveRoleAccess(role, [], undefined, { hiringPersonasEnabled: true }),
        "nav:pipeline",
      );
      assert.equal(s!.visible, true, role);
    }
    const js = findSurface(
      resolveRoleAccess(USER_ROLES.JOB_SEEKER, [], undefined, { hiringPersonasEnabled: true }),
      "nav:pipeline",
    );
    assert.equal(js!.visible, false);
  });

  it("existing recruiter / employer accounts resolve the job-seeker nav", () => {
    const seekerNav = navSurfaces(resolveRoleAccess(USER_ROLES.JOB_SEEKER, [])).map((s) => s.key);
    for (const role of HIRING_ROLES) {
      const nav = navSurfaces(resolveRoleAccess(role, [])).map((s) => s.key);
      assert.deepEqual(nav, seekerNav, role);
    }
  });
});

describe("mobile primary CTA", () => {
  it("live map has no Post Job CTA for hiring roles; admin CTA kept", () => {
    assert.equal(MOBILE_PRIMARY_CTA.recruiter, undefined);
    assert.equal(MOBILE_PRIMARY_CTA.employer, undefined);
    assert.equal(MOBILE_PRIMARY_CTA.admin?.href, "/admin/dashboard");
    assert.equal(MOBILE_PRIMARY_CTA.super_admin?.href, "/admin/dashboard");
    assert.equal(MOBILE_PRIMARY_CTA.job_seeker, undefined);
  });

  it("switch on restores Post Job for recruiter + employer", () => {
    const on = buildMobilePrimaryCta(true);
    assert.equal(on.recruiter?.href, STUDIO_NEW_JOB_PATH);
    assert.equal(on.employer?.href, STUDIO_NEW_JOB_PATH);
  });
});

describe("life-stage audiences follow the switch", () => {
  it("live registry drops employers + recruiters", () => {
    const keys = LIFE_STAGE_AUDIENCE_REGISTRY.map((a) => a.key) as string[];
    assert.equal(keys.includes("employers"), false);
    assert.equal(keys.includes("recruiters"), false);
    assert.ok(keys.includes("job_seekers"));
    assert.ok(keys.includes("senior_executives"));
    for (const a of LIFE_STAGE_AUDIENCE_REGISTRY) {
      assert.equal(isHiringRole(a.primaryRole), false, a.key);
    }
  });

  it("hiring audience lookups resolve null (landing page redirects to /for)", () => {
    assert.equal(lifeStageAudienceMeta("employers"), null);
    assert.equal(lifeStageAudienceMeta("recruiters"), null);
    assert.equal(lifeStageAudienceMeta("job_seekers")?.primaryRole, "job_seeker");
  });

  it("switch on restores them, order preserved", () => {
    const keys = enabledLifeStageAudiences(true).map((a) => a.key);
    assert.deepEqual(keys.slice(0, 3), ["job_seekers", "employers", "recruiters"]);
    assert.equal(keys.length, LIFE_STAGE_AUDIENCE_REGISTRY.length + 2);
  });
});
