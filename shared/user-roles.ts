/**
 * Shared user role constants and types for both client and server.
 *
 * Values are lower_snake — the canonical form stored in
 * `users.role` and expected by the JWT `roles` claim. Historical
 * PascalCase values ("JobSeeker", "Recruiter", …) have been retired;
 * the register endpoint no longer normalises them, so both sides of
 * the wire agree on one form.
 *
 * `creator` and `affiliate` were promoted to first-class roles on
 * 2026-06-13 (reversing the earlier "Creator = profileMode, not a role"
 * call). The driver is reporting: growth / SaaS dashboards segment
 * populations with `GROUP BY users.role`, and creator-only / affiliate-only
 * accounts need to appear under /people as themselves — NOT as Job Seekers.
 * The `creator_profiles` program enrollment + `profileMode` resolver still
 * exist for presentation + monetization, but `role` is now the primary axis.
 * `enableAffiliate` at signup still auto-creates the affiliate_profiles row;
 * it is now layered on top of `role = 'affiliate'` rather than job_seeker.
 */

export const USER_ROLES = {
  JOB_SEEKER: "job_seeker",
  RECRUITER: "recruiter",
  EMPLOYER: "employer",
  EMPLOYEE: "employee",
  CREATOR: "creator",
  AFFILIATE: "affiliate",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

/** Roles that can earn gamification points. Admin / super_admin are
 *  intentionally excluded. Employee is also excluded — they're invite-only
 *  workforce members, not earners on the gamification surface (see
 *  project_employee_role memory + #1349). `creator` IS a scoring role — a
 *  content creator is an active content/engagement earner. `affiliate` is
 *  NOT: affiliates are compensated via referral commission on the payout
 *  ledger, not gamification points. */
export type ScoringRole = "job_seeker" | "recruiter" | "employer" | "creator";

/** Roles whose profiles surface to candidate-discovery feeds — `/people`
 *  search, recruiter talent pools, pitch decks, profile-section public
 *  defaults. Single SSoT for the "is this user discoverable as a hireable
 *  candidate" gate (#1407, DRY rule).
 *
 *  Deliberately excludes `employee` (workforce member of a specific
 *  employer — not on the market), `admin` / `super_admin` (platform
 *  staff — not candidates). `recruiter` + `employer` ARE included
 *  because they often participate in cross-platform networking and can
 *  be approached for connections / coffee chats; the actual "open to work"
 *  filter on People.tsx narrows further per intent.
 *
 *  `creator` + `affiliate` ARE included: a creator-only or affiliate-only
 *  account opted into a public-facing persona and expects to be discoverable
 *  under /people — but surfaced AS a Creator / Affiliate, never relabelled a
 *  Job Seeker. The per-role label resolver (not the visibility gate) draws
 *  that distinction. */
export const CANDIDATE_VISIBLE_ROLES: readonly UserRole[] = [
  "job_seeker",
  "recruiter",
  "employer",
  "creator",
  "affiliate",
] as const;

/** Negated form for `WHERE role NOT IN (...)` queries — convenient for
 *  filtering OUT non-candidate roles in Drizzle queries. */
export const NON_CANDIDATE_ROLES: readonly UserRole[] = [
  "employee",
  "admin",
  "super_admin",
] as const;

export function isCandidateVisibleRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (CANDIDATE_VISIBLE_ROLES as readonly string[]).includes(role.toLowerCase());
}

/** Resolve the user's primary scoring role from the JWT `roles` array
 *  (or any string array of role claims). Returns null when none of the
 *  roles is one we score — callers should treat that as a no-op rather
 *  than an error. Centralises the "first matching scoring role" logic
 *  so every points-trigger site agrees on the same primary. */
export function pickScoringRole(roles: readonly string[] | null | undefined): ScoringRole | null {
  if (!roles) return null;
  for (const r of roles) {
    if (
      r === USER_ROLES.JOB_SEEKER ||
      r === USER_ROLES.RECRUITER ||
      r === USER_ROLES.EMPLOYER ||
      r === USER_ROLES.CREATOR
    ) {
      return r as ScoringRole;
    }
  }
  return null;
}
