/**
 * StudioSaveMenuV2 — Save split-button for the v2 editor header.
 *
 * Geometry mirrors v1's SaveButton:
 *   ┌──────────┬────┐
 *   │  Save    │ ▼  │
 *   └──────────┴────┘
 *
 * The primary action is "Save" (persist draft — no rendering). The chevron
 * opens the dropdown of everything else the user might want to do with the
 * project: export (rendered output) + share + publish.
 *
 * The dropdown is driven by `mediaKind` per the standing DRY rule
 * (#894 / docs/prd/studio-media-kinds.md):
 *   - Export row label reads `MEDIA_KIND_UI[mediaKind].exportVerb` so
 *     podcast projects show "Export episode", animation shows
 *     "Export loop", etc. — one verb table, every consumer reads it.
 *   - Publish rows iterate `publishDestinationsFor(mediaKind)` and look
 *     up each destination's handler in `publishHandlers`. Destinations
 *     with no handler self-disable with a "soon" hint; destinations that
 *     don't apply to this mediaKind don't render at all. ONE menu,
 *     every kind self-gates from one record.
 *
 * Items self-disable: copy link is greyed until the project has been
 * persisted; publish items disable when their callback isn't supplied.
 * No prop-drilled `canX` booleans.
 *
 * Per DRY: the primary visual is the shared <StudioSaveButton> primitive,
 * same as v1's SaveButton wrapper — busy/icon/label changes propagate to
 * both editors.
 */
import { useState } from "react";
import {
  ChevronDown,
  Copy,
  Check,
  Download,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import StudioSaveButton from "@/components/studio/shared/StudioSaveButton";
import PublishedToList from "@/components/studio/v2/PublishedToList";
import { destinationIcon } from "@/lib/studio/publish-destination-meta";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { StudioPublication } from "@/lib/services/studio-service";
import {
  MEDIA_KIND_UI,
  publishDestinationsFor,
  type MediaKind,
  type PublishDestinationId,
} from "@shared/media-kinds";

type PublishHandlers = Partial<Record<PublishDestinationId, () => void>>;

interface StudioSaveMenuV2Props {
  saving: boolean;
  onSave: () => void;
  hasContent: boolean;
  /** Project's output axis (#894). Drives the export verb + which
   *  publish rows render. ONE field, every visibility decision. */
  mediaKind: MediaKind;
  /** Persisted project id — needed for the editor link. Null until the
   *  first save. */
  projectId: string | null;
  /** Vanity slug from the project's storyboard metadata. When present,
   *  the public-share URL is `/v/${slug}`; when absent, it falls back
   *  to `/v/${projectId}`. Single source of truth so a future addition
   *  of slug-derived URLs (sitemap, OG worker, social cards) doesn't
   *  re-derive the rule. */
  slug?: string | null;
  /** True once a rendered output (MP4 / MP3 / GIF) lives in the project
   *  row; affects publish item hints. */
  hasVideo: boolean;
  isPublishedToProfile?: boolean;
  /** Export = render + download the project's bound output (MP4 / MP3 /
   *  GIF, per `mediaKind`). The picker for which profile within the kind
   *  lives elsewhere (timeline.outputProfile / project codec setting). */
  onExport: () => void;
  exporting: boolean;
  /** Publish handlers keyed by destination id. ANY destination not in
   *  this map self-disables with a "soon" hint; destinations that don't
   *  apply to this `mediaKind` don't render. Per DRY — caller doesn't
   *  pass `canPublishToYouTube`; the menu derives from
   *  `publishDestinationsFor(mediaKind)` and looks up handlers by id. */
  publishHandlers?: PublishHandlers;
  /** Where this project has already been published (#1920). Drives the
   *  "Published to" section at the top of the dropdown — each row links to
   *  the live destination + offers Re-publish. Self-gates: the section
   *  hides when empty. The editor fetches these once via `usePublications`
   *  and shares them with the Details drawer (DRY). */
  publications?: StudioPublication[];
  /** Re-publish a destination from the "Published to" list. Called with the
   *  destination id; the editor maps it back to the right publish handler. */
  onRepublish?: (destination: string) => void;
  /** Destination id currently re-publishing — spins that row. */
  republishing?: string | null;
  /** Project-lifecycle rows (clone / delete / templates) rendered as a
   *  "More" group at the bottom of the dropdown — supplied by
   *  `useProjectChrome().items`. When absent the group doesn't render.
   *  Consolidates what used to be a separate `…` overflow trigger into
   *  this one Save cluster. */
  moreItems?: React.ReactNode;
  /** The modal surfaces that pair with `moreItems`
   *  (`useProjectChrome().dialogs`). Rendered OUTSIDE the dropdown content
   *  because Radix unmounts content children on close — an item click that
   *  opens a dialog would otherwise tear the dialog down with the menu. */
  moreDialogs?: React.ReactNode;
  className?: string;
}

export default function StudioSaveMenuV2({
  saving,
  onSave,
  hasContent,
  mediaKind,
  projectId,
  slug,
  hasVideo,
  isPublishedToProfile = false,
  onExport,
  exporting,
  publishHandlers,
  publications,
  onRepublish,
  republishing,
  moreItems,
  moreDialogs,
  className,
}: StudioSaveMenuV2Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<"editor" | "share" | null>(null);

  async function copyTo(kind: "editor" | "share") {
    if (!projectId) return;
    const url =
      kind === "share"
        ? `${window.location.origin}/v/${encodeURIComponent(slug || projectId)}`
        : `${window.location.origin}/studio/${encodeURIComponent(projectId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(kind);
      toast({ title: kind === "share" ? "Share link copied" : "Editor link copied" });
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast({ title: "Couldn't copy link", variant: "destructive" });
    }
  }

  const ui = MEDIA_KIND_UI[mediaKind];
  const destinations = publishDestinationsFor(mediaKind);

  const publishHint = hasVideo
    ? `Publishes the rendered ${ui.badgeLabel.toLowerCase()} to the chosen destination.`
    : "Renders + uploads first, then publishes to the chosen destination.";

  // Busy state covers both the draft save and the render — either one in
  // flight should grey the cluster so the user can't fire a second action
  // on top of an active pipeline.
  const busy = saving || exporting;

  return (
    <div className={cn("inline-flex", className)}>
      <StudioSaveButton
        saving={busy}
        onSave={onSave}
        hasContent={hasContent}
        variant="compact"
        splitLeft
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            className="h-7 rounded-l-none border-l border-primary-foreground/20 px-1.5 shrink-0"
            disabled={busy}
            onClick={(e) => e.stopPropagation()}
            aria-label="Save options"
            title="Save options"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {/* "Published to" — where this project already lives, with View
              links + Re-publish. Self-gates: PublishedToList returns null
              when there are no live publications, so drafts / never-published
              projects don't see an empty section. Wrapped so the divider only
              shows alongside it. */}
          {publications && publications.some((p) => p.status === "published") && (
            <>
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Published to
              </DropdownMenuLabel>
              <div className="px-1 pb-1">
                <PublishedToList
                  publications={publications}
                  variant="compact"
                  onRepublish={onRepublish}
                  republishing={republishing}
                />
              </div>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Export
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              onExport();
            }}
            disabled={exporting || !hasContent}
            title={hasContent ? `Render + download ${ui.badgeLabel.toLowerCase()}` : "Add a widget to export"}
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 mr-2" />
            )}
            {exporting ? "Exporting…" : ui.exportVerb}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Share
          </DropdownMenuLabel>
          {/* Two link variants: the public share URL (what you'd send
              a viewer — uses the vanity slug when one exists) and the
              editor URL (for collaborators with edit access). The slug
              field itself is editable via the Details drawer's Slug
              input, so the menu doesn't duplicate that surface. */}
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              void copyTo("share");
            }}
            disabled={!projectId}
            title={
              !projectId
                ? "Save the project first to get a link"
                : `/v/${slug || projectId}`
            }
          >
            {copied === "share" ? (
              <Check className="w-3.5 h-3.5 mr-2 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5 mr-2" />
            )}
            {projectId ? "Copy share link" : "Save first to get a link"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              void copyTo("editor");
            }}
            disabled={!projectId}
            title={!projectId ? "Save the project first to get a link" : undefined}
          >
            {copied === "editor" ? (
              <Check className="w-3.5 h-3.5 mr-2 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5 mr-2" />
            )}
            Copy editor link
          </DropdownMenuItem>

          {/* Publish section self-hides when the kind has no destinations
              (e.g. `document` → résumé PDF: nothing to publish to YouTube /
              RSS / a gallery). Per DRY the menu derives this from
              `publishDestinationsFor(mediaKind)` — no caller-passed flag. */}
          {destinations.length > 0 && (
            <>
              <DropdownMenuSeparator />

              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Publish
              </DropdownMenuLabel>
              <p className="text-[10px] text-muted-foreground px-2 pb-1.5 leading-tight">
                {publishHint}
              </p>

              {destinations.map((dest) => {
                // The Profile destination flips its verb based on the
                // already-published state. Every other destination uses the
                // registry's static label. ONE label-source per row.
                const baseLabel = dest.id === "profile"
                  ? (isPublishedToProfile ? "Remove from profile" : "Publish to profile")
                  : `Publish to ${dest.label}`;
                return (
                  <PublishItem
                    key={dest.id}
                    icon={destinationIcon(dest.id)}
                    label={baseLabel}
                    onClick={publishHandlers?.[dest.id]}
                    hasVideo={hasVideo}
                  />
                );
              })}
            </>
          )}

          {/* More — project-lifecycle + template actions (clone / delete /
              publish-as-template). Folded into this dropdown so the header
              shows ONE Save cluster instead of a separate `…` trigger. The
              group self-hides when the host supplies nothing (e.g. an
              unsaved draft). */}
          {moreItems && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                More
              </DropdownMenuLabel>
              {moreItems}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Dialogs that pair with `moreItems` live outside the dropdown so
          they survive the menu closing on item click (see prop docs). */}
      {moreDialogs}
    </div>
  );
}

function PublishItem({
  icon: Icon,
  label,
  onClick,
  hasVideo,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: (() => void) | undefined;
  hasVideo: boolean;
}) {
  const disabled = !onClick;
  return (
    <DropdownMenuItem
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Coming soon — render pipeline pending" : !hasVideo ? "Will render + upload, then publish" : undefined}
    >
      <Icon className="w-3.5 h-3.5 mr-2" />
      {label}
      {disabled && (
        <span className="ml-auto text-[10px] text-muted-foreground">soon</span>
      )}
    </DropdownMenuItem>
  );
}
