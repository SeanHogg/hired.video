/**
 * Shared user role constants and types for both client and server.
 *
 * Values are lower_snake — the canonical form stored in
 * `users.role` and expected by the JWT `roles` claim. Historical
 * PascalCase values ("JobSeeker", "Recruiter", …) have been retired;
 * the register endpoint no longer normalises them, so both sides of
 * the wire agree on one form.
 *
 * Note: affiliate is NOT in this enum. Affiliate status is a service
 * a user opts into via `enableAffiliate: true` at signup or via the
 * affiliate-program page later. An affiliate's underlying role can be
 * any of the four values below.
 */

export const USER_ROLES = {
  JOB_SEEKER: "job_seeker",
  RECRUITER: "recruiter",
  EMPLOYER: "employer",
  EMPLOYEE: "employee",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

/** Roles that can earn gamification points. Admin / super_admin are
 *  intentionally excluded; affiliate isn't a role. Employee is also
 *  excluded — they're invite-only workforce members, not earners on
 *  the gamification surface (see project_employee_role memory + #1349). */
export type ScoringRole = "job_seeker" | "recruiter" | "employer";

/** Resolve the user's primary scoring role from the JWT `roles` array
 *  (or any string array of role claims). Returns null when none of the
 *  roles is one we score — callers should treat that as a no-op rather
 *  than an error. Centralises the "first matching scoring role" logic
 *  so every points-trigger site agrees on the same primary. */
export function pickScoringRole(roles: readonly string[] | null | undefined): ScoringRole | null {
  if (!roles) return null;
  for (const r of roles) {
    if (r === USER_ROLES.JOB_SEEKER || r === USER_ROLES.RECRUITER || r === USER_ROLES.EMPLOYER) {
      return r as ScoringRole;
    }
  }
  return null;
}
