// StudioPreview.tsx — right panel: preview canvas + Export + Publish + LinkedIn + visibility.

import { useState, useCallback } from "react";
import {
  Play, Pause, Download, Upload, Share2, Globe, Lock, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  onLinkedInPost: () => void;
  onMakePublic: (pub: boolean) => void;
  isPublic: boolean;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function StudioPreview({
  state, compiledVideo, playing, currentTime, exportProgress,
  onPlayPause, onTimeUpdate, onExport, onPublish, onLinkedInPost, onMakePublic, isPublic,
}: Props) {
  const busy = ["generating", "exporting", "uploading", "publishing"].includes(state.status);
  const hasVideo = state.videoBlob != null;
  const hasYoutube = state.youtubeVideoId != null;
  const totalDuration = compiledVideo?.totalDuration ?? 0;

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
    <div className="studio-right-panel">
      {/* Canvas */}
      <div className="p-3 border-b">
        <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: "16/9" }}>
          {compiledVideo ? (
            <VideoPreview
              compiledVideo={compiledVideo}
              playing={playing}
              currentTime={currentTime}
              onTimeUpdate={onTimeUpdate}
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
      </div>

      {/* Status */}
      {busy && (
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

      {/* Actions */}
      <div className="flex flex-col gap-2 p-4">
        <Button
          className="w-full"
          variant="outline"
          size="sm"
          disabled={!compiledVideo || busy}
          onClick={onExport}
        >
          <Download className="w-4 h-4 mr-2" />
          {state.videoBlob ? "Re-export MP4" : "Export MP4"}
        </Button>

        <Button
          className="w-full"
          size="sm"
          disabled={!hasVideo || busy}
          onClick={onPublish}
        >
          <Upload className="w-4 h-4 mr-2" />
          {hasYoutube ? "Re-publish" : "Publish"}
        </Button>

        <Button
          className="w-full"
          variant="secondary"
          size="sm"
          disabled={!hasYoutube || busy}
          onClick={onLinkedInPost}
        >
          <Share2 className="w-4 h-4 mr-2" /> Generate LinkedIn Post
        </Button>

        {/* Public toggle */}
        {hasYoutube && (
          <div className="flex items-center justify-between mt-2 pt-3 border-t">
            <div className="flex items-center gap-2">
              {isPublic ? <Globe className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-muted-foreground" />}
              <Label className="text-xs cursor-pointer" htmlFor="studio-public-toggle">
                {isPublic ? "Public page on" : "Make public"}
              </Label>
            </div>
            <Switch
              id="studio-public-toggle"
              checked={isPublic}
              onCheckedChange={onMakePublic}
            />
          </div>
        )}
      </div>

      {/* Settings panel below */}
    </div>
  );
}
