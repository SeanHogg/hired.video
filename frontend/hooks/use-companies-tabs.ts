// useCompaniesTabs — single source of truth for the tab strip rendered above
// every /companies surface. Mirrors usePeopleTabs / useResumesTabs / useJobsTabs.
// Used by:
//   - /companies              (Companies.tsx)        — Browse / Following / My Companies / Team
//   - /companies/:id          (CompanyDetail)        — strip-only header
//   (create / edit retired into the studio — lib/routing/legacy-redirects.ts)
//
// Self-gates the hiring-side tabs (My Companies / Team) on recruiter /
// employer / admin (+ SA bypass) via persona.ts `visibleTo`.

import { Building2, Eye, Trophy, type LucideIcon } from "lucide-react";
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

export interface CompaniesTabMeta {
  key: string;
  label: string;
  icon: LucideIcon;
  to: string;
  roles: readonly UserRole[];
}

export const COMPANIES_HUB_TABS: ReadonlyArray<CompaniesTabMeta> = [
  { key: "browse",      label: "Companies",    icon: Building2, to: "/companies",                   roles: ALL_AUTHED },
  { key: "connections", label: "Following",    icon: Eye,       to: "/companies?tab=connections",   roles: ALL_AUTHED },
  { key: "mine",        label: "My Companies", icon: Building2, to: "/companies?tab=mine",          roles: HIRING_SIDE },
  { key: "team",        label: "Team",         icon: Trophy,    to: "/companies?tab=team",          roles: HIRING_SIDE },
];

export const COMPANIES_HUB_DEFAULT_TAB = "browse";

export interface UseCompaniesTabsOptions {
  /** Followed-companies count badge for the Following tab. */
  trackedCompanyCount?: number;
}

export function useCompaniesTabs({ trackedCompanyCount }: UseCompaniesTabsOptions = {}): PageHeaderTab[] {
  const { effectiveRole } = usePermissions();
  return COMPANIES_HUB_TABS
    .filter((t) => visibleTo(t.roles, effectiveRole))
    .map(({ roles: _roles, ...rest }) => {
      const next: PageHeaderTab = { ...rest };
      if (rest.key === "connections" && trackedCompanyCount !== undefined && trackedCompanyCount > 0)
        next.badge = trackedCompanyCount;
      return next;
    });
}
