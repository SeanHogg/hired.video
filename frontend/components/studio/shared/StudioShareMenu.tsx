/**
 * StudioShareMenu — split-button for exporting / sharing / publishing a
 * studio project. Mounts on the editor header.
 *
 * Geometry:
 *   ┌─────────────┬────┐
 *   │  Export     │ ▼  │   primary action on the left, dropdown on the right
 *   └─────────────┴────┘
 *
 * The primary action is "Export" (download the rendered file locally)
 * when `onExport` is wired. The chevron opens a dropdown grouping
 * everything else the user might want to do with the project:
 *
 *   • Share         — copy the editor link
 *   • Publish       — YouTube / LinkedIn / Profile (self-disabled
 *                     when their callback isn't supplied)
 *
 * When `onExport` is NOT provided the component falls back to a single
 * Share-only trigger (no primary action) so legacy mounts keep working.
 *
 * Per the standing DRY rule: every "Export / Share / Publish" surface
 * in the studio mounts THIS component. Adding a publish destination is
 * one entry here and both editors pick it up. Consumers don't re-derive
 * the "is publish ready" gate — the `hasVideo` boolean is the single
 * signal, and items with no callback self-disable.
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface StudioShareMenuProps {
  /** Persisted project id. When null the share menu still renders (Copy
   *  link is the only useful action), but the link copy button shows
   *  "Save first" and is disabled. */
  projectId: string | null;
  /** True when the project has a rendered MP4 the publish items can
   *  reach. v2 projects flip to true once `ensureRendered` has uploaded. */
  hasVideo: boolean;
  isPublishedToProfile?: boolean;
  /** Primary action — when present the component renders as a split
   *  button with this on the left and the share/publish dropdown on the
   *  right. When absent the trigger is a single Share button. */
  onExport?: () => void;
  /** True while an export / render / upload is in flight — flips the
   *  primary action label to "Exporting…" and disables it. */
  exporting?: boolean;
  /** Right's disabled when the canvas is empty — guards against
   *  rendering a blank project. */
  canExport?: boolean;
  /** Optional callbacks. When ABSENT the matching menu item self-disables
   *  with a "Coming soon" hint — no prop-drilled `canPublish` boolean. */
  onPublishToYouTube?: () => void;
  onPublishToLinkedIn?: () => void;
  onPublishToProfile?: () => void;
  /** Override the link-copy target. Defaults to
   *  `${origin}/studio/${projectId}` (the editor URL — useful for
   *  collaborators with edit access). */
  linkBuilder?: (projectId: string) => string;
  className?: string;
}

export default function StudioShareMenu({
  projectId,
  hasVideo,
  isPublishedToProfile = false,
  onExport,
  exporting = false,
  canExport = true,
  onPublishToYouTube,
  onPublishToLinkedIn,
  onPublishToProfile,
  linkBuilder,
  className,
}: StudioShareMenuProps) {
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
      toast({
        title: "Couldn't copy link",
        variant: "destructive",
      });
    }
  }

  const publishHint = hasVideo
    ? "Publishes the rendered video to the chosen destination."
    : "Renders + uploads first, then publishes to the chosen destination.";

  const splitMode = !!onExport;

  // Menu content is identical in both modes — the only difference is
  // whether we render a standalone Share trigger or a split button with
  // Export on the left + chevron on the right.
  const menu = (
    <DropdownMenuContent align="end" className="w-64">
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
  );

  if (!splitMode) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className={cn("h-8 gap-1", className)}
            title="Share"
          >
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    );
  }

  // Split-button: primary "Export" on the left, chevron-trigger on the
  // right. Inner-edge corners are squared so the cluster reads as a
  // single control — same shape as v1's SaveButton split.
  return (
    <div className={cn("inline-flex", className)}>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1 rounded-r-none border-r-0"
        onClick={onExport}
        disabled={exporting || !canExport}
        title={canExport ? "Export MP4" : "Add a widget to export"}
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {exporting ? "Exporting…" : "Export"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-7 rounded-l-none px-1"
            aria-label="Share & publish options"
            title="Share & publish options"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        {menu}
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
