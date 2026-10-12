"use client";

/**
 * ThumbnailsDialog — gap #142 frontend.
 *
 * Extracts 6 candidate frames from a published video URL using a hidden
 * <video> + <canvas>, uploads each to the API as a data URL, and asks the
 * server to score and persist them. The user picks one as the active
 * thumbnail.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Image as ImageIcon, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  scoreThumbnails,
  listThumbnails,
  selectThumbnail,
  type ThumbnailCandidate,
} from "@/lib/services/studio-features-service";

interface Props {
  projectId: string | null;
  /** Public URL of the rendered video to extract frames from. */
  videoUrl: string | null;
  /** Optional total duration to space candidate frames evenly. */
  durationSec?: number;
}

const CANDIDATE_COUNT = 6;

export default function ThumbnailsDialog({ projectId, videoUrl, durationSec }: Props) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<ThumbnailCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  // Hidden video + canvas for frame extraction
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    listThumbnails(projectId)
      .then(setCandidates)
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  }, [open, projectId]);

  /**
   * Extracts CANDIDATE_COUNT frames at evenly spaced timestamps from the
   * source video and returns them as data URLs alongside their timestamps.
   */
  async function extractFrames(): Promise<Array<{ imageUrl: string; sourceTimeSec: number }>> {
    if (!videoUrl) throw new Error("No video URL");

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.src = videoUrl;
    video.muted = true;
    video.preload = "auto";
    videoRef.current = video;

    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("Video load failed")), { once: true });
    });

    const total = durationSec ?? video.duration;
    const targets = Array.from({ length: CANDIDATE_COUNT }, (_, i) =>
      ((i + 1) / (CANDIDATE_COUNT + 1)) * total,
    );

    const canvas = document.createElement("canvas");
    canvas.width = Math.min(1280, video.videoWidth);
    canvas.height = Math.min(720, video.videoHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");

    const out: Array<{ imageUrl: string; sourceTimeSec: number }> = [];
    for (const t of targets) {
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = t;
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      out.push({
        imageUrl: canvas.toDataURL("image/jpeg", 0.72),
        sourceTimeSec: t,
      });
    }
    return out;
  }

  async function handleGenerate() {
    if (!projectId || !videoUrl) return;
    setGenerating(true);
    try {
      const frames = await extractFrames();
      const ranked = await scoreThumbnails(projectId, frames);
      setCandidates(ranked);
    } catch (err) {
      console.error("[thumbnails] generate failed:", err);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSelect(id: string) {
    if (!projectId) return;
    setSelectingId(id);
    try {
      const updated = await selectThumbnail(projectId, id);
      setCandidates((prev) => prev.map((c) => ({ ...c, isSelected: c.id === updated.id })));
    } finally {
      setSelectingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!projectId} title="AI thumbnails">
          <ImageIcon className="w-3.5 h-3.5 mr-1" /> Thumbnails
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>AI Thumbnail Generator</DialogTitle>
          <DialogDescription>
            Extracts 6 candidate frames from your video and ranks them by likely click-through.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button size="sm" onClick={handleGenerate} disabled={generating || !videoUrl}>
            {generating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />}
            {videoUrl ? "Generate candidates" : "Export video first"}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No thumbnails yet. Click Generate above to extract candidates from your video.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelect(c.id)}
                disabled={selectingId === c.id}
                className={`relative rounded-md overflow-hidden border-2 transition-colors ${
                  c.isSelected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40"
                }`}
              >
                <img src={c.imageUrl} alt="" className="w-full aspect-video object-cover" />
                <div className="absolute top-1 left-1 flex items-center gap-1">
                  {c.score != null && (
                    <Badge className="h-4 px-1 text-[9px] bg-black/60">
                      {Math.round(c.score * 100)}
                    </Badge>
                  )}
                  {c.isSelected && (
                    <Badge className="h-4 px-1 text-[9px]">selected</Badge>
                  )}
                </div>
                {c.sourceTimeSec != null && (
                  <span className="absolute bottom-1 right-1 text-[9px] font-mono bg-black/60 text-white px-1 rounded">
                    {c.sourceTimeSec.toFixed(1)}s
                  </span>
                )}
                {selectingId === c.id && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
