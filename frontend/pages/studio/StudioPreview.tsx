// StudioPreview.tsx — right panel: preview canvas + Export + Publish + LinkedIn + visibility.

import { useState } from "react";
import {
  Play, Pause, Download, Upload, Share2, Globe, Lock, Loader2, Maximize2, X, Sparkles, Check, UserCheck, UserX, ExternalLink,
} from "lucide-react";
import type { StudioPurpose } from "@/lib/services/studio-service";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import VideoPreview from "@/components/VideoPreview";
import SaveButton from "@/components/studio/SaveButton";
import { shouldShowBranding } from "@/lib/studio/branding-policy";
import { useExportProgress } from "@/lib/hooks/useExportProgress";
import { useSubscription } from "@/lib/hooks/useSubscription";
import type { StudioProjectState } from "@/types/studio";
import type { CompiledVideo } from "@/lib/compiler/types";
import type { SceneElement, ElementBox } from "@/types/video-script";
import { videoFiltersToCss } from "@/types/video-script";

interface Props {
  state: StudioProjectState;
  compiledVideo: CompiledVideo | null;
  playing: boolean;
  currentTime: number;
  onPlayPause: () => void;
  onTimeUpdate: (t: number) => void;
  onExport: () => void;
  onPublish: () => void;
  onPublishToProfile: () => void;
  isPublishedToProfile?: boolean;
  profileUrl?: string;
  onLinkedInPublish: () => void;
  onMakePublic: (pub: boolean) => void;
  isPublic: boolean;
  /** Optional download local copy action (pro-feeling — purely a convenience). */
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

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function StudioPreview({
  state, compiledVideo, playing, currentTime,
  onPlayPause, onTimeUpdate, onExport, onPublish, onPublishToProfile, isPublishedToProfile, profileUrl,
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
  // single primitive (with built-in SA bypass).
  const { isPro } = useSubscription();
  const showBrandingEndCap = shouldShowBranding({ isPro, removeBrandingFlag: removeBranding });
  const [expanded, setExpanded] = useState(false);
  const busy = ["generating", "exporting", "uploading", "publishing"].includes(state.status);
  // Read render progress from the same shared hook SaveButton uses, so any
  // progress indicator below stays in lock-step with the popover above.
  const exportProgress = useExportProgress();
  // hasVideo is true after either a fresh export (videoBlob) OR a previously
  // uploaded video (videoUrl persisted on the project) — so Step 3 stays
  // available after a refresh.
  const hasVideo = state.videoBlob != null || state.videoUrl != null;
  const hasYoutube = state.youtubeVideoId != null;
  const totalDuration = compiledVideo?.totalDuration ?? 0;
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

  // Inner video canvas — same content in both layout modes
  const filterCss = videoFiltersToCss(state.script?.video?.theme?.filters);
  const videoCanvas = (
    <div
      className="relative bg-black rounded-lg overflow-hidden"
      style={{
        aspectRatio: compiledVideo ? `${compiledVideo.width}/${compiledVideo.height}` : "16/9",
        // In height-fit mode: constrain by height, let width follow aspect ratio
        ...(showActions ? {} : { maxHeight: "100%", width: "auto", maxWidth: "100%" }),
        // Visual filters / colour grading (gap #125)
        filter: filterCss,
      }}
    >
      {compiledVideo ? (
        <VideoPreview
          compiledVideo={compiledVideo}
          playing={playing}
          currentTime={currentTime}
          onTimeUpdate={onTimeUpdate}
          audio={state.script?.video?.audio}
          voiceover={state.voiceover}
          sceneTimings={state.script?.scenes.map((s) => ({
            id: s.id,
            start: s.start,
            duration: s.duration,
            text: [
              typeof s.text === "string" ? s.text : s.text?.join(". "),
              s.items?.join(". "),
              s.skills ? `Skills: ${s.skills.join(", ")}` : undefined,
            ].filter(Boolean).join(" "),
          }))}
          overlayElements={overlayElements}
          selectedElementId={selectedElementId}
          onSelectElement={onSelectElement}
          onUpdateElementBox={onUpdateElementBox}
          onEnded={onEnded}
          showBrandingEndCap={showBrandingEndCap}
          className="w-full h-full"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
          {state.status === "generating" ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Generating…
            </span>
          ) : (
            "Run to preview"
          )}
        </div>
      )}

      {/* Expand button */}
      {compiledVideo && (
        <button
          type="button"
          className="absolute top-1.5 right-1.5 p-1 rounded bg-black/50 text-white hover:bg-black/80 transition-colors"
          onClick={() => setExpanded(true)}
          title="Expand preview"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  // Click-to-seek on the progress bar. Maps the click x-coordinate (or the
  // current touch point during a drag) to a time in [0, totalDuration] and
  // calls onTimeUpdate. Used by both the inline and fullscreen scrubbers so
  // the seek behaviour stays consistent.
  const seekFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!totalDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onTimeUpdate(ratio * totalDuration);
  };

  // Playback controls — same in both modes. `w-full` is critical: the
  // inner row is mounted inside a flex parent in showActions=false mode,
  // and without an explicit width the flex-1 scrubber has nothing to
  // expand against — Save then ends up flush against the time display
  // instead of the far right of the row.
  const playbackControls = compiledVideo && (
    <div className="flex items-center gap-2 w-full">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPlayPause}>
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </Button>
      <div
        className="flex-1 relative h-2 bg-muted rounded-full overflow-hidden cursor-pointer touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e);
        }}
        onPointerMove={(e) => {
          // Only seek while the pointer is captured (i.e. during a drag),
          // so a hover doesn't accidentally scrub.
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromPointer(e);
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        role="slider"
        aria-label="Seek video"
        aria-valuemin={0}
        aria-valuemax={totalDuration || 0}
        aria-valuenow={currentTime}
      >
        <div
          className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all"
          style={{ width: totalDuration ? `${(currentTime / totalDuration) * 100}%` : "0%" }}
        />
        {/* Scene boundary ticks — make it obvious where each storyboard
            card maps onto the timeline so a click on a scene card and a
            scrub on the bar feel like the same control. Skip the 0-tick
            (always at the left edge) and any tick past the duration. */}
        {totalDuration > 0 &&
          state.script?.scenes
            ?.filter((s) => s.start > 0 && s.start < totalDuration)
            .map((s) => (
              <span
                key={`tick-${s.id}`}
                aria-hidden
                className="absolute top-0 bottom-0 w-px bg-background/70"
                style={{ left: `${(s.start / totalDuration) * 100}%` }}
              />
            ))}
      </div>
      <span className="text-[10px] text-muted-foreground font-mono">
        {formatTime(currentTime)} / {formatTime(totalDuration)}
      </span>
      {/* Save anchored to the far right — secondary surface in case the
          user doesn't see the Save in the active Recent row. Download
          intentionally NOT here: the player row should stay focused on
          playback + saving; Download lives on the Recent card. */}
      {onSave && (
        <SaveButton
          state={state}
          onSave={onSave}
          onScriptChange={onScriptChange}
          variant="compact"
          className="ml-auto"
        />
      )}
    </div>
  );

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Canvas + playback */}
      {showVideo && (
        showActions ? (
          // Static layout (standalone / right-panel use)
          <div className="p-3 border-b">
            {videoCanvas}
            {playbackControls && <div className="mt-2">{playbackControls}</div>}
          </div>
        ) : (
          // Height-fit layout (center panel) — video shrinks to fit dragged height
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 flex items-center justify-center bg-black overflow-hidden p-2">
              {videoCanvas}
            </div>
            {playbackControls && (
              <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-t bg-background">
                {playbackControls}
              </div>
            )}
          </div>
        )
      )}

      {/* Fullscreen overlay — only relevant when video is shown */}
      {expanded && compiledVideo && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8"
          onClick={() => setExpanded(false)}
        >
          <div
            className="relative w-full max-w-5xl"
            style={{ aspectRatio: `${compiledVideo.width}/${compiledVideo.height}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute -top-8 right-0 text-white hover:text-white/70 transition-colors"
              onClick={() => setExpanded(false)}
            >
              <X className="w-5 h-5" />
            </button>
            <VideoPreview
              compiledVideo={compiledVideo}
              playing={playing}
              currentTime={currentTime}
              onTimeUpdate={onTimeUpdate}
              audio={state.script?.video?.audio}
              onEnded={onEnded}
              showBrandingEndCap={showBrandingEndCap}
              className="w-full h-full rounded-lg overflow-hidden"
            />
            {/* Controls in fullscreen */}
            <div className="flex items-center gap-3 mt-3">
              <Button variant="secondary" size="icon" className="h-8 w-8" onClick={onPlayPause}>
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <div
                className="flex-1 relative h-1.5 bg-white/20 rounded-full overflow-hidden cursor-pointer touch-none"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  seekFromPointer(e);
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromPointer(e);
                }}
                onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
                role="slider"
                aria-label="Seek video"
                aria-valuemin={0}
                aria-valuemax={totalDuration || 0}
                aria-valuenow={currentTime}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-white rounded-full transition-all"
                  style={{ width: totalDuration ? `${(currentTime / totalDuration) * 100}%` : "0%" }}
                />
              </div>
              <span className="text-xs text-white/70 font-mono">
                {formatTime(currentTime)} / {formatTime(totalDuration)}
              </span>
            </div>
          </div>
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


      {/* Action stepper */}
      {showActions && <div className="flex flex-col overflow-y-auto">
        {([
          { n: 1, title: "Generate Script", done: !!state.script, active: !state.script || state.status === "generating" },
          { n: 2, title: "Export Video",    done: hasVideo,        active: !!state.script && !hasVideo && state.status !== "generating" },
          // Step 3 only turns green once the user has *actually* used a share action.
          // Just being published-to-profile from Step 2 is no longer enough.
          { n: 3, title: "Share",           done: !!hasShared,     active: hasVideo && !hasShared },
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
                  {(state.status === "exporting" || state.status === "uploading") && (
                    <Progress value={exportProgress * 100} className="h-1" />
                  )}
                  <Button size="sm" className="w-full h-7 text-xs" onClick={onExport} disabled={!compiledVideo || busy}>
                    <Sparkles className="w-3 h-3 mr-1.5" />
                    {hasVideo ? "Re-generate Video" : "Generate Video"}
                  </Button>
                  {/* Branding opt-out — Pro plan only. Free users see the toggle
                       disabled with an upgrade CTA so the gate is discoverable. */}
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
                          ? "Drops the intro, outro, and watermark from the export."
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
                  {/* Download local copy — optional convenience after the video exists */}
                  {hasVideo && onDownloadLocal && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-7 text-xs"
                      onClick={onDownloadLocal}
                      disabled={busy}
                      title="Download a local copy of the video file"
                    >
                      <Download className="w-3 h-3 mr-1.5" />
                      Download
                    </Button>
                  )}
                  {hasVideo && (
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Saved to your library — Step 3 keeps it shareable.
                    </p>
                  )}
                </>
              )}

              {n === 3 && (
                <>
                  {(state.status === "uploading" || state.status === "publishing") && (
                    <p className="text-[10px] text-muted-foreground">{statusLabel[state.status]}</p>
                  )}
                  {/* Publish to YouTube */}
                  <Button size="sm" className="w-full h-7 text-xs" onClick={onPublish} disabled={!hasVideo || busy}>
                    <Upload className="w-3 h-3 mr-1.5" />
                    {hasYoutube ? "Re-publish to YouTube" : "Publish to YouTube"}
                  </Button>
                  {/* LinkedIn — direct OAuth publishing */}
                  {hasVideo && (
                    <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={onLinkedInPublish} disabled={busy}>
                      <Share2 className="w-3 h-3 mr-1.5" /> Publish to LinkedIn
                    </Button>
                  )}
                  {/* Publish / Remove from Profile — same handler in both
                      directions; the parent toggles based on its own
                      isPublishedToProfile state. */}
                  {hasVideo && (
                    <Button
                      size="sm"
                      variant={isPublishedToProfile ? "secondary" : "default"}
                      className={`w-full h-7 text-xs ${isPublishedToProfile ? "opacity-80" : ""}`}
                      onClick={onPublishToProfile}
                      disabled={busy}
                    >
                      {isPublishedToProfile
                        ? <><UserX className="w-3 h-3 mr-1.5" /> Remove from Profile</>
                        : <><UserCheck className="w-3 h-3 mr-1.5" /> Publish to Profile</>}
                    </Button>
                  )}
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
                                                                                                                                                                                                                                                                                                                                                                                                      {/* Visibility toggle — once a video exists, the user can flip public/unlisted */}
                  {hasVideo && (
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
                  {/* Public page URL with copy button — always shown when public */}
                  {hasVideo && isPublic && state.projectId && (
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
                  {/* Share on X — use hired.video public URL */}
                  {hasVideo && isPublic && (
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
