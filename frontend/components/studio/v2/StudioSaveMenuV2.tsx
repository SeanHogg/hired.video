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
 * project, replacing the separate Export + Share + Publish buttons the v2
 * header used to surface:
 *
 *   • Export MP4    — render + download locally
 *   • Copy link     — share the editor URL
 *   • Publish to YouTube / LinkedIn / Profile
 *
 * Items self-disable: copy link is greyed until the project has been
 * persisted; publish items disable when their callback isn't supplied
 * ("Coming soon" hint). No prop-drilled `canX` booleans.
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

export interface StudioSaveMenuV2Props {
  saving: boolean;
  onSave: () => void;
  hasContent: boolean;
  /** Persisted project id — needed for the editor link. Null until the
   *  first save. */
  projectId: string | null;
  /** True once a rendered MP4 lives in the project row; affects publish
   *  item hints. */
  hasVideo: boolean;
  isPublishedToProfile?: boolean;
  /** Export = render + download MP4. */
  onExport: () => void;
  exporting: boolean;
  /** Publish callbacks. When ABSENT the matching item self-disables with
   *  a "soon" hint — no prop-drilled `canPublish` boolean. */
  onPublishToYouTube?: () => void;
  onPublishToLinkedIn?: () => void;
  onPublishToProfile?: () => void;
  /** Override the link-copy target. Defaults to the editor URL. */
  linkBuilder?: (projectId: string) => string;
  className?: string;
}

export default function StudioSaveMenuV2({
  saving,
  onSave,
  hasContent,
  projectId,
  hasVideo,
  isPublishedToProfile = false,
  onExport,
  exporting,
  onPublishToYouTube,
  onPublishToLinkedIn,
  onPublishToProfile,
  linkBuilder,
  className,
}: StudioSaveMenuV2Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!projectId) return;
    const url = linkBuilder
      ? linkBuilder(projectId)
      : `${window.location.origin}/studio/${encodeURIComponent(projectId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Link copied" });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Couldn't copy link", variant: "destructive" });
    }
  }

  const publishHint = hasVideo
    ? "Publishes the rendered video to the chosen destination."
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
            title={hasContent ? "Render + download MP4" : "Add a widget to export"}
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 mr-2" />
            )}
            {exporting ? "Exporting…" : "Export MP4"}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Share
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              void copyLink();
            }}
            disabled={!projectId}
            title={!projectId ? "Save the project first to get a link" : undefined}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 mr-2 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5 mr-2" />
            )}
            {projectId ? "Copy editor link" : "Save first to get a link"}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Publish
          </DropdownMenuLabel>
          <p className="text-[10px] text-muted-foreground px-2 pb-1.5 leading-tight">
            {publishHint}
          </p>

          <PublishItem
            icon={Upload}
            label="Publish to YouTube"
            onClick={onPublishToYouTube}
            hasVideo={hasVideo}
          />
          <PublishItem
            icon={Share2}
            label="Publish to LinkedIn"
            onClick={onPublishToLinkedIn}
            hasVideo={hasVideo}
          />
          <PublishItem
            icon={UserCheck}
            label={isPublishedToProfile ? "Remove from profile" : "Publish to profile"}
            onClick={onPublishToProfile}
            hasVideo={hasVideo}
          />
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
