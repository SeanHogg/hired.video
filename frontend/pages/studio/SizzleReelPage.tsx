/**
 * Sizzle reel magic UI — `/studio/sizzle`.
 *
 * Per `project_nle_decision.md`, this is a magic UI on top of the NLE
 * engine. It emits the same Timeline JSON the power-user editor uses,
 * so users can build a sizzle reel in 3 clicks AND then drop into the
 * NLE editor for fine cuts. Single Timeline spec — no fork.
 *
 * Flow:
 *   1. User drops 2-N video clips + a music bed (audio file).
 *   2. We probe each source for metadata.
 *   3. Music bed is decoded; beats are detected via the shared
 *      `detectBeats()` (single source of truth — same call site that
 *      future audio-reactive effects will use).
 *   4. Each video source is scored via the shared `scoreHighlights()`
 *      facade — heuristic for now, Whisper-LLM later behind the same
 *      facade with zero caller changes.
 *   5. `buildSizzleTimeline()` assembles the Timeline.
 *   6. The user previews via the existing Timeline render facade
 *      (`renderTimeline()`) — same path the NLE export uses. Down-
 *      stream "Open in NLE" hooks the Timeline into the existing
 *      editor for fine edits.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Music, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useSEO } from "@/lib/seo";
import {
  probeResultToSource,
  probeSource,
  kindOfFile,
  type ProbeResult,
} from "@/lib/timeline/source-probe";
import {
  decodeAudioToBuffer,
  detectBeats,
} from "@/lib/sizzle/beat-detection";
import {
  scoreHighlights,
  type HighlightWindow,
} from "@/lib/sizzle/highlight-scoring";
import { buildSizzleTimeline } from "@/lib/sizzle/sizzle-builder";
import { renderTimeline } from "@/lib/timeline/render";
import type { MediaSource, Timeline } from "@shared/timeline";

interface VideoSourceState {
  id: string;
  source: MediaSource;
  highlights: HighlightWindow[];
  highlightStatus: "pending" | "scoring" | "ready" | "failed";
}

interface AudioSourceState {
  source: MediaSource;
  beats: number[];
  beatStatus: "pending" | "detecting" | "ready" | "failed";
}

const MAX_VIDEO_SOURCES = 8;

export default function SizzleReelPage() {
  useSEO("/studio/sizzle");

  const [videos, setVideos] = useState<VideoSourceState[]>([]);
  const [audio, setAudio] = useState<AudioSourceState | null>(null);
  const [targetSec, setTargetSec] = useState(30);
  const [building, setBuilding] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const lastTimeline = useRef<Timeline | null>(null);

  // Cleanup blob URLs on unmount.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // ── Source ingestion ────────────────────────────────────────────────

  const handleVideoDrop = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      const kind = kindOfFile(file);
      if (kind !== "video") continue;
      if (videos.length >= MAX_VIDEO_SOURCES) {
        toast.warning(`Max ${MAX_VIDEO_SOURCES} clips per reel`);
        return;
      }
      try {
        const probe = await probeSource(file);
        const id = crypto.randomUUID();
        const source = probeResultToSource(id, probe, file.name);
        setVideos((prev) => [
          ...prev,
          { id, source, highlights: [], highlightStatus: "pending" },
        ]);
        // Kick off scoring immediately so the user doesn't pay for it
        // when they click "Generate."
        void scoreOne(id, source, probe);
      } catch (err) {
        toast.error("Couldn't load clip", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }, [videos.length]);

  const scoreOne = useCallback(async (id: string, source: MediaSource, probe: ProbeResult) => {
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, highlightStatus: "scoring" } : v)));
    const video = document.createElement("video");
    video.src = probe.url;
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video load failed"));
    });
    try {
      const highlights = await scoreHighlights({
        videoElement: video,
        sourceDurationSec: video.duration,
      });
      setVideos((prev) => prev.map((v) =>
        v.id === id ? { ...v, highlights, highlightStatus: "ready" } : v,
      ));
    } catch {
      setVideos((prev) => prev.map((v) =>
        v.id === id ? { ...v, highlightStatus: "failed" } : v,
      ));
    } finally {
      video.removeAttribute("src");
      video.load();
    }
  }, []);

  const handleAudioDrop = useCallback(async (file: File) => {
    if (kindOfFile(file) !== "audio") return;
    try {
      const probe = await probeSource(file);
      const id = crypto.randomUUID();
      const source = probeResultToSource(id, probe, file.name);
      setAudio({ source, beats: [], beatStatus: "detecting" });
      const buffer = await decodeAudioToBuffer(file);
      const beats = detectBeats(buffer);
      setAudio({ source, beats, beatStatus: "ready" });
    } catch (err) {
      setAudio((prev) => prev ? { ...prev, beatStatus: "failed" } : prev);
      toast.error("Couldn't analyse music", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  // ── Build + render ──────────────────────────────────────────────────

  const canBuild = videos.length >= 1 &&
    videos.every((v) => v.highlightStatus === "ready");

  const onBuild = useCallback(async () => {
    if (!canBuild) return;
    setBuilding(true);
    setRenderProgress(0);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    try {
      const timeline = buildSizzleTimeline({
        sources: videos.map((v) => ({ source: v.source, highlights: v.highlights })),
        audioBed: audio?.source ?? null,
        beats: audio?.beats ?? [],
        targetDurationSec: targetSec,
      });
      lastTimeline.current = timeline;

      const sourcesMap: Record<string, MediaSource> = {};
      for (const v of videos) sourcesMap[v.source.id] = v.source;
      if (audio) sourcesMap[audio.source.id] = audio.source;

      const result = await renderTimeline(timeline, sourcesMap, {
        onProgress: setRenderProgress,
      });
      setPreviewUrl(URL.createObjectURL(result.blob));
      toast.success("Sizzle reel ready", {
        description: `${(result.blob.size / (1024 * 1024)).toFixed(1)} MB · ${result.engine}`,
      });
    } catch (err) {
      toast.error("Sizzle build failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBuilding(false);
    }
  }, [canBuild, videos, audio, targetSec, previewUrl]);

  const removeVideo = (id: string) => {
    setVideos((prev) => {
      const target = prev.find((v) => v.id === id);
      if (target) URL.revokeObjectURL(target.source.url);
      return prev.filter((v) => v.id !== id);
    });
  };

  const removeAudio = () => {
    if (audio) URL.revokeObjectURL(audio.source.url);
    setAudio(null);
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Sizzle reel
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Drop a few clips and a music bed. We pick the best moments,
          cut to the beat, and emit a Timeline you can render or open
          in the NLE editor.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Video clips · {videos.length}/{MAX_VIDEO_SOURCES}</Label>
            <DropZone
              accept="video/*"
              onFiles={handleVideoDrop}
              icon={<Upload className="h-3.5 w-3.5" />}
              label="Drop clips or click to choose"
              multiple
            />
            <ul className="mt-2 space-y-1.5">
              {videos.map((v) => (
                <li key={v.id} className="flex items-center justify-between text-xs rounded border bg-card px-2 py-1.5">
                  <span className="truncate flex-1">{v.source.filename}</span>
                  <HighlightStatusBadge status={v.highlightStatus} count={v.highlights.length} />
                  <Button size="icon" variant="ghost" className="h-6 w-6 ml-1" onClick={() => removeVideo(v.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Label className="text-xs">Music bed (optional)</Label>
            <DropZone
              accept="audio/*"
              onFiles={(files) => handleAudioDrop(files[0])}
              icon={<Music className="h-3.5 w-3.5" />}
              label="Drop a music track"
              multiple={false}
            />
            {audio && (
              <div className="mt-2 flex items-center justify-between text-xs rounded border bg-card px-2 py-1.5">
                <span className="truncate flex-1">{audio.source.filename}</span>
                <BeatStatusBadge status={audio.beatStatus} count={audio.beats.length} />
                <Button size="icon" variant="ghost" className="h-6 w-6 ml-1" onClick={removeAudio}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Target duration</Label>
              <span className="text-[10px] text-muted-foreground tabular-nums">{targetSec}s</span>
            </div>
            <Slider
              value={[targetSec]}
              min={10}
              max={90}
              step={5}
              onValueChange={(v) => setTargetSec(v[0] ?? 30)}
              className="mt-2"
            />
          </div>

          <Button onClick={onBuild} disabled={!canBuild || building} className="w-full">
            {building ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Rendering {(renderProgress * 100).toFixed(0)}%
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate sizzle reel
              </>
            )}
          </Button>
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <Label className="text-xs">Preview</Label>
          <div className="aspect-video overflow-hidden rounded border bg-muted/40">
            {previewUrl ? (
              <video controls src={previewUrl} className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Your reel will appear here
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function DropZone({
  accept,
  onFiles,
  icon,
  label,
  multiple,
}: {
  accept: string;
  onFiles: (files: File[]) => void | Promise<void>;
  icon: React.ReactNode;
  label: string;
  multiple: boolean;
}) {
  return (
    <label
      className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed bg-background px-3 py-6 text-xs text-muted-foreground hover:bg-accent"
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onFiles(Array.from(e.dataTransfer.files));
        }
      }}
    >
      {icon}
      {label}
      <Input
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          if (files.length > 0) onFiles(files);
          e.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function HighlightStatusBadge({ status, count }: { status: VideoSourceState["highlightStatus"]; count: number }) {
  if (status === "scoring" || status === "pending") {
    return <Badge variant="outline" className="text-[10px]">Scoring…</Badge>;
  }
  if (status === "failed") return <Badge variant="destructive" className="text-[10px]">Failed</Badge>;
  return <Badge variant="secondary" className="text-[10px]">{count} moments</Badge>;
}

function BeatStatusBadge({ status, count }: { status: AudioSourceState["beatStatus"]; count: number }) {
  if (status === "detecting" || status === "pending") {
    return <Badge variant="outline" className="text-[10px]">Analyzing…</Badge>;
  }
  if (status === "failed") return <Badge variant="destructive" className="text-[10px]">Failed</Badge>;
  return <Badge variant="secondary" className="text-[10px]">{count} beats</Badge>;
}
