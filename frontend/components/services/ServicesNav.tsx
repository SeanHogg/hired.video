// ServicesNav — top tab strip for the My Services hub.
//
// All seven sections share this nav. Candidates / Pitch Decks / Settings
// are agency surfaces — gated behind `hasCompanyAccess` so a plain Job
// Seeker doesn't see empty tabs they can't act on.

import { Link, useLocation } from "react-router-dom";
import {
  ClipboardList,
  Inbox,
  LayoutPanelLeft,
  Settings,
  ShoppingBag,
  Trophy,
  TrendingUp,
  UserCheck,
} from "lucide-react";

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
  { to: "/services/offerings", label: "Offerings", icon: ShoppingBag },
  { to: "/services/inquiries", label: "Inquiries", icon: Inbox },
  { to: "/services/candidates", label: "Candidates", icon: UserCheck, agencyOnly: true },
  { to: "/services/team", label: "Team", icon: Trophy, agencyOnly: true },
  { to: "/services/pitch-decks", label: "Pitch Decks", icon: LayoutPanelLeft, agencyOnly: true },
  { to: "/services/hiring", label: "Hiring & Onboarding", icon: ClipboardList },
  { to: "/services/settings", label: "Settings", icon: Settings, agencyOnly: true },
] as const;

export default function ServicesNav({ hasCompanyAccess = false }: ServicesNavProps) {
  const location = useLocation();

  // Dashboard is the index — only active when path is exactly /services or
  // /services/. Every other tab uses prefix-matching so detail pages
  // (/services/candidates/:id, /services/pitch-decks/:id) keep their tab lit.
  const isActive = (tab: Tab) => {
    if (tab.to === "/services") {
      return location.pathname === "/services" || location.pathname === "/services/";
    }
    return location.pathname.startsWith(tab.to);
  };

  const visibleTabs = TABS.filter((t) => !t.agencyOnly || hasCompanyAccess);

  return (
    <nav className="mb-6 border-b">
      <ul className="flex gap-1 -mb-px overflow-x-auto">
        {visibleTabs.map(({ to, label, icon: Icon }) => {
          const active = isActive({ to, label, icon: Icon });
          return (
            <li key={to}>
              <Link
                to={to}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
