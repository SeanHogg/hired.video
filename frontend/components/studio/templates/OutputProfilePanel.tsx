// "Exports as / Publishes to" panel for marketing surfaces.
//
// Per the standing DRY rule, this is the only consumer-facing component
// that interprets `outputProfilesFor` + `publishDestinationsFor` for the
// marketing layer. Both #900 (/for/:audience) and #901 (/templates/:slug)
// import it directly; never prop-drill `canExportMp3` / `canPublishToRss`
// booleans through the page tree — the component self-gates on `mediaKind`.
//
// Returns `null` when a kind has no profiles AND no destinations (impossible
// today but defensive against future kinds added without payload).

import { Download, Send } from "lucide-react";
import {
  MEDIA_KIND_UI,
  outputProfilesFor,
  publishDestinationsFor,
  type MediaKind,
} from "@shared/media-kinds";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface OutputProfilePanelProps {
  mediaKind: MediaKind;
  /** `panel` for hero blocks (full layout with badges); `inline` for card
   *  footers (single-line summary of counts). */
  variant?: "panel" | "inline";
  className?: string;
}

export function OutputProfilePanel({
  mediaKind,
  variant = "panel",
  className,
}: OutputProfilePanelProps): JSX.Element | null {
  const profiles = outputProfilesFor(mediaKind);
  const destinations = publishDestinationsFor(mediaKind);
  if (profiles.length === 0 && destinations.length === 0) return null;
  const ui = MEDIA_KIND_UI[mediaKind];

  if (variant === "inline") {
    const parts: string[] = [];
    if (profiles.length > 0) parts.push(`${profiles.length} export format${profiles.length === 1 ? "" : "s"}`);
    if (destinations.length > 0) parts.push(`${destinations.length} publish destination${destinations.length === 1 ? "" : "s"}`);
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        {parts.join(" · ")}
      </span>
    );
  }

  return (
    <div className={cn("rounded-lg border bg-card p-4 space-y-4", className)}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {ui.badgeLabel} project
      </div>
      {profiles.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium mb-2">
            <Download className="h-3.5 w-3.5 text-muted-foreground" />
            Exports as
          </div>
          <div className="flex flex-wrap gap-1.5">
            {profiles.map((p) => (
              <Badge
                key={p.id}
                variant={p.proOnly ? "outline" : "secondary"}
                className="text-xs font-normal"
              >
                {p.label}
                {p.proOnly ? " · Pro" : ""}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {destinations.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium mb-2">
            <Send className="h-3.5 w-3.5 text-muted-foreground" />
            Publishes to
          </div>
          <div className="flex flex-wrap gap-1.5">
            {destinations.map((d) => (
              <Badge key={d.id} variant="outline" className="text-xs font-normal">
                {d.label}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
