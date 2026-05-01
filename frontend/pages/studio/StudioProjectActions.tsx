/**
 * StudioProjectActions — action cluster for the active studio project.
 *
 * Lives INLINE inside the active row of StudioSidebar's Recent list. Title
 * and status are rendered by the sidebar row itself (so the active project
 * has one source of truth in the top-left), and this component contributes
 * just the buttons:
 *
 *   ┌──────────────────────────────────────┐
 *   │  [ Save & Re-render — primary ]      │
 *   │  [⚙ render] [↗ share] [⋯ more]       │
 *   └──────────────────────────────────────┘
 *
 * All decisions about WHEN actions are reachable (e.g. Share is disabled
 * until a video exists) stay co-located with the buttons here so the
 * sidebar row stays a thin slot. Save is the only primary CTA — it runs
 * the full save → generate → render pipeline owned by the parent.
 */

import {
  Check,
  ExternalLink,
  Globe,
  Lock,
  Share2,
  Store,
  Upload,
  UserCheck,
  Wand2,
  MoreHorizontal,
} from "lucide-react";
import DownloadButton from "@/components/studio/DownloadButton";
import SaveButton from "@/components/studio/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StudioProjectState } from "@/types/studio";
import type { CompiledVideo } from "@/lib/compiler/types";

interface Props {
  state: StudioProjectState;
  compiledVideo: CompiledVideo | null;
  isPublic: boolean;
  isPublishedToProfile: boolean;
  profileUrl?: string;
  /** Primary CTA — runs the full save + generate + render pipeline. */
  onSave: () => void;
  onPublish: () => void;
  onPublishToProfile: () => void;
  onLinkedInPublish: () => void;
  onMakePublic: (pub: boolean) => void;
  onDownloadLocal?: () => void;
  removeBranding?: boolean;
  onRemoveBrandingChange?: (next: boolean) => void;
  isPro?: boolean;
  onPublishAsTemplate?: () => void;
}

export default function StudioProjectActions({
  state,
  compiledVideo,
  isPublic,
  isPublishedToProfile,
  profileUrl,
  onSave,
  onPublish,
  onPublishToProfile,
  onLinkedInPublish,
  onMakePublic,
  onDownloadLocal,
  removeBranding = false,
  onRemoveBrandingChange,
  isPro = false,
  onPublishAsTemplate,
}: Props) {
  const busy = ["generating", "exporting", "uploading", "publishing"].includes(state.status);
  const hasVideo = state.videoBlob != null || state.videoUrl != null;
  const hasYoutube = state.youtubeVideoId != null;

  // Click-to-stop propagation on the wrapping div + dropdown triggers — the
  // active row is itself a button (clicking switches projects), so we
  // don't want clicks inside the action cluster to bubble up.
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="flex flex-col gap-1.5 mt-1.5" onClick={stop}>
      {/* Save — primary CTA. SaveButton owns the busy/label/icon logic so
          the same component drops into the player row at compact size. */}
      <SaveButton state={state} onSave={onSave} variant="block" />

      {/* Icon row — render / [download] / share / more. Equal width so the
          cluster reads as one control group rather than loose buttons.
          Download surfaces itself when the user qualifies (Pro / creator /
          superadmin) and there's a video to download — see DownloadButton
          for the full gate. */}
      <div className="flex items-center gap-1">
        <DownloadButton
          state={state}
          onDownload={onDownloadLocal}
          iconOnly
          className="h-7 flex-1"
        />

        {/* Render options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="h-7 flex-1"
              title="Render options"
              disabled={busy}
              onClick={stop}
            >
              <Wand2 className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Render options
            </DropdownMenuLabel>
            <div
              className="px-2 py-1.5"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="row-remove-branding" className="text-xs leading-tight block">
                    Remove hired.video branding
                  </Label>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    {isPro ? (
                      "Drops the intro card, outro card, and watermark."
                    ) : (
                      <>
                        Pro plan only —{" "}
                        <a href="/pricing" className="underline hover:text-primary">
                          upgrade
                        </a>{" "}
                        to remove the intro, outro, and watermark.
                      </>
                    )}
                  </p>
                </div>
                <Switch
                  id="row-remove-branding"
                  checked={isPro ? removeBranding : false}
                  disabled={!isPro}
                  onCheckedChange={(v) => onRemoveBrandingChange?.(v)}
                />
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Share */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="h-7 flex-1"
              title="Share"
              disabled={!hasVideo || busy}
              onClick={stop}
            >
              <Share2 className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Publish
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={onPublish} disabled={!hasVideo || busy}>
              <Upload className="w-3.5 h-3.5 mr-2" />
              {hasYoutube ? "Re-publish to YouTube" : "Publish to YouTube"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onLinkedInPublish} disabled={!hasVideo || busy}>
              <Share2 className="w-3.5 h-3.5 mr-2" /> Publish to LinkedIn
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPublishToProfile} disabled={!hasVideo || busy}>
              {isPublishedToProfile ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-2" /> Published to Profile
                </>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5 mr-2" /> Publish to Profile
                </>
              )}
            </DropdownMenuItem>
            {isPublishedToProfile && profileUrl && (
              <DropdownMenuItem asChild>
                <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 mr-2" /> View Profile
                </a>
              </DropdownMenuItem>
            )}
            {hasVideo && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Visibility
                </DropdownMenuLabel>
                <div
                  className="flex items-center justify-between px-2 py-1.5 text-xs"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <span className="flex items-center gap-1.5">
                    {isPublic ? (
                      <Globe className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Lock className="w-3 h-3 text-muted-foreground" />
                    )}
                    {isPublic ? "Public" : "Make public"}
                  </span>
                  <Switch checked={isPublic} onCheckedChange={onMakePublic} />
                </div>
                {isPublic && state.projectId && (
                  <div
                    className="flex items-center gap-1 px-2 pb-2"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <Input
                      readOnly
                      className="h-6 text-[10px] flex-1 font-mono"
                      value={`https://hired.video/v/${state.projectId}`}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px] shrink-0"
                      onClick={() =>
                        navigator.clipboard.writeText(`https://hired.video/v/${state.projectId}`)
                      }
                    >
                      Copy
                    </Button>
                  </div>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* More — publish-as-template + future per-project actions */}
        {onPublishAsTemplate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="h-7 flex-1"
                title="More actions"
                disabled={busy}
                onClick={stop}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem
                onClick={onPublishAsTemplate}
                disabled={!state.projectId || !state.script}
              >
                <Store className="w-3.5 h-3.5 mr-2" />
                Publish as Marketplace Template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
