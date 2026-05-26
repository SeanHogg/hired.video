/**
 * ChapterMarkerInlineBody — canvas-side preview of a video chapter
 * marker. Shows the chapter title + timestamp; in playback the marker
 * doubles as a "jump to chapter" affordance (player-side wiring is
 * the deferred half of gap #1579).
 */
import { useEffect, useState } from "react";
import { ListOrdered, Loader2 } from "lucide-react";

import {
  getChapters,
  type VideoChapter,
} from "@/lib/services/studio-features-service";

interface Props {
  projectId: string;
  assetId: string;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ChapterMarkerInlineBody({ projectId, assetId }: Props) {
  const [chapter, setChapter] = useState<VideoChapter | null | undefined>(undefined);

  useEffect(() => {
    if (!projectId || !assetId) {
      setChapter(null);
      return;
    }
    let cancelled = false;
    getChapters(projectId)
      .then((chapters) => {
        if (cancelled) return;
        setChapter(chapters.find((c) => c.id === assetId) ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setChapter(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, assetId]);

  if (chapter === undefined) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        Loading chapter…
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-muted-foreground">
        <ListOrdered className="h-4 w-4" />
        Chapter not found
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center gap-2 overflow-hidden p-2 text-left">
      {chapter.thumbnailUrl ? (
        <img
          src={chapter.thumbnailUrl}
          alt=""
          className="h-full max-h-16 aspect-video shrink-0 rounded object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full max-h-16 aspect-video shrink-0 items-center justify-center rounded bg-current/10">
          <ListOrdered className="h-4 w-4 opacity-60" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{chapter.title}</p>
        <p className="text-[10px] opacity-70">{formatTimestamp(chapter.startSeconds)}</p>
      </div>
    </div>
  );
}
