// useResumesTabs — single source of truth for the tab strip rendered above
// every /resumes surface. Mirrors usePeopleTabs / useJobsTabs / useCompaniesTabs.
// Used by:
//   - /resumes                (Resumes.tsx)        — My Resumes / Available / Sourced
//   - /resumes/:id            (ResumeDetail)       — strip-only header
//   - /resumes/edit/:id       (ResumeEditPage)     — via EntityEditShell
//   - /resumes/create/:id     (ResumeCreatePage)   — via EntityEditShell
//
// Self-gates each tab on role via persona.ts `visibleTo` (SA-bypass). The
// list returned is already filtered, so consumers don't carry around the
// `roles:` field. Hub list pages enrich each tab with body/headerActions/
// meta closures to feed EntityHubShell.

import { FileText, Search, UserCheck, type LucideIcon } from "lucide-react";
import type { PageHeaderTab } from "@/components/PageHeader";
import { USER_ROLES, type UserRole } from "@shared/user-roles";
import { visibleTo } from "@/lib/persona";
import { usePermissions } from "@/hooks/use-permissions";

export interface ResumesTabMeta {
  key: string;
  label: string;
  icon: LucideIcon;
  to: string;
  roles: readonly UserRole[];
}

export const RESUMES_HUB_TABS: ReadonlyArray<ResumesTabMeta> = [
  {
    key: "mine",
    label: "My Resumes",
    icon: FileText,
    to: "/resumes",
    roles: [USER_ROLES.JOB_SEEKER],
  },
  {
    key: "available",
    label: "Available",
    icon: Search,
    to: "/resumes?tab=available",
    roles: [USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.ADMIN],
  },
  {
    key: "sourced",
    label: "Sourced",
    icon: UserCheck,
    to: "/resumes?tab=sourced",
    roles: [USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.ADMIN],
  },
];

export const RESUMES_HUB_DEFAULT_TAB = "mine";

export function useResumesTabs(): PageHeaderTab[] {
  const { effectiveRole } = usePermissions();
  return RESUMES_HUB_TABS
    .filter((t) => visibleTo(t.roles, effectiveRole))
    .map(({ roles: _roles, ...rest }) => rest);
}
