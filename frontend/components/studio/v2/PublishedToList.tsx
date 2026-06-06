/**
 * PublishedToList — "where has this project been published" (#1920).
 *
 * Renders one row per destination the project has gone live on, each with a
 * View link (YouTube watch URL / LinkedIn post / on-platform /v/ link) and an
 * optional Re-publish action. Shared between the Save menu (compact) and the
 * Details drawer (full) per the DRY rule — both read the same `publications`
 * the editor fetched once via `usePublications`; this component decides its
 * own visibility (returns null when there's nothing live to show).
 *
 * Icon + label come from the single `publish-destination-meta` record, so this
 * list and the Save menu's publish rows can't drift on how a destination looks.
 */
import { ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  destinationIcon,
  destinationLabel,
} from "@/lib/studio/publish-destination-meta";
import type { StudioPublication } from "@/lib/services/studio-service";

interface Props {
  publications: StudioPublication[];
  /** When set, renders a Re-publish button per row; called with the row's
   *  destination id. The parent decides whether a destination is re-publishable
   *  (returns early / no-ops for ones it can't handle). */
  onRepublish?: (destination: string) => void;
  /** Destination currently re-publishing — shows a spinner on that row. */
  republishing?: string | null;
  /** "compact" (Save menu dropdown) trims padding + hides the timestamp;
   *  "full" (Details drawer) shows the published date. */
  variant?: "compact" | "full";
  className?: string;
}

function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function PublishedToList({
  publications,
  onRepublish,
  republishing,
  variant = "full",
  className,
}: Props) {
  // Only surface live publications — a future "failed"/"pending" row would
  // need its own treatment, but today the recorder only writes "published".
  const live = publications.filter((p) => p.status === "published");
  if (live.length === 0) return null;

  const compact = variant === "compact";

  return (
    <ul className={cn("space-y-1", className)}>
      {live.map((pub) => {
        const Icon = destinationIcon(pub.destination);
        const label = destinationLabel(pub.destination);
        const busy = republishing === pub.destination;
        return (
          <li
            key={pub.destination}
            className={cn(
              "flex items-center gap-2 rounded-md border border-border bg-card",
              compact ? "px-2 py-1.5" : "px-3 py-2",
            )}
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">{label}</p>
              {!compact && (
                <p className="truncate text-[11px] text-muted-foreground">
                  Published {formatWhen(pub.publishedAt)}
                </p>
              )}
            </div>
            {pub.externalUrl && (
              <a
                href={pub.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-purple hover:underline shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View
              </a>
            )}
            {onRepublish && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-1.5 shrink-0"
                disabled={busy}
                onClick={() => onRepublish(pub.destination)}
                title={`Re-publish to ${label}`}
                aria-label={`Re-publish to ${label}`}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
