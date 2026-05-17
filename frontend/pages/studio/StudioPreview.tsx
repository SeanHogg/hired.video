// StudioPreview.tsx — right panel: unified <StudioPlayer/> + Save +
// Publish-to-* menu + visibility chip. Save persists + (optionally)
// generates the script; it does NOT render. Render happens lazily
// under any Publish-to-* action (LinkedIn / YouTube / Profile /
// Download) via the parent's `ensureRendered` helper.

import {
  Download, Upload, Share2, Globe, Lock, Loader2, Sparkles, Check, UserCheck, UserX, ExternalLink,
} from "lucide-react";
import type { StudioPurpose } from "@/lib/services/studio-service";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import StudioPlayerCanvas from "@/components/studio/StudioPlayerCanvas";
import SaveButton from "@/components/studio/SaveButton";
import { useExportProgress } from "@/lib/hooks/useExportProgress";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { isBakedFresh } from "@/lib/studio/baked-freshness";
import type { StudioProjectState } from "@/types/studio";
import type { CompiledVideo } from "@/lib/compiler/types";
import type { SceneElement, ElementBox } from "@/types/video-script";

interface Props {
  state: StudioProjectState;
  compiledVideo: CompiledVideo | null;
  playing: boolean;
  currentTime: number;
  onPlayPause: () => void;
  onTimeUpdate: (t: number) => void;
  /** Publish to YouTube. Renders on demand via parent's ensureRendered. */
  onPublish: () => void;
  /** Publish to / Remove from the user's public profile. Renders on demand. */
  onPublishToProfile: () => void;
  isPublishedToProfile?: boolean;
  profileUrl?: string;
  /** Publish to LinkedIn. Renders on demand. */
  onLinkedInPublish: () => void;
  onMakePublic: (pub: boolean) => void;
  isPublic: boolean;
  /** Download the rendered MP4. Renders on demand via parent's
   *  ensureRendered when no fresh blob/URL exists. */
  onDownloadLocal?: () => void;
  /** True after the user has actually used a Step 3 share action — drives the green check. */
  hasShared?: boolean;
  /** Free-form scene elements for the currently visible scene (drives the drag overlay). */
  overlayElements?: SceneElement[];
  /** Currently selected element id (drives overlay highlight + editor selection). */
  selectedElementId?: string | null;
  /** Called when the user clicks an element on the canvas. */
  onSelectElement?: (id: string | null) => void;
  /** Called as the user drags or resizes an element. */
  onUpdateElementBox?: (id: string, box: ElementBox) => void;
  /** Callback for the Generate button in the action stepper */
  onGenerate?: () => void;
  /** Show video canvas + playback controls (default: true) */
  showVideo?: boolean;
  /** Show status + export/publish/LinkedIn actions (default: true) */
  showActions?: boolean;
  /** Pro-only opt-out: drop the intro/outro/watermark from rendered video. */
  removeBranding?: boolean;
  onRemoveBrandingChange?: (next: boolean) => void;
  className?: string;
  /** Save handler (primary CTA also shown in the sidebar action cluster).
   *  Surfaced inline with the playback row so the user can save without
   *  scrolling back to the project list. The label is intentionally just
   *  "Save" — internally it runs the full save + generate + render pipeline,
   *  but that's an implementation detail the user shouldn't have to track. */
  onSave?: () => void;
  /** Threaded into SaveButton so its split-button toggles can write back
   *  into `script._meta.savePipelineDisabled`. */
  onScriptChange?: (next: import("@/types/video-script").VideoScript) => void;
  /** Fired when the video reaches its natural end. Parent typically pauses
   *  playback (`setPlaying(false)`) so the EndCapOverlay can take over. */
  onEnded?: () => void;
}

export default function StudioPreview({
  state, compiledVideo, playing, currentTime,
  onPlayPause, onTimeUpdate, onPublish, onPublishToProfile, isPublishedToProfile, profileUrl,
  onLinkedInPublish, onMakePublic, isPublic, onDownloadLocal, hasShared,
  overlayElements, selectedElementId, onSelectElement, onUpdateElementBox,
  onGenerate,
  showVideo = true, showActions = true,
  removeBranding = false, onRemoveBrandingChange,
  className,
  onSave,
  onScriptChange,
  onEnded,
}: Props) {
  // Self-gated. Pro-feature visibility shouldn't be passed in by a parent
  // that already has to remember to compute it correctly — the hook is the
  // single primitive (with built-in SA bypass). The branding end-cap
  // itself lives inside <StudioPlayer/> (it owns its own visibility too).
  const { isPro } = useSubscription();
  const busy = ["generating", "exporting", "uploading", "publishing"].includes(state.status);
  // Source of truth for "is the rendered MP4 still in sync?" — drives
  // the Publish-button copy ("Publish" vs "Re-render & publish") so it
  // can never disagree with what <StudioPlayer/> actually mounts.
  const bakedFresh = isBakedFresh({
    script: state.script,
    videoUrl: state.videoUrl,
    voiceover: state.voiceover,
    captions: state.captions,
    removeBranding: isPro && removeBranding,
  });
  // Read render progress from the same shared hook SaveButton uses, so any
  // progress indicator below stays in lock-step with the popover above.
  const exportProgress = useExportProgress();
  const hasYoutube = state.youtubeVideoId != null;
  const canGenerate = state.resumeText.trim().length > 50;

  // Template-aware hint for Step 1
  const purpose: StudioPurpose = state.purpose ?? "resume";
  const inputHint: Record<StudioPurpose, string> = {
    basic: "Describe your video in the Description tab",
    resume: "Add resume text in the Prompt tab",
    job_ad: "Add job details in the Prompt tab",
    company_promo: "Add company info in the Prompt tab",
    recruiter_brand: "Add brand details in the Prompt tab",
    product_launch: "Add product details in the Prompt tab",
    personal_brand: "Add your bio in the Prompt tab",
  };

  const statusLabel: Record<string, string> = {
    idle:       "",
    generating: "Generating script…",
    ready:      "Ready",
    exporting:  `Exporting… ${Math.round(exportProgress * 100)}%`,
    uploading:  "Uploading…",
    publishing: "Publishing to YouTube…",
    done:       "Published!",
    error:      "Something went wrong",
  };

  // Save button anchored to the right edge of the controls row —
  // secondary surface in case the user doesn't see Save in the active
  // Recent row. Threads into <StudioPlayerCanvas/> via its
  // `controlsRightSlot` prop so the public surface (which mounts the
  // same canvas) gets nothing in this slot without branching.
  const saveSlot = onSave ? (
    <SaveButton
      state={state}
      onSave={onSave}
      onScriptChange={onScriptChange}
      variant="compact"
    />
  ) : null;

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Canvas + playback — same <StudioPlayerCanvas/> the public
          /v/:id page mounts. Layout switches between the right-panel
          static card (showActions=true) and the center-panel height-fit
          mode (showActions=false). */}
      {showVideo && (
        <div className={showActions ? "border-b" : "flex flex-col flex-1 min-h-0"}>
          <StudioPlayerCanvas
            state={state}
            compiledVideo={compiledVideo}
            playing={playing}
            currentTime={currentTime}
            onPlayPause={onPlayPause}
            onTimeUpdate={onTimeUpdate}
            onEnded={onEnded}
            removeBrandingFlag={removeBranding}
            overlayElements={overlayElements}
            selectedElementId={selectedElementId}
            onSelectElement={onSelectElement}
            onUpdateElementBox={onUpdateElementBox}
            expandable
            layout={showActions ? "static" : "fill"}
            emptyLabel={state.status === "generating" ? "Generating…" : "Run to preview"}
            controlsRightSlot={saveSlot}
          />
        </div>
      )}

      {/* Status */}
      {showActions && busy && (
        <div className="px-4 py-3 border-b">
          <p className="text-xs text-muted-foreground mb-1">{statusLabel[state.status]}</p>
          {state.status === "exporting" && (
            <Progress value={exportProgress * 100} className="h-1" />
          )}
          {state.status !== "exporting" && (
            <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full w-1/3 bg-primary rounded-full animate-[slide_1s_ease-in-out_infinite]" />
            </div>
          )}
        </div>
      )}


      {/* Action stepper — two steps now:
          1. Generate Script  (auto-skipped on Save when a script exists)
          2. Publish          (Save + visibility live above the stepper;
                               Publish destinations render lazily via the
                               parent's ensureRendered. The old "Export
                               Video" middle step is gone — viewing
                               in-platform doesn't need a baked MP4
                               because <StudioPlayer/> plays JSON live.)
      */}
      {showActions && <div className="flex flex-col overflow-y-auto">
        {([
          { n: 1, title: "Generate Script", done: !!state.script, active: !state.script || state.status === "generating" },
          // Step 2 "done" still gates on the user having used a share
          // action — flipping visibility public doesn't count.
          { n: 2, title: "Publish",         done: !!hasShared,     active: !!state.script && !hasShared && state.status !== "generating" },
        ] as const).map(({ n, title, done, active }) => (
          <div key={n} className={`flex gap-3 px-4 py-3 border-b last:border-b-0 transition-colors ${active ? "bg-accent/20" : ""}`}>
            {/* Step badge */}
            <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 ${
              done  ? "bg-emerald-500 text-white"
              : active ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
            }`}>
              {done ? <Check className="w-3 h-3" /> : n}
            </div>

            {/* Step content */}
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <p className={`text-xs font-semibold leading-none mb-0.5 ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}>{title}</p>

              {n === 1 && (
                state.status === "generating" ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-0.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating script…
                  </div>
                ) : (
                  <>
                    <Button size="sm" className="w-full h-7 text-xs" onClick={onGenerate} disabled={!canGenerate || busy}>
                      <Sparkles className="w-3 h-3 mr-1.5" />
                      {state.script ? "Regenerate" : "Run"}
                    </Button>
                    {!canGenerate && (
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        {inputHint[purpose]}
                      </p>
                    )}
                  </>
                )
              )}

              {n === 2 && (
                <>
                  {/* Render progress banner — visible only while a Publish
                      action is actually rendering on demand. Replaces the
                      old explicit "Generate Video" button (gone — every
                      Publish destination renders lazily). */}
                  {(state.status === "exporting" || state.status === "uploading") && (
                    <div className="flex flex-col gap-1 px-1 py-1 rounded border border-border/50 bg-muted/30">
                      <p className="text-[10px] text-muted-foreground">{statusLabel[state.status]}</p>
                      <Progress value={exportProgress * 100} className="h-1" />
                    </div>
                  )}
                  {state.status === "publishing" && (
                    <p className="text-[10px] text-muted-foreground">{statusLabel[state.status]}</p>
                  )}

                  {/* Visibility row — once the project is saved (has an id)
                      the public watch page works immediately via the live
                      canvas, no baked MP4 required. Gated on projectId, not
                      hasVideo. */}
                  {state.projectId && (
                    <div className="flex items-center justify-between pt-0.5">
                      <div className="flex items-center gap-1.5">
                        {isPublic
                          ? <Globe className="w-3 h-3 text-emerald-400" />
                          : <Lock className="w-3 h-3 text-muted-foreground" />}
                        <Label htmlFor="studio-public-toggle" className="text-[11px] cursor-pointer">
                          {isPublic ? "Public page on" : "Make public"}
                        </Label>
                      </div>
                      <Switch id="studio-public-toggle" checked={isPublic} onCheckedChange={onMakePublic} />
                    </div>
                  )}

                  {/* Public URL — visible whenever the project is public,
                      regardless of whether a render exists. */}
                  {isPublic && state.projectId && (
                    <div className="flex items-center gap-1 pt-0.5">
                      <Input
                        readOnly
                        className="h-7 text-[10px] flex-1 font-mono"
                        value={`https://hired.video/v/${state.projectId}`}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[10px] shrink-0"
                        title="Copy public URL"
                        onClick={() => navigator.clipboard.writeText(`https://hired.video/v/${state.projectId}`)}
                      >
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[10px] shrink-0"
                        title="Open public page"
                        asChild
                      >
                        <a
                          href={`https://hired.video/v/${state.projectId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </Button>
                    </div>
                  )}

                  {/* Branding opt-out — Pro plan only. Affects what the
                      render encodes, so it sits with the Publish actions
                      that trigger that render. */}
                  <div className="flex items-start justify-between gap-2 px-1 py-1.5 rounded border border-border/50 bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <Label
                        htmlFor="remove-branding-toggle"
                        className={cn(
                          "text-[10px] block leading-tight",
                          isPro ? "" : "text-muted-foreground",
                        )}
                      >
                        Remove hired.video branding
                      </Label>
                      <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">
                        {isPro
                          ? "Drops the intro, outro, and watermark from the rendered MP4."
                          : <>Pro plan only — <a href="/pricing" className="underline hover:text-primary">upgrade</a> to remove the intro, outro, and watermark.</>}
                      </p>
                    </div>
                    <Switch
                      id="remove-branding-toggle"
                      checked={isPro ? removeBranding : false}
                      disabled={!isPro || busy}
                      onCheckedChange={(v) => onRemoveBrandingChange?.(v)}
                    />
                  </div>

                  {/* Publish destinations — each is its own off-platform
                      surface. The shared "needs an MP4" gate lives in
                      the parent's ensureRendered, so consumers click and
                      the render kicks off lazily. Buttons enable as soon
                      as a script exists. The label flips to "Re-render &
                      …" when `bakedFresh` is false so the user knows the
                      first click will burn a few seconds rendering. */}
                  {state.script && (
                    <>
                      <Button size="sm" className="w-full h-7 text-xs" onClick={onPublish} disabled={busy}>
                        <Upload className="w-3 h-3 mr-1.5" />
                        {hasYoutube
                          ? (bakedFresh ? "Re-publish to YouTube" : "Re-render & re-publish to YouTube")
                          : (bakedFresh ? "Publish to YouTube" : "Render & publish to YouTube")}
                      </Button>
                      <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={onLinkedInPublish} disabled={busy}>
                        <Share2 className="w-3 h-3 mr-1.5" />
                        {bakedFresh ? "Publish to LinkedIn" : "Render & publish to LinkedIn"}
                      </Button>
                      <Button
                        size="sm"
                        variant={isPublishedToProfile ? "secondary" : "default"}
                        className={`w-full h-7 text-xs ${isPublishedToProfile ? "opacity-80" : ""}`}
                        onClick={onPublishToProfile}
                        disabled={busy}
                      >
                        {isPublishedToProfile
                          ? <><UserX className="w-3 h-3 mr-1.5" /> Remove from Profile</>
                          : <><UserCheck className="w-3 h-3 mr-1.5" /> {bakedFresh ? "Publish to Profile" : "Render & publish to Profile"}</>}
                      </Button>
                      {isPublishedToProfile && profileUrl && (
                        <a
                          href={profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1.5 w-full h-7 text-xs border border-border rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="w-3 h-3" /> View Profile
                        </a>
                      )}
                      {onDownloadLocal && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs"
                          onClick={onDownloadLocal}
                          disabled={busy}
                          title="Download a local copy of the rendered video file"
                        >
                          <Download className="w-3 h-3 mr-1.5" />
                          {bakedFresh ? "Download" : "Render & download"}
                        </Button>
                      )}
                    </>
                  )}

                  {/* Share on X — uses the in-platform watch URL, so it
                      only needs the project to be public; no MP4
                      required. */}
                  {isPublic && state.projectId && (
                    <Button size="sm" variant="secondary" className="w-full h-7 text-xs" asChild>
                      <a
                        href={`https://twitter.com/intent/tweet?text=Check+out+my+video+resume!&url=${encodeURIComponent(`https://hired.video/v/${state.projectId ?? ""}`)}`}
                        target="_blank" rel="noopener noreferrer"
                      >
                        <Share2 className="w-3 h-3 mr-1" /> Share on X
                      </a>
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>}

      {/* Settings panel below */}
    </div>
  );
}
