// usePeopleTabs — single source of truth for the tab strip rendered above
// every /people surface. Used by:
//   - /people                       → People.tsx (browse / connections / talent-pool / submissions)
//   - /people/pitch-decks(+/:id)    → PitchDecksList.tsx + PitchDeckBuilder.tsx
//   - /people/hiring                → HiringOnboarding.tsx
//   - /people/scorecards            → ScorecardsPage.tsx
//
// Self-gates each tab on role + company access so a plain job seeker never
// sees the agency-only entries. Consumers render the returned `PageHeaderTab[]`
// through <PageHeader tabs={...} activeTabKey="..." /> — passing
// activeTabKey explicitly is preferred so route-based surfaces (pitch-decks/
// hiring/scorecards) keep their tab lit on detail pages too.

import {
  Briefcase,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileText,
  LayoutPanelLeft,
  Users,
} from "lucide-react";
import type { PageHeaderTab } from "@/components/PageHeader";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { useCurrentCompanyScope } from "@/hooks/use-current-company-scope";
import { visibleTo } from "@/lib/persona";

export interface UsePeopleTabsOptions {
  /** Optional badge count for the Connections tab (People page). */
  connectionsCount?: number;
}

export function usePeopleTabs({ connectionsCount }: UsePeopleTabsOptions = {}): PageHeaderTab[] {
  const { user } = useAuth();
  const { hasNoCompany } = useCurrentCompanyScope();
  const hasCompanyAccess = !hasNoCompany;

  const showHiringSide = user
    ? visibleTo(
        [USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.ADMIN],
        user.role,
      )
    : false;

  const tabs: PageHeaderTab[] = [
    { key: "browse", label: "People", icon: Users, to: "/people" },
    {
      key: "connections",
      label: "Connections",
      icon: Eye,
      to: "/people?tab=connections",
      badge: connectionsCount && connectionsCount > 0 ? connectionsCount : undefined,
    },
  ];

  if (showHiringSide) {
    tabs.push(
      { key: "talent-pool", label: "Talent Pool", icon: Briefcase, to: "/people?tab=talent-pool" },
      { key: "submissions", label: "Submissions", icon: FileText, to: "/people?tab=submissions" },
    );
  }

  if (hasCompanyAccess) {
    tabs.push({
      key: "pitch-decks",
      label: "Pitch Decks",
      icon: LayoutPanelLeft,
      to: "/people/pitch-decks",
      matchPrefixes: ["/people/pitch-decks"],
    });
  }

  // Hiring & Onboarding (offer letters + onboarding checklists) is an
  // employer/recruiter surface — gate it on role like talent-pool/submissions.
  // Leaving it unconditional surfaced it to plain job seekers, who'd click
  // through to /people/hiring and trip the server-side `requirePro` 402 (the
  // page is Pro-gated), generating noise error reports for a tab they should
  // never have seen.
  if (showHiringSide) {
    tabs.push({
      key: "hiring",
      label: "Hiring & Onboarding",
      icon: ClipboardList,
      to: "/people/hiring",
      matchPrefixes: ["/people/hiring"],
    });
  }

  if (hasCompanyAccess) {
    tabs.push({
      key: "scorecards",
      label: "Scorecards",
      icon: ClipboardCheck,
      to: "/people/scorecards",
      matchPrefixes: ["/people/scorecards"],
    });
  }

  return tabs;
}
