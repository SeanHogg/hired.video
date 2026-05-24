// useJobsTabs — single source of truth for the tab strip rendered above
// every /jobs surface. Mirrors usePeopleTabs / useResumesTabs / useCompaniesTabs.
// Used by:
//   - /jobs                   (Jobs.tsx)            — Jobs / Saved / Applications / Alerts / My Postings / Candidates
//   - /jobs/:id               (JobDetail)           — strip-only header
//   - /jobs/edit/:id          (JobEditPage)         — via EntityEditShell
//   - /jobs/create(/:id)      (JobCreatePage)       — via EntityEditShell
//   - /jobs/:id/apply         (JobApplicationPage)  — strip-only header
//
// Self-gates the hiring-side tabs (My Postings / Candidates) on the
// canPostJobs predicate (recruiter / employer / admin + SA bypass).

import {
  Bell,
  Bookmark,
  Briefcase,
  FileText,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { PageHeaderTab } from "@/components/PageHeader";
import { USER_ROLES, type UserRole } from "@shared/user-roles";
import { visibleTo } from "@/lib/persona";
import { usePermissions } from "@/hooks/use-permissions";

const HIRING_SIDE: readonly UserRole[] = [
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.ADMIN,
];
const ALL_AUTHED: readonly UserRole[] = [
  USER_ROLES.JOB_SEEKER,
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.ADMIN,
];

interface JobsTabMeta {
  key: string;
  label: string;
  icon: LucideIcon;
  to: string;
  roles: readonly UserRole[];
}

const JOBS_HUB_TABS: ReadonlyArray<JobsTabMeta> = [
  { key: "jobs",         label: "Jobs",         icon: Briefcase, to: "/jobs",                roles: ALL_AUTHED },
  { key: "saved",        label: "Saved",        icon: Bookmark,  to: "/jobs?tab=saved",      roles: ALL_AUTHED },
  { key: "applications", label: "Applications", icon: FileText,  to: "/jobs?tab=applications", roles: ALL_AUTHED },
  { key: "alerts",       label: "Alerts",       icon: Bell,      to: "/jobs?tab=alerts",     roles: ALL_AUTHED },
  { key: "posted",       label: "My Postings",  icon: Briefcase, to: "/jobs?tab=posted",     roles: HIRING_SIDE },
  { key: "candidates",   label: "Candidates",   icon: Users,     to: "/jobs?tab=candidates", roles: HIRING_SIDE },
];

export const JOBS_HUB_DEFAULT_TAB = "jobs";

export interface UseJobsTabsOptions {
  /** Total jobs badge for the Jobs tab. */
  totalJobs?: number;
  /** Candidate count badge for the Candidates tab (hiring side only). */
  candidateCount?: number;
}

export function useJobsTabs({ totalJobs, candidateCount }: UseJobsTabsOptions = {}): PageHeaderTab[] {
  const { effectiveRole } = usePermissions();
  return JOBS_HUB_TABS
    .filter((t) => visibleTo(t.roles, effectiveRole))
    .map(({ roles: _roles, ...rest }) => {
      const next: PageHeaderTab = { ...rest };
      if (rest.key === "jobs" && totalJobs !== undefined) next.badge = totalJobs;
      if (rest.key === "candidates" && candidateCount !== undefined && candidateCount > 0)
        next.badge = candidateCount;
      return next;
    });
}
