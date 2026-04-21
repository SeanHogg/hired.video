// RecruitTabs — top-of-page nav shared by the three /recruit surfaces.
// Keeps the sidebar to a single "Recruit" entry while still letting the
// recruiter hop between Candidates / Pitch Decks / Settings in one click.

import { Link, useLocation } from "react-router-dom";
import { LayoutPanelLeft, Settings, UserCheck } from "lucide-react";

const TABS = [
  { to: "/recruit/candidates", label: "Candidates", icon: UserCheck },
  { to: "/recruit/pitch-decks", label: "Pitch Decks", icon: LayoutPanelLeft },
  { to: "/recruit/settings", label: "Settings", icon: Settings },
] as const;

export default function RecruitTabs() {
  const location = useLocation();
  const activePrefix = (to: string) => location.pathname.startsWith(to);

  return (
    <nav className="mb-6 border-b">
      <ul className="flex gap-1 -mb-px">
        {TABS.map(({ to, label, icon: Icon }) => {
          const active = activePrefix(to);
          return (
            <li key={to}>
              <Link
                to={to}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
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
