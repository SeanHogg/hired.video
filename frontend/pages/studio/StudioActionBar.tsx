// StudioActionBar.tsx — compact horizontal version of the 3-step action stepper
// (Generate Script · Generate Video · Share). Designed to live as a footer
// strip under the editor tab bar — single row, minimal height.

import { Check, Sparkles, Upload, Share2, UserCheck, Loader2, Globe, Lock, ExternalLink, ChevronDown, Download, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import type { StudioProjectState } from "@/types/studio";
import type { CompiledVideo } from "@/lib/compiler/types";

interface Props {
  state: StudioProjectState;
  compiledVideo: CompiledVideo | null;
  exportProgress: number;
  hasShared: boolean;
  isPublic: boolean;
  isPublishedToProfile: boolean;
  profileUrl?: string;
  onGenerate: () => void;
  onExport: () => void;
  onPublish: () => void;
  onPublishToProfile: () => void;
  onLinkedInPublish: () => void;
  onMakePublic: (pub: boolean) => void;
  onDownloadLocal?: () => void;
  /** Pro-only opt-out: when true, drop the intro/outro/watermark from rendered video. */
  removeBranding?: boolean;
  onRemoveBrandingChange?: (next: boolean) => void;
  /** Drives whether the branding toggle is enabled (free users see it disabled). */
  isPremium?: boolean;
}

export default function StudioActionBar({
  state,
  compiledVideo,
  exportProgress,
  hasShared,
  isPublic,
  isPublishedToProfile,
  profileUrl,
  onGenerate,
  onExport,
  onPublish,
  onPublishToProfile,
  onLinkedInPublish,
  onMakePublic,
  onDownloadLocal,
  removeBranding = false,
  onRemoveBrandingChange,
  isPremium = false,
}: Props) {
  const busy = ["generating", "exporting", "uploading", "publishing"].includes(state.status);
  const hasScript = !!state.script;
  const hasVideo = state.videoBlob != null || state.videoUrl != null;
  const hasYoutube = state.youtubeVideoId != null;
  const canGenerate = state.resumeText.trim().length > 50;

  const step1Done = hasScript;
  const step1Active = !hasScript || state.status === "generating";
  const step2Done = hasVideo;
  const step2Active = hasScript && !hasVideo && state.status !== "generating";
  const step3Done = hasShared;
  const step3Active = hasVideo && !hasShared;

  function badgeClass(done: boolean, active: boolean) {
    return `shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
      done
        ? "bg-emerald-500 text-white"
        : active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground"
    }`;
  }

  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b bg-muted/20">
      {/* Step 1 — Generate Script */}
      <Button
        size="sm"
        className="h-8 flex-1 min-w-0 text-xs gap-1.5"
        onClick={onGenerate}
        disabled={!canGenerate || busy}
        title={!canGenerate ? "Add resume text in the Prompt tab" : undefined}
      >
        <span className={badgeClass(step1Done, step1Active)}>
          {step1Done ? <Check className="w-3 h-3" /> : 1}
        </span>
        {state.status === "generating" ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" /> Generating…
          </>
        ) : (
          <>
            <Sparkles className="w-3 h-3" />
            <span className="truncate">{hasScript ? "Regenerate Script" : "Generate Script"}</span>
          </>
        )}
      </Button>

      {/* Step 2 — Generate Video */}
      <Button
        size="sm"
        className="h-8 flex-1 min-w-0 text-xs gap-1.5"
        onClick={onExport}
        disabled={!compiledVideo || busy}
      >
        <span className={badgeClass(step2Done, step2Active)}>
          {step2Done ? <Check className="w-3 h-3" /> : 2}
        </span>
        {state.status === "exporting" || state.status === "uploading" ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            {state.status === "exporting" ? `${Math.round(exportProgress * 100)}%` : "Uploading…"}
          </>
        ) : (
          <>
            <Sparkles className="w-3 h-3" />
            <span className="truncate">{hasVideo ? "Re-generate Video" : "Generate Video"}</span>
          </>
        )}
      </Button>

      {/* Step 3 — Share (dropdown menu with all sub-actions) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="h-8 flex-1 min-w-0 text-xs gap-1.5"
            disabled={!hasVideo || busy}
          >
            <span className={badgeClass(step3Done, step3Active)}>
              {step3Done ? <Check className="w-3 h-3" /> : 3}
            </span>
            <Share2 className="w-3 h-3" />
            <span className="truncate">Share</span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
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
          {onDownloadLocal && hasVideo && (
            <DropdownMenuItem onClick={onDownloadLocal}>
              <Download className="w-3.5 h-3.5 mr-2" /> Download Local Copy
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

      {/* Render options — Pro-only branding opt-out lives here so it stays
           discoverable for free users (toggle is disabled with an upgrade
           link, demonstrating the gate). */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0"
            title="Render options"
            disabled={busy}
          >
            <Wand2 className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
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
                <Label
                  htmlFor="actionbar-remove-branding"
                  className="text-xs leading-tight block"
                >
                  Remove hired.video branding
                </Label>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  {isPremium
                    ? "Drops the intro card, outro card, and watermark."
                    : (
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
                id="actionbar-remove-branding"
                checked={isPremium ? removeBranding : false}
                disabled={!isPremium}
                onCheckedChange={(v) => onRemoveBrandingChange?.(v)}
              />
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
