// ServicesNav — top tab strip for the My Services hub.
//
// The Candidates entry moved out of My Services and now lives at
// /resumes?tab=sourced — see gap #400 + EntityHubShell. Pitch Decks /
// Hiring & Onboarding / Scorecards moved out to /people/* — their nav
// lives in `usePeopleTabs` now. Team moved to /companies?tab=team. The
// Offerings tab was folded into Content Creator as a sub-tab —
// `/services/offerings` is still routable for legacy deep-links but the
// top-level entry was removed. The Settings tab was folded into /settings
// as the "Recruiter → Sharing & Branding" tab; the old `/services/settings`
// URL now redirects there.

import { Link, useLocation } from "react-router-dom";
import { Inbox, TrendingUp, Video, Handshake } from "lucide-react";
import { tabItemClass, TabItemContent } from "@/components/ui/tab-item";
import { cn } from "@/lib/utils";
import { ACTION_BAR_STICKY, ACTION_BAR_SURFACE } from "@/lib/ui/action-bar";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import { USER_ROLES } from "@shared/user-roles";

interface Tab {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Match the tab as active when the URL starts with any of these. */
  matchPrefixes?: string[];
  /** Roles this tab is hidden from (mirrors the old nav deny-list). */
  hideForRoles?: readonly string[];
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
  // Gigs marketplace folded into the hub (was the standalone /gigs nav item).
  // It kept its affiliate deny-list from the old feature-registry entry.
  {
    to: "/services/gigs",
    label: "Gigs",
    icon: Handshake,
    matchPrefixes: ["/services/gigs"],
    hideForRoles: [USER_ROLES.AFFILIATE],
  },
  { to: "/services/inquiries", label: "Inquiries", icon: Inbox },
] as const;

export default function ServicesNav() {
  const location = useLocation();
  const effectiveRole = useEffectiveRole();

  // Dashboard is the index — only active when path is exactly /services or
  // /services/. Every other tab uses prefix-matching so detail pages
  // (/services/candidates/:id) keep their tab lit. `matchPrefixes` lets a
  // tab claim additional paths (e.g. Content Creator owns both
  // /services/creator and the legacy /services/offerings URL).
  const isActive = (tab: Tab) => {
    if (tab.to === "/services") {
      return location.pathname === "/services" || location.pathname === "/services/";
    }
    const prefixes = tab.matchPrefixes ?? [tab.to];
    return prefixes.some((p) => location.pathname.startsWith(p));
  };

  const visibleTabs = TABS.filter(
    (tab) => !tab.hideForRoles?.includes(effectiveRole ?? ""),
  );

  return (
    <nav className={cn(ACTION_BAR_STICKY, ACTION_BAR_SURFACE, "border-b")} aria-label="Services">
      <ul className="flex gap-1 -mb-px overflow-x-auto">
        {visibleTabs.map(({ to, label, icon: Icon, matchPrefixes }) => {
          const active = isActive({ to, label, icon: Icon, matchPrefixes });
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
