import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Briefcase,
  FileText,
  Users,
  TrendingUp,
  LogIn,
  Video,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRoleAccess } from "@/hooks/use-role-access";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  accent?: boolean;
};

/**
 * Mobile bottom bar = Home (anchor) + the top visible primary destinations for
 * the role + Dashboard (anchor). The middle items come from ONE curated,
 * mobile-priority candidate list (not the sidebar rank order, which isn't a
 * good mobile priority) and are filtered through the shared role-access
 * manifest (canSee) — so the bar is role-aware (e.g. an affiliate never sees
 * Studio/Resumes) from the SAME visibility source as the desktop rail, with no
 * per-role `switch`. (#2038)
 */
const MIDDLE_CANDIDATES: { label: string; href: string; icon: LucideIcon; key: string }[] = [
  { label: "Jobs", href: "/jobs", icon: Briefcase, key: "nav:jobs" },
  { label: "Resumes", href: "/resumes", icon: FileText, key: "nav:resumes" },
  { label: "Studio", href: "/studio", icon: Video, key: "nav:studio" },
  { label: "People", href: "/people", icon: Users, key: "nav:people" },
  { label: "Tools", href: "/tools", icon: Wrench, key: "nav:tools" },
];

const HOME: NavItem = { label: "Home", href: "/", icon: Home };
const DASHBOARD: NavItem = { label: "Dashboard", href: "/dashboard", icon: TrendingUp };

const ANON_ITEMS: NavItem[] = [
  HOME,
  { label: "Jobs", href: "/jobs", icon: Briefcase },
  { label: "Tools", href: "/tools", icon: Wrench },
  { label: "People", href: "/people", icon: Users },
  { label: "Login", href: "/login", icon: LogIn, accent: true },
];

export default function MobileBottomNav() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { canSee } = useRoleAccess();

  const items: NavItem[] = isAuthenticated
    ? [
        HOME,
        ...MIDDLE_CANDIDATES.filter((c) => canSee(c.key)).slice(0, 3),
        DASHBOARD,
      ]
    : ANON_ITEMS;

  return (
    <nav
      data-print-hide
      className="fixed bottom-0 left-0 right-0 z-30 md:hidden print:hidden bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t border-border"
      role="navigation"
      aria-label="Mobile primary"
    >
      <div className="max-w-7xl mx-auto px-2 py-1" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <ul className="flex items-stretch justify-between">
          {items.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.href || (item.href !== "/" && location.pathname.startsWith(item.href));
            return (
              <li key={item.href} className="flex-1">
                <Link
                  to={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 py-2 px-2 text-xs",
                    "min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    item.accent
                      ? "mx-1 my-1 rounded-lg bg-gradient-to-r from-brand-purple to-brand-blue text-white shadow-sm hover:opacity-90 font-semibold"
                      : active
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className={cn("h-5 w-5", active && !item.accent && "text-primary")} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
