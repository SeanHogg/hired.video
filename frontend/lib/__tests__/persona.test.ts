// Tests for `lib/persona.ts` — the single-source-of-truth role gate.
//
// Run: vitest run lib/__tests__/persona.test.ts
//
// Two invariants matter:
//   1. SA always passes — every gate must accept super_admin without it
//      appearing in the descriptor's role list (the "SA bypass" rule).
//   2. The named capability predicates exactly mirror the persona-axis
//      design locked in for /resumes (PR #400):
//        - canSourceCandidates: recruiter | employer | admin (+ SA)
//        - canRedactAndShare:   recruiter | admin (+ SA)
//        - canAuthorOwnResume:  job_seeker (+ SA)

import { describe, it, expect } from "vitest";
import { USER_ROLES } from "@shared/user-roles";
import {
  visibleTo,
  getPersona,
  canSourceCandidates,
  canRedactAndShare,
  canPostJobs,
  canAuthorOwnResume,
} from "@/lib/persona";

const ALL_ROLES = [
  USER_ROLES.JOB_SEEKER,
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN,
] as const;

describe("visibleTo", () => {
  it("returns true when viewer is in the allow-list", () => {
    expect(visibleTo([USER_ROLES.RECRUITER], USER_ROLES.RECRUITER)).toBe(true);
  });

  it("returns false when viewer is not in the allow-list", () => {
    expect(visibleTo([USER_ROLES.RECRUITER], USER_ROLES.JOB_SEEKER)).toBe(false);
  });

  it("super_admin always passes (SA bypass) — even when not in the list", () => {
    for (const role of ALL_ROLES) {
      // empty list still admits SA — the bypass is unconditional
      expect(visibleTo([role], USER_ROLES.SUPER_ADMIN)).toBe(true);
    }
    expect(visibleTo([], USER_ROLES.SUPER_ADMIN)).toBe(true);
    expect(visibleTo([USER_ROLES.JOB_SEEKER], USER_ROLES.SUPER_ADMIN)).toBe(true);
  });

  it("does not falsely admit non-listed roles via SA short-circuit", () => {
    // recruiter must not pass on a [job_seeker] gate
    expect(visibleTo([USER_ROLES.JOB_SEEKER], USER_ROLES.RECRUITER)).toBe(false);
    // empty list rejects every non-SA role
    for (const role of ALL_ROLES.filter((r) => r !== USER_ROLES.SUPER_ADMIN)) {
      expect(visibleTo([], role)).toBe(false);
    }
  });
});

describe("getPersona", () => {
  it("maps job_seeker to job_seeker axis", () => {
    expect(getPersona(USER_ROLES.JOB_SEEKER)).toBe("job_seeker");
  });

  it("maps every hiring-side role (incl. SA) to hiring_side", () => {
    expect(getPersona(USER_ROLES.RECRUITER)).toBe("hiring_side");
    expect(getPersona(USER_ROLES.EMPLOYER)).toBe("hiring_side");
    expect(getPersona(USER_ROLES.ADMIN)).toBe("hiring_side");
    expect(getPersona(USER_ROLES.SUPER_ADMIN)).toBe("hiring_side");
  });
});

describe("canSourceCandidates", () => {
  it("permits recruiter / employer / admin / SA", () => {
    expect(canSourceCandidates(USER_ROLES.RECRUITER)).toBe(true);
    expect(canSourceCandidates(USER_ROLES.EMPLOYER)).toBe(true);
    expect(canSourceCandidates(USER_ROLES.ADMIN)).toBe(true);
    expect(canSourceCandidates(USER_ROLES.SUPER_ADMIN)).toBe(true);
  });

  it("denies job_seeker", () => {
    expect(canSourceCandidates(USER_ROLES.JOB_SEEKER)).toBe(false);
  });
});

describe("canRedactAndShare", () => {
  it("permits recruiter / admin / SA — and only those", () => {
    expect(canRedactAndShare(USER_ROLES.RECRUITER)).toBe(true);
    expect(canRedactAndShare(USER_ROLES.ADMIN)).toBe(true);
    expect(canRedactAndShare(USER_ROLES.SUPER_ADMIN)).toBe(true);
  });

  it("denies employer (direct hiring — no client redaction needed)", () => {
    expect(canRedactAndShare(USER_ROLES.EMPLOYER)).toBe(false);
  });

  it("denies job_seeker", () => {
    expect(canRedactAndShare(USER_ROLES.JOB_SEEKER)).toBe(false);
  });
});

describe("canPostJobs", () => {
  it("permits hiring-side + SA, denies job_seeker", () => {
    expect(canPostJobs(USER_ROLES.RECRUITER)).toBe(true);
    expect(canPostJobs(USER_ROLES.EMPLOYER)).toBe(true);
    expect(canPostJobs(USER_ROLES.ADMIN)).toBe(true);
    expect(canPostJobs(USER_ROLES.SUPER_ADMIN)).toBe(true);
    expect(canPostJobs(USER_ROLES.JOB_SEEKER)).toBe(false);
  });
});

describe("canAuthorOwnResume", () => {
  it("permits job_seeker", () => {
    expect(canAuthorOwnResume(USER_ROLES.JOB_SEEKER)).toBe(true);
  });

  it("permits SA via bypass even though it isn't in the list", () => {
    expect(canAuthorOwnResume(USER_ROLES.SUPER_ADMIN)).toBe(true);
  });

  it("denies hiring-side roles (master-resume concept stays job-seeker-only)", () => {
    expect(canAuthorOwnResume(USER_ROLES.RECRUITER)).toBe(false);
    expect(canAuthorOwnResume(USER_ROLES.EMPLOYER)).toBe(false);
    expect(canAuthorOwnResume(USER_ROLES.ADMIN)).toBe(false);
  });
});

describe("SA-superset invariant (cross-cutting)", () => {
  it("SA passes every named capability predicate", () => {
    for (const predicate of [
      canSourceCandidates,
      canRedactAndShare,
      canPostJobs,
      canAuthorOwnResume,
    ]) {
      expect(predicate(USER_ROLES.SUPER_ADMIN)).toBe(true);
    }
  });
});
