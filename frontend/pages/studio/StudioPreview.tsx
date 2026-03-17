// StudioPreview.tsx — right panel: preview canvas + Export + Publish + LinkedIn + visibility.

import { useState } from "react";
import {
  Play, Pause, Download, Upload, Share2, Globe, Lock, Loader2, Maximize2, X, Sparkles, Check, UserCheck, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import VideoPreview from "@/components/VideoPreview";
import type { StudioProjectState } from "@/types/studio";
import type { CompiledVideo } from "@/lib/compiler/types";

interface Props {
  state: StudioProjectState;
  compiledVideo: CompiledVideo | null;
  playing: boolean;
  currentTime: number;
  exportProgress: number;
  onPlayPause: () => void;
  onTimeUpdate: (t: number) => void;
  onExport: () => void;
  onPublish: () => void;
  onPublishToProfile: () => void;
  isPublishedToProfile?: boolean;
  profileUrl?: string;
  onLinkedInPost: () => void;
  onMakePublic: (pub: boolean) => void;
  isPublic: boolean;
  /** Callback for the Generate button in the action stepper */
  onGenerate?: () => void;
  /** Show video canvas + playback controls (default: true) */
  showVideo?: boolean;
  /** Show status + export/publish/LinkedIn actions (default: true) */
  showActions?: boolean;
  className?: string;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function StudioPreview({
  state, compiledVideo, playing, currentTime, exportProgress,
  onPlayPause, onTimeUpdate, onExport, onPublish, onPublishToProfile, isPublishedToProfile, profileUrl,
  onLinkedInPost, onMakePublic, isPublic,
  onGenerate,
  showVideo = true, showActions = true, className,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const busy = ["generating", "exporting", "uploading", "publishing"].includes(state.status);
  const hasVideo = state.videoBlob != null;
  const hasYoutube = state.youtubeVideoId != null;
  const totalDuration = compiledVideo?.totalDuration ?? 0;
  const canGenerate = state.resumeText.trim().length > 50;

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

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Canvas + playback */}
      {showVideo && <div className="p-3 border-b">
        <div
          className="relative bg-black rounded-lg overflow-hidden"
          style={{ aspectRatio: compiledVideo ? `${compiledVideo.width}/${compiledVideo.height}` : "16/9" }}
        >
          {compiledVideo ? (
            <VideoPreview
              compiledVideo={compiledVideo}
              playing={playing}
              currentTime={currentTime}
              onTimeUpdate={onTimeUpdate}
              audio={state.script?.video?.audio}
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

        {/* Playback controls */}
        {compiledVideo && (
          <div className="flex items-center gap-2 mt-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPlayPause}>
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <div className="flex-1 relative h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all"
                style={{ width: totalDuration ? `${(currentTime / totalDuration) * 100}%` : "0%" }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </div>
        )}
      </div>}

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
              className="w-full h-full rounded-lg overflow-hidden"
            />
            {/* Controls in fullscreen */}
            <div className="flex items-center gap-3 mt-3">
              <Button variant="secondary" size="icon" className="h-8 w-8" onClick={onPlayPause}>
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <div className="flex-1 relative h-1.5 bg-white/20 rounded-full overflow-hidden cursor-pointer">
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
          { n: 1, title: "Generate Script", done: !!state.script,   active: !state.script || state.status === "generating" },
          { n: 2, title: "Export MP4",      done: !!state.videoBlob, active: !!state.script && !state.videoBlob && state.status !== "generating" },
          { n: 3, title: "Share",           done: !!state.youtubeVideoId, active: !!state.videoBlob || !!isPublishedToProfile },
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
                        Add resume text in the Prompt tab
                      </p>
                    )}
                  </>
                )
              )}

              {n === 2 && (
                <>
                  {state.status === "exporting" && <Progress value={exportProgress * 100} className="h-1" />}
                  <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={onExport} disabled={!compiledVideo || busy}>
                    <Download className="w-3 h-3 mr-1.5" />
                    {state.videoBlob ? "Re-generate Video" : "Generate Video"}
                  </Button>
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
                  {/* LinkedIn always available once video is ready */}
                  {hasVideo && (
                    <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={onLinkedInPost} disabled={busy}>
                      <Share2 className="w-3 h-3 mr-1.5" /> Post to LinkedIn
                    </Button>
                  )}
                  {/* Publish to Profile */}
                  {hasVideo && (
                    <Button
                      size="sm"
                      variant={isPublishedToProfile ? "secondary" : "default"}
                      className={`w-full h-7 text-xs ${isPublishedToProfile ? "opacity-80" : ""}`}
                      onClick={onPublishToProfile}
                      disabled={busy}
                    >
                      {isPublishedToProfile
                        ? <><Check className="w-3 h-3 mr-1.5" /> Published to Profile</>
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
                  {hasYoutube && (
                    <>
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
                      {/* X sharing post-YouTube */}
                      <Button size="sm" variant="secondary" className="w-full h-7 text-xs" asChild>
                        <a
                          href={`https://twitter.com/intent/tweet?text=Check+out+my+video+resume!&url=https%3A%2F%2Fhired.video%2Fv%2F${state.youtubeVideoId}`}
                          target="_blank" rel="noopener noreferrer"
                        >
                          <Share2 className="w-3 h-3 mr-1" /> Share on X
                        </a>
                      </Button>
                    </>
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
