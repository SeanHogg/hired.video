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
import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";
import { AUDIENCES } from "@/lib/studio/templates/audiences";
import { localizeAudience } from "@/lib/studio/localize-audience";
import { cn } from "@/lib/utils";

/** Pill link in the same idle style as PillChip (components/content/ChipFilterRow). */
const AUDIENCE_PILL =
  "inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border border-input bg-card px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface AudienceQuickLinksProps {
  className?: string;
  /** Optional header above the chip row. Defaults to "Browse by audience". */
  title?: string;
}

export function AudienceQuickLinks({ className, title }: AudienceQuickLinksProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <nav aria-label={title ?? t("audienceQuickLinks.title")} className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
        <Users className="h-3.5 w-3.5" aria-hidden="true" /> {title ?? t("audienceQuickLinks.title")}
      </div>
      <div className="flex flex-wrap gap-2">
        {AUDIENCES.map((a) => (
          <Link key={a.id} to={`/for/${a.id}`} className={AUDIENCE_PILL}>
            {localizeAudience(a, t).label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
