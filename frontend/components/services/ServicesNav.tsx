// ServicesNav — top tab strip for the My Services hub.
//
// All sections share this nav. Pitch Decks / Settings / Team / Scorecards
// are agency surfaces — gated behind `hasCompanyAccess` so a plain Job
// Seeker doesn't see empty tabs they can't act on. (The Candidates entry
// moved out of My Services and now lives at /resumes?tab=sourced — see
// gap #400 + EntityHubShell.) The Offerings tab was folded into Content
// Creator as a sub-tab — `/services/offerings` is still routable for legacy
// deep-links but the top-level entry was removed.

import { Link, useLocation } from "react-router-dom";
import {
  ClipboardCheck,
  ClipboardList,
  Inbox,
  LayoutPanelLeft,
  Settings,
  Trophy,
  TrendingUp,
  Video,
} from "lucide-react";
import { tabItemClass, TabItemContent } from "@/components/ui/tab-item";

interface ServicesNavProps {
  hasCompanyAccess?: boolean;
}

interface Tab {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** When true, only show if `hasCompanyAccess` is true. */
  agencyOnly?: boolean;
  /** Match the tab as active when the URL starts with any of these. */
  matchPrefixes?: string[];
}

const TABS: readonly Tab[] = [
  { to: "/services", label: "Dashboard", icon: TrendingUp, matchPrefixes: ["/services"] },
  // Content Creator owns Offerings as its first sub-tab; the legacy
  // `/services/offerings` URL also lights this tab via matchPrefixes.
  {
    to: "/services/creator",
    label: "Content Creator",
    icon: Video,
    matchPrefixes: ["/services/creator", "/services/offerings"],
  },
  { to: "/services/inquiries", label: "Inquiries", icon: Inbox },
  { to: "/services/team", label: "Team", icon: Trophy, agencyOnly: true },
  { to: "/services/pitch-decks", label: "Pitch Decks", icon: LayoutPanelLeft, agencyOnly: true },
  { to: "/services/hiring", label: "Hiring & Onboarding", icon: ClipboardList },
  { to: "/services/scorecards", label: "Scorecards", icon: ClipboardCheck, agencyOnly: true },
  { to: "/services/settings", label: "Settings", icon: Settings, agencyOnly: true },
] as const;

export default function ServicesNav({ hasCompanyAccess = false }: ServicesNavProps) {
  const location = useLocation();

  // Dashboard is the index — only active when path is exactly /services or
  // /services/. Every other tab uses prefix-matching so detail pages
  // (/services/candidates/:id, /services/pitch-decks/:id) keep their tab lit.
  // `matchPrefixes` lets a tab claim additional paths (e.g. Content Creator
  // owns both /services/creator and the legacy /services/offerings URL).
  const isActive = (tab: Tab) => {
    if (tab.to === "/services") {
      return location.pathname === "/services" || location.pathname === "/services/";
    }
    const prefixes = tab.matchPrefixes ?? [tab.to];
    return prefixes.some((p) => location.pathname.startsWith(p));
  };

  const visibleTabs = TABS.filter((t) => {
    if (t.agencyOnly && !hasCompanyAccess) return false;
    return true;
  });

  return (
    <nav className="mb-6 border-b">
      <ul className="flex gap-1 -mb-px overflow-x-auto">
        {visibleTabs.map(({ to, label, icon: Icon }) => {
          const active = isActive({ to, label, icon: Icon });
          // #332 — consume the shared `tabItemClass` + `TabItemContent`
          // primitive so this nav stays visually identical to `PageHeader`
          // / `TabStrip`. A future visual change lands once.
          return (
            <li key={to}>
              <Link
                to={to}
                className={tabItemClass(active)}
                aria-current={active ? "page" : undefined}
              >
                <TabItemContent label={label} icon={Icon} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
