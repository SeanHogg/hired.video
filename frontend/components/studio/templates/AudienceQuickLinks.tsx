// Horizontal strip of audience chips → `/for/:audience` marketing pages.
//
// Per the standing DRY rule, the component reads the `AUDIENCES` registry
// directly. Never accept an `audiences` prop from a parent — adding an
// audience to audiences.ts makes it appear on every surface that mounts
// this strip automatically (no prop drilling, no parallel filter lists).
//
// Consumed by:
//   - /studio (StudioLanding) — discovery row above the template grid
//   - any future surface that wants audience-based navigation

import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AUDIENCES } from "./audiences";
import { cn } from "@/lib/utils";

export interface AudienceQuickLinksProps {
  className?: string;
  /** Optional header above the chip row. Defaults to "Browse by audience". */
  title?: string;
}

export function AudienceQuickLinks({
  className,
  title = "Browse by audience",
}: AudienceQuickLinksProps): JSX.Element {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Users className="h-3 w-3" /> {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {AUDIENCES.map((a) => (
          <Link key={a.id} to={`/for/${a.id}`}>
            <Badge
              variant="outline"
              className="cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              {a.label}
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}
