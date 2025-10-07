import { Link, useLocation } from "react-router-dom";
import { Home, Briefcase, FileText, Users, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export default function MobileBottomNav() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const items = [
    { label: "Home", href: "/", icon: Home },
    { label: "Jobs", href: "/jobs", icon: Briefcase },
    { label: "Resumes", href: "/resumes", icon: FileText },
    { label: "People", href: "/people", icon: Users },
    isAuthenticated
      ? { label: "Dashboard", href: "/dashboard", icon: TrendingUp }
      : { label: "Login", href: "/login", icon: TrendingUp },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t border-border"
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
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className={cn("h-5 w-5", active && "text-primary")} />
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

