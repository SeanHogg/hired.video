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
  Share2,
  Upload,
  UserCheck,
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  MEDIA_KIND_UI,
  publishDestinationsFor,
  type MediaKind,
  type PublishDestinationId,
} from "@shared/media-kinds";

/** Icon mapping per publish destination — kept here (next to the only
 *  consumer) rather than in @shared/media-kinds because lucide is a
 *  frontend-only dep. ONE record drives the menu visual. */
const DESTINATION_ICON: Record<PublishDestinationId, React.ComponentType<{ className?: string }>> = {
  youtube:                Upload,
  linkedin:               Share2,
  profile:                UserCheck,
  rss:                    Upload,
  "apple-podcasts":       Upload,
  "spotify-creators":     Upload,
  "voice-marketplace":    Share2,
  "profile-audio-embed":  UserCheck,
  giphy:                  Share2,
  tenor:                  Share2,
  "r2-host":              Share2,
  // Game (#927) — itch.io / GitHub Pages / embed on hired.video.
  "itch-io":              Upload,
  "github-pages":         Upload,
  "game-web-embed":       Share2,
  // Comic (#929) — hired.video reader is the canonical surface;
  // Webtoon / Tapas are platform-specific distribution channels.
  "comic-reader":         UserCheck,
  "webtoon-feed":         Upload,
  "tapas-feed":           Upload,
};

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
                icon={DESTINATION_ICON[dest.id]}
                label={baseLabel}
                onClick={publishHandlers?.[dest.id]}
                hasVideo={hasVideo}
              />
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
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
