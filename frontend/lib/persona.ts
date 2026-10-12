// persona.ts — single source of truth for "which tabs / actions does this
// role see?" across /resumes, /jobs, /people, /companies.
//
// Every entity-hub descriptor and every self-gating sub-component imports
// from here. No `canX` booleans are prop-drilled — components import
// `visibleTo()` or one of the named capability predicates and decide their
// own visibility. Per the standing DRY rule.
//
// SA bypass — super_admin sees every tab and every gated UI element. The
// bypass is enforced once, in `visibleTo()`. New gates only need to list
// the roles that *should* see them; super_admin is added automatically.

import { USER_ROLES, canPostJobsRole, type UserRole } from "@shared/user-roles";
import { normalizeRole } from "@/lib/role-utils";

const isSuperAdmin = (r: UserRole): boolean => r === USER_ROLES.SUPER_ADMIN;

/**
 * Core gate predicate. A tab/action is visible if the viewer's role is in
 * the descriptor's allow-list, or the viewer is super_admin (bypass).
 */
export function visibleTo(roles: readonly UserRole[], viewer: UserRole): boolean {
  return isSuperAdmin(viewer) || roles.includes(viewer);
}

/**
 * Two-axis persona — used for tab grouping where a tab applies to "every
 * job seeker" vs "every hiring-side role". Roles map deterministically:
 *   - job_seeker            → "job_seeker"
 *   - recruiter / employer / admin / super_admin → "hiring_side"
 *
 * Note: super_admin is in BOTH for tab visibility purposes (it's the
 * union-of-everything role), but `getPersona` returns its primary axis as
 * "hiring_side" so dashboards and default tabs land on the management view.
 */
export type Persona = "job_seeker" | "hiring_side";

export function getPersona(role: UserRole): Persona {
  return role === USER_ROLES.JOB_SEEKER ? "job_seeker" : "hiring_side";
}

// ─── Capability predicates ──────────────────────────────────────────────────
// Each predicate names *what* the viewer can do. Tab descriptors and
// component-level gates compose them. SA bypass is built in via `visibleTo`.

const HIRING_SIDE: readonly UserRole[] = [
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.ADMIN,
];

const RECRUITER_LIKE: readonly UserRole[] = [
  USER_ROLES.RECRUITER,
  USER_ROLES.ADMIN,
];

/** Source candidate resumes into the company pool (CSV / JSON / PDF upload). */
export const canSourceCandidates = (role: UserRole): boolean =>
  visibleTo(HIRING_SIDE, role);

/**
 * Use the recruiter-only redaction profiles + tokenised share links to
 * present candidates to external employer clients. Employers (direct hiring)
 * don't need redaction — they're the buyer, not the broker.
 */
export const canRedactAndShare = (role: UserRole): boolean =>
  visibleTo(RECRUITER_LIKE, role);

/** Post jobs as the company — the shared rule the API enforces too
 *  (`canPostJobsRole`, shared/user-roles.ts). */
export const canPostJobs = (role: UserRole): boolean => canPostJobsRole(role);

/** Author personal resumes (master / variations / active). Job-seeker axis. */
export const canAuthorOwnResume = (role: UserRole): boolean =>
  visibleTo([USER_ROLES.JOB_SEEKER], role);

// ─── Helpers for callers that hold an unknown-shape role ────────────────────

/** Coerce a possibly-untyped role and apply the gate. Convenience for
 *  components that read `user.role` straight off auth state. */
export function visibleToFrom(roles: readonly UserRole[], viewer: unknown): boolean {
  return visibleTo(roles, normalizeRole(viewer as never));
}
