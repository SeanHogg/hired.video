/**
 * StudioShareMenu — dropdown for sharing / publishing a studio project.
 *
 * Visible mirror of v1's Share menu (Publish to YouTube / LinkedIn /
 * Profile + copy-link), but the heavy items are gated by callbacks so
 * the v2 editor — which doesn't yet own a render pipeline — can mount
 * the same component and pass only the link-copy handler. Self-gates:
 * items with no callback render disabled with a "Coming soon" hint.
 *
 * Per the DRY rule: every "Share" surface mounts THIS component.
 * Adding a publish destination is one entry here and both editors pick
 * it up. No consumer re-derives the "is YouTube ready" gate — the
 * `hasVideo` boolean is the single signal.
 */
import { useState } from "react";
import {
  Copy,
  Check,
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
   *  reach. v2 projects are currently always false until the render
   *  pipeline ships. */
  hasVideo: boolean;
  isPublishedToProfile?: boolean;
  /** Optional callbacks. When ABSENT the menu item self-disables with a
   *  "Coming soon" hint — no prop-drilled `canPublish` boolean. */
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
    : "Render the video first to enable publishing.";

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
    </DropdownMenu>
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
