/**
 * SourcePanel — the source-library strip for the NLE.
 *
 * Owns the in-memory list of MediaSources for the current editing
 * session. M1 keeps everything client-side: probe via
 * lib/timeline/source-probe.ts, store as a blob: URL. M2 swaps the
 * upload backend in here without changing how the timeline references
 * sources.
 *
 * Per the DRY rule, this is the ONE place that translates raw user
 * input (file picker, drag-drop) into MediaSource entries. The
 * timeline canvas reads sources by id; it never sees File objects.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Film, Image as ImageIcon, Loader2, Music, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  framesToSeconds,
  secondsToFrames,
  type MediaSource,
  type Timeline,
} from "@shared/timeline";
import { probeResultToSource, probeSource } from "@/lib/timeline/source-probe";
import { insertClip } from "@/lib/timeline/operations";
import { nleApi } from "@/lib/timeline/api";

/**
 * dataTransfer MIME used for drag-drop from the source list onto the
 * timeline. Stable string so future surfaces (other studio tools, the
 * sizzle-reel magic UI) can target the timeline drop the same way.
 */
export const NLE_SOURCE_DRAG_MIME = "application/x-nle-source";

interface Props {
  sources: Record<string, MediaSource>;
  onSourcesChange: (next: Record<string, MediaSource>) => void;
  timeline: Timeline;
  onTimelineChange: (next: Timeline) => void;
}

export default function SourcePanel({
  sources,
  onSourcesChange,
  timeline,
  onTimelineChange,
}: Props) {
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Revoke blob: URLs when this panel unmounts so the page doesn't leak
  // them across the session. Per-source revoke (on delete) is handled
  // by deleteSource() below.
  useEffect(() => {
    return () => {
      for (const src of Object.values(sources)) {
        if (src.url.startsWith("blob:")) URL.revokeObjectURL(src.url);
      }
    };
    // intentionally only on mount/unmount — `sources` mutating during
    // editing is fine; we only revoke once at teardown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ingestFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      setBusy(true);
      const next: Record<string, MediaSource> = { ...sources };
      try {
        for (const file of list) {
          try {
            const probed = await probeSource(file);
            // Upload to the server so the source survives a refresh.
            // The probe result is what the server can't compute itself
            // (no ffprobe on Workers); we ship those fields and let the
            // server compute content_hash + persist to R2. Falls back to
            // the local blob: URL when the upload fails so the editor
            // stays usable offline / in dev without R2.
            try {
              const { source } = await nleApi.uploadSource(file, {
                durationFrames: probed.durationFrames,
                fps: probed.fps,
                width: probed.width,
                height: probed.height,
                kind: probed.kind,
              });
              // Replace the blob: URL with the persisted CDN URL so
              // the Timeline saves a stable reference. The probe blob
              // URL gets revoked on unmount.
              next[source.id] = source;
            } catch (err) {
              toast.warning(`Saved ${file.name} locally only`, {
                description:
                  "Server upload failed — this clip won't survive a page refresh. " +
                  (err instanceof Error ? err.message : String(err)),
              });
              const id = (crypto as Crypto).randomUUID();
              next[id] = probeResultToSource(id, probed, file.name);
            }
          } catch (err) {
            toast.error(`Couldn't import ${file.name}`, {
              description: err instanceof Error ? err.message : String(err),
            });
          }
        }
        onSourcesChange(next);
      } finally {
        setBusy(false);
      }
    },
    [sources, onSourcesChange],
  );

  const onFilePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) ingestFiles(e.target.files);
      e.target.value = "";
    },
    [ingestFiles],
  );

  const onDropZone = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (e.dataTransfer.files?.length) ingestFiles(e.dataTransfer.files);
    },
    [ingestFiles],
  );

  const deleteSource = useCallback(
    (id: string) => {
      const src = sources[id];
      if (!src) return;
      // Refuse to delete a source that's still referenced by the
      // timeline — the canvas would render dangling clips. The button
      // self-disables on referenced sources so the user shouldn't get
      // here, but defend the invariant anyway.
      const referenced = timeline.tracks.some((t) =>
        t.clips.some((c) => c.sourceId === id),
      );
      if (referenced) {
        toast.error("Source is in use", {
          description: "Remove its clips from the timeline first.",
        });
        return;
      }
      if (src.url.startsWith("blob:")) URL.revokeObjectURL(src.url);
      const next = { ...sources };
      delete next[id];
      onSourcesChange(next);
    },
    [sources, timeline, onSourcesChange],
  );

  /**
   * Append the source as a clip on the first compatible track. Video
   * goes on the first video track, audio on the first audio track,
   * images on the first video track. Routes through insertClip() in
   * lib/timeline/operations.ts so the overlap-check + sorted-insert
   * invariants stay shared with drag-drop and other entry points.
   */
  const addToTimeline = useCallback(
    (id: string) => {
      const src = sources[id];
      if (!src) return;
      const wantedKind = src.kind === "audio" ? "audio" : "video";
      const target = timeline.tracks.find((t) => t.kind === wantedKind);
      if (!target) {
        toast.error("No compatible track", {
          description: `Add a ${wantedKind} track first.`,
        });
        return;
      }
      const startFrame = target.clips.reduce(
        (acc, c) => Math.max(acc, c.startFrame + c.durationFrames),
        0,
      );
      // Translate from the source's native fps to the timeline fps so
      // the clip occupies the correct on-timeline duration.
      const durationFrames = secondsToFrames(
        framesToSeconds(src.durationFrames, src.fps),
        timeline.fps,
      );
      try {
        const result = insertClip(timeline, target.id, {
          sourceId: id,
          startFrame,
          durationFrames,
          ...(target.kind === "audio" ? { gain: 1 } : {}),
        });
        onTimelineChange(result.timeline);
      } catch (err) {
        toast.error("Couldn't add clip", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [sources, timeline, onTimelineChange],
  );

  const sourceList = Object.values(sources);

  return (
    <div className="flex h-full flex-col border-r bg-muted/20">
      <div className="flex items-center justify-between gap-2 border-b bg-background px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Sources
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
          Import
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          className="hidden"
          onChange={onFilePick}
        />
      </div>

      <div
        className={cn(
          "flex-1 overflow-y-auto p-2",
          sourceList.length === 0 && "flex items-center justify-center",
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDropZone}
      >
        {sourceList.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground">
            Drop video, audio, or images here<br />or click Import.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {sourceList.map((src) => (
              <SourceRow
                key={src.id}
                source={src}
                timelineFps={timeline.fps}
                onAdd={() => addToTimeline(src.id)}
                onDelete={() => deleteSource(src.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source row — single item in the source list
// ---------------------------------------------------------------------------

function SourceRow({
  source,
  timelineFps,
  onAdd,
  onDelete,
}: {
  source: MediaSource;
  timelineFps: number;
  onAdd: () => void;
  onDelete: () => void;
}) {
  const Icon = source.kind === "video" ? Film : source.kind === "audio" ? Music : ImageIcon;
  const seconds = framesToSeconds(source.durationFrames, source.fps);
  return (
    <li
      className="flex items-center gap-1.5 rounded border bg-background p-1.5 text-xs cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(NLE_SOURCE_DRAG_MIME, source.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{source.filename}</div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {seconds.toFixed(1)}s
          {source.width && source.height && ` · ${source.width}×${source.height}`}
          {" · "}
          {Math.round(seconds * timelineFps)}f@{timelineFps}fps
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 shrink-0 p-0"
        onClick={onAdd}
        title="Add to timeline"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 shrink-0 p-0 text-destructive"
        onClick={onDelete}
        title="Remove source"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}
