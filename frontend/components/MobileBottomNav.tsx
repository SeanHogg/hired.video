import { isStudioEditorPath } from "@/lib/studio/studio-routes";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Briefcase,
  FileText,
  Users,
  TrendingUp,
  Video,
  Wrench,
  PlusSquare,
  Shield,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useRoleAccess } from "@/hooks/use-role-access";
import { MOBILE_PRIMARY_CTA } from "@shared/feature-registry";
import { cn } from "@/lib/utils";
import { AuthButtons } from "@/components/AuthButtons";

type NavItem = {
  /** i18n key, resolved at render. */
  labelKey: string;
  /** English fallback for registry-supplied keys (role CTA). */
  defaultLabel?: string;
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
const MIDDLE_CANDIDATES: (NavItem & { key: string })[] = [
  { labelKey: "labels.jobs", href: "/jobs", icon: Briefcase, key: "nav:jobs" },
  { labelKey: "labels.resumes", href: "/resumes", icon: FileText, key: "nav:resumes" },
  { labelKey: "labels.studio", href: "/studio", icon: Video, key: "nav:studio" },
  { labelKey: "labels.people", href: "/people", icon: Users, key: "nav:people" },
  { labelKey: "nav.links.tools", href: "/tools", icon: Wrench, key: "nav:tools" },
];

const HOME: NavItem = { labelKey: "labels.home", href: "/", icon: Home };
const DASHBOARD: NavItem = { labelKey: "labels.dashboard", href: "/dashboard", icon: TrendingUp };

/** Icon-name → component for the per-role mobile CTA (#2048). */
const CTA_ICONS: Record<string, LucideIcon> = { PlusSquare, Shield };

export default function MobileBottomNav() {
  const location = useLocation();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { canSee, role } = useRoleAccess();

  // Per-role primary CTA (employer → Post Job, staff → Admin). Takes one slot,
  // leaving 2 for visible middle items so the bar stays at 5 (#2048).
  const ctaDef = MOBILE_PRIMARY_CTA[role];
  const cta: NavItem | null = ctaDef
    ? {
        labelKey: ctaDef.labelKey,
        defaultLabel: ctaDef.label,
        href: ctaDef.href,
        icon: CTA_ICONS[ctaDef.icon] ?? PlusSquare,
        accent: true,
      }
    : null;

  const middle = MIDDLE_CANDIDATES.filter((c) => canSee(c.key)).slice(0, cta ? 2 : 3);

  const items: NavItem[] = [HOME, ...(cta ? [cta] : []), ...middle, DASHBOARD];

  // Studio editor routes (/studio/new, /studio/:id) are chrome-free.
  if (isStudioEditorPath(location.pathname)) return null;

  // Signed out, the bar is the two account CTAs (consolidated-header mockup,
  // Mobile board) — the same <AuthButtons> the desktop header and the phone
  // menu render; discovery links live in the hamburger menu.
  if (!isAuthenticated) {
    return (
      <>
        {/* Same 4rem footprint as the signed-in bar (AppShell reserves it). */}
        <div className="h-16 md:hidden print:hidden" data-print-hide />
        <nav
          data-print-hide
          className="fixed bottom-0 left-0 right-0 z-30 md:hidden print:hidden border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
          aria-label={t("nav.mobile.ariaLabel")}
        >
          <div className="px-4 pt-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
            <AuthButtons layout="bar" />
          </div>
        </nav>
      </>
    );
  }

  return (
    <>
    {/* Spacer so page content is never hidden behind the fixed bar. */}
    <div className="h-16 md:hidden print:hidden" data-print-hide />
    <nav
      data-print-hide
      className="fixed bottom-0 left-0 right-0 z-30 md:hidden print:hidden bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border"
      role="navigation"
      aria-label={t("nav.mobile.ariaLabel")}
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
                      ? cn(
                          "mx-1 my-1 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 font-semibold",
                          // Even the prominent CTA reflects the current route, so it
                          // doesn't read as permanently "selected" (#2048).
                          active && "ring-2 ring-primary/40 ring-offset-1 ring-offset-background"
                        )
                      : active
                        ? "rounded-lg bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className={cn("h-5 w-5", active && !item.accent && "text-primary")} />
                  <span>{t(item.labelKey, { defaultValue: item.defaultLabel })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
    </>
  );
}
