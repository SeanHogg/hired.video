/**
 * use-resume-permissions.ts — Single source of truth for "what can the
 * current viewer do with this resume?"
 *
 * Resume-scoped permissions are a function of:
 *   1. Ownership: the server-computed `resume.isOwner` flag (do NOT
 *      compare local user.id to resume.userId — see ResumeDetail.tsx
 *      line 304 for the 2026-04-20 bug that taught us this).
 *   2. Viewer role: from `usePermissions()` (which already accounts for
 *      impersonation + persona preview).
 *
 * Per the DRY rule, every resume-related gate (Gaps tab, Edit Template
 * Design link, Export button, Embed menu item, etc.) should derive its
 * `can*` flag here, NOT take it as a prop. Shared components that
 * consume the result self-gate (return null when not entitled).
 */

import { usePermissions } from "@/hooks/use-permissions";
import type { Resume } from "@/types/resume";

export interface ResumePermissions {
  /** Has any view permission at all (loaded + visible). */
  isViewer: boolean;
  /** True when the viewer authored / owns the resume. */
  isOwner: boolean;
  /** Edit content (sections, basics, etc.). Owner only. */
  canEdit: boolean;
  /** Modify the resume's template descriptor / "Edit the Template Design".
   *  Owner only — non-owners can preview different templates locally but
   *  not change the design. */
  canEditTemplate: boolean;
  /** Assign template as default / embedded view. Owner only. */
  canAssignTemplate: boolean;
  /** Download the resume in any format. Owner, recruiter, or employer. */
  canExport: boolean;
  /** See resume status flags (Active / Master / Privacy) plus the
   *  scoring sub-scores (ATS / KW / Fmt / Cnt / Imp / sentiment) and
   *  meta statistics (views, created/updated). Owners need this to
   *  manage their own resume; paid-role viewers (recruiter / employer)
   *  need it to evaluate candidates. Job seekers viewing someone else's
   *  resume must NOT see these — they're an internal signal that bleeds
   *  competitive info to peers. */
  canViewStats: boolean;
  /** Generate / copy embed snippets. Owner only — others can share by
   *  link but cannot embed someone else's resume. */
  canEmbed: boolean;
  /** Use the "Gaps" feature in the skill graph (job match analysis).
   *  Owner (their own gap) and recruiters (matching candidates to roles).
   *  Employers see the resume as part of a hiring workflow but rarely
   *  need the per-candidate gap analysis — gated to owner+recruiter. */
  canViewGaps: boolean;
  /** Promote a variation to master. Owner only. */
  canPromoteToMaster: boolean;
  /** Delete the resume. Owner only. */
  canDelete: boolean;
  /** View analytics for this resume. Owner only. */
  canViewAnalytics: boolean;
  /** Rename. Owner only. */
  canRename: boolean;
}

const NULL_PERMS: ResumePermissions = {
  isViewer: false,
  isOwner: false,
  canEdit: false,
  canEditTemplate: false,
  canAssignTemplate: false,
  canExport: false,
  canViewStats: false,
  canEmbed: false,
  canViewGaps: false,
  canPromoteToMaster: false,
  canDelete: false,
  canViewAnalytics: false,
  canRename: false,
};

/**
 * Compute viewer-scoped permissions for a single resume. Pass `null` /
 * `undefined` while the resume is loading and you'll get an all-false
 * permissions object — components can render their disabled / hidden
 * fallback unconditionally.
 */
export function useResumePermissions(resume: Resume | null | undefined): ResumePermissions {
  const { isRecruiter, isAdmin, isSuperAdmin, canManageJobs } = usePermissions();

  if (!resume) return NULL_PERMS;

  // Trust the server's isOwner flag — see file header comment for why.
  const isOwner = !!resume.isOwner;

  // Admins (including super admin) act with owner-equivalent privileges
  // on resume actions for support/debugging purposes. If you need a
  // stricter audit trail later, split into `isOwner` vs `isAdmin` here.
  const adminLike = isOwner || isAdmin || isSuperAdmin;

  // Hiring-side surfaces (export, stats) widen to anyone who can manage
  // jobs — recruiter / employer / admin / SA — via the canonical
  // permission. Gap #360 consolidation: no more inline isRecruiter || isEmployer.
  return {
    isViewer: true,
    isOwner,
    canEdit: adminLike,
    canEditTemplate: adminLike,
    canAssignTemplate: adminLike,
    canExport: adminLike || canManageJobs,
    canViewStats: adminLike || canManageJobs,
    canEmbed: adminLike,
    canViewGaps: adminLike || isRecruiter,
    canPromoteToMaster: adminLike,
    canDelete: adminLike,
    canViewAnalytics: adminLike,
    canRename: adminLike,
  };
}
