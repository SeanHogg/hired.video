import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Briefcase,
  FileText,
  Users,
  TrendingUp,
  LogIn,
  Video,
  PlusSquare,
  Share2,
  Shield,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePersonaPreview } from "@/providers/PersonaPreviewProvider";
import { USER_ROLES } from "@shared/user-roles";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  accent?: boolean;
};

/** Return the 5 footer items for the given role. Keeps Home first and the
 * primary authenticated destination (Dashboard) last for muscle memory. */
function itemsForRole(role: string | null, isAuthenticated: boolean): NavItem[] {
  if (!isAuthenticated) {
    return [
      { label: "Home", href: "/", icon: Home },
      { label: "Jobs", href: "/jobs", icon: Briefcase },
      { label: "Tools", href: "/tools", icon: Wrench },
      { label: "People", href: "/people", icon: Users },
      { label: "Login", href: "/login", icon: LogIn, accent: true },
    ];
  }

  switch (role) {
    case USER_ROLES.JOB_SEEKER:
      return [
        { label: "Home", href: "/", icon: Home },
        { label: "Jobs", href: "/jobs", icon: Briefcase },
        { label: "Resumes", href: "/resumes", icon: FileText },
        { label: "Studio", href: "/studio", icon: Video },
        { label: "Dashboard", href: "/dashboard", icon: TrendingUp },
      ];

    case USER_ROLES.EMPLOYER:
      return [
        { label: "Home", href: "/", icon: Home },
        { label: "Post Job", href: "/post-a-job", icon: PlusSquare },
        { label: "Jobs", href: "/jobs", icon: Briefcase },
        { label: "People", href: "/people", icon: Users },
        { label: "Dashboard", href: "/dashboard", icon: TrendingUp },
      ];

    case USER_ROLES.ADMIN:
    case USER_ROLES.SUPER_ADMIN:
      return [
        { label: "Home", href: "/", icon: Home },
        { label: "Jobs", href: "/jobs", icon: Briefcase },
        { label: "People", href: "/people", icon: Users },
        { label: "admin", href: "/admin/dashboard", icon: Shield },
        { label: "Dashboard", href: "/dashboard", icon: TrendingUp },
      ];

    case USER_ROLES.RECRUITER:
    default:
      // Recruiter + unknown/unset roles fall back to the original menu.
      return [
        { label: "Home", href: "/", icon: Home },
        { label: "Jobs", href: "/jobs", icon: Briefcase },
        { label: "Resumes", href: "/resumes", icon: FileText },
        { label: "People", href: "/people", icon: Users },
        { label: "Dashboard", href: "/dashboard", icon: TrendingUp },
      ];
  }
}

export default function MobileBottomNav() {
  const location = useLocation();
  const { isAuthenticated, user, impersonationSession } = useAuth();
  const { personaPreview } = usePersonaPreview();

  // Effective role mirrors Dashboard.tsx — impersonation > SuperAdmin preview > actual role.
  const effectiveRole: string | null =
    impersonationSession?.role ?? personaPreview ?? user?.role ?? null;

  const items = itemsForRole(effectiveRole, isAuthenticated);

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
