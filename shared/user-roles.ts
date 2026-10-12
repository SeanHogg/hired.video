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

/**
 * THE persona switch (2026-10-03). hired.video is job-seeker focused: the
 * product is "build a resume → turn it into a video → post it". Recruiter /
 * employer (the hiring side) surfaces are DISABLED — no public signup, no
 * hiring nav / mobile CTA, hiring routes redirect home, hiring audiences drop
 * off the /for landing pages. Existing recruiter / employer accounts and ALL
 * their data are RETAINED: they still sign in and simply see the job-seeker
 * surface set. Creator + affiliate personas stay on.
 *
 * Flip to `true` to restore the hiring side; every gate derives from this
 * one constant (no per-surface flags).
 */
// `as boolean` (not the literal `false`) so TS doesn't narrow every gate to dead code.
export const HIRING_PERSONAS_ENABLED = false as boolean;

/** The hiring-side personas the switch above governs. */
export const HIRING_ROLES: readonly UserRole[] = [
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
] as const;

export function isHiringRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (HIRING_ROLES as readonly string[]).includes(role);
}

/** Roles that may POST a job posting (the studio job document, the
 *  `apply_job_draft` coach tool, `POST /api/jobs`). The hiring roles plus the
 *  internal roles — the same set `persona.canPostJobs` has always allowed.
 *  ONE rule for the frontend gate and the API gate (#1915). */
export const JOB_POSTER_ROLES: readonly UserRole[] = [
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN,
] as const;

/** True when any of the caller's roles may post jobs. Accepts one role or a
 *  JWT `roles` claim. */
export function canPostJobsRole(roles: string | readonly (string | null | undefined)[] | null | undefined): boolean {
  const list = typeof roles === "string" ? [roles] : roles ?? [];
  return list.some((r) => !!r && (JOB_POSTER_ROLES as readonly string[]).includes(r));
}

/** Is this persona currently offered by the product? Hiring roles follow the
 *  switch; every other role is unaffected. `hiringEnabled` is injectable for
 *  tests — callers omit it. */
export function isPersonaEnabled(
  role: string | null | undefined,
  hiringEnabled: boolean = HIRING_PERSONAS_ENABLED,
): boolean {
  if (!role) return false;
  return hiringEnabled || !isHiringRole(role);
}

/** Every persona a logged-out visitor could ever self-select, before the
 *  switch is applied. Deliberately excludes `employee` (invite-only
 *  workforce), `admin` / `super_admin` (platform staff — never self-served). */
const SELF_SERVE_PERSONAS: readonly UserRole[] = [
  USER_ROLES.JOB_SEEKER,
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.CREATOR,
  USER_ROLES.AFFILIATE,
] as const;

/** The public persona set under a given switch position (pure, testable). */
export function publicSignupRolesFor(hiringEnabled: boolean): readonly UserRole[] {
  return SELF_SERVE_PERSONAS.filter((r) => isPersonaEnabled(r, hiringEnabled));
}

/** Roles a logged-out visitor may pick at signup — the public persona set.
 *  Single SSoT shared by the password register schema and the OAuth start
 *  route, which validates the inbound `?role=` before signing it into the
 *  handshake state (so "Continue with Google" from the affiliate / creator
 *  landing pages mints the right role). Derived from the persona switch, so
 *  recruiter / employer drop out while hiring is disabled. */
export const PUBLIC_SIGNUP_ROLES: readonly UserRole[] = publicSignupRolesFor(HIRING_PERSONAS_ENABLED);

export function isPublicSignupRole(role: string | null | undefined): role is UserRole {
  if (!role) return false;
  return (PUBLIC_SIGNUP_ROLES as readonly string[]).includes(role);
}

/** The personas the /signup role picker offers (creator / affiliate sign up
 *  through their own program pages). When this resolves to a single role the
 *  picker is not rendered at all. */
export const SIGNUP_PICKER_ROLES: readonly UserRole[] = [
  USER_ROLES.JOB_SEEKER,
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
].filter((r): boolean => isPublicSignupRole(r));

/** Map an inbound `/signup?role=` value to the picker's initial selection.
 *  Unknown, non-picker, or disabled personas fall back to job_seeker. */
export function resolveSignupPickerRole(raw: string | null | undefined): UserRole {
  const match = SIGNUP_PICKER_ROLES.find((r) => r === raw);
  return match ?? USER_ROLES.JOB_SEEKER;
}

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
