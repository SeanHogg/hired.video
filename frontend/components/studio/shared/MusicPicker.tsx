/**
 * Music picker — shared between v1 sidebar and v2's Music panel.
 * Catalog lives in `lib/studio/music-catalog.ts`. The picker emits the
 * chosen track; parent decides whether to attach it as an AudioClip on
 * the v1 storyboard or as a clip on the v2 Timeline JSON's A1 track.
 *
 * Preview playback is handled here (HTMLAudioElement, one at a time)
 * so every consumer gets the same audition behaviour without rolling
 * their own playback state.
 */
import type { DragEvent } from "react";
import { Play, Pause } from "lucide-react";
import { MUSIC_TRACKS, type MusicTrack } from "@/lib/studio/music-catalog";
import { hasProceduralMusic, getProceduralMusicUrl } from "@/lib/studio/music-procedural";
import { useAudioPreview } from "@/lib/hooks/useAudioPreview";
import { cn } from "@/lib/utils";

export interface MusicPickerProps {
  /** Resolved selection id — matches `MusicTrack.id` for stock picks.
   *  Custom (composed/uploaded) music selections won't match any track
   *  here, which is intentional: the picker only highlights stock
   *  catalog rows. */
  activeSelectionId?: string | null;
  onSelect: (track: MusicTrack) => void;
  className?: string;
  /** When set, each track row is draggable so the user can drop it onto
   *  the timeline / canvas to add a music layer (v2 audioLayers model).
   *  Omitted (v1 sidebar) = rows are click-only, unchanged. */
  trackDraggable?: boolean;
  /** dragstart handler for a track row. Only fires when `trackDraggable`
   *  is set; the consumer writes the drag payload. */
  onTrackDragStart?: (track: MusicTrack, e: DragEvent<HTMLLIElement>) => void;
  /** Accessible affordance ("drag to add a track") surfaced as the row's
   *  title/aria-label when draggable. */
  trackDragLabel?: string;
}

export default function MusicPicker({
  activeSelectionId,
  onSelect,
  className,
  trackDraggable,
  onTrackDragStart,
  trackDragLabel,
}: MusicPickerProps) {
  const { toggle, isActive: isPreviewing } = useAudioPreview();

  async function togglePreview(track: MusicTrack) {
    // Resolve the playable URL — static file when one exists, otherwise
    // lazy-render the procedural WAV (the catalog ships without bundled
    // MP3s so this is the path every stock track actually takes today).
    let url = track.src;
    if (!url && hasProceduralMusic(track.id)) {
      try {
        url = await getProceduralMusicUrl(track.id);
      } catch {
        return;
      }
    }
    if (!url) return;
    await toggle(track.id, url);
  }

  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {MUSIC_TRACKS.map((track) => {
        const isSelected = track.id === activeSelectionId;
        const previewing = isPreviewing(track.id);
        return (
          <li
            key={track.id}
            draggable={trackDraggable || undefined}
            onDragStart={
              trackDraggable && onTrackDragStart
                ? (e) => onTrackDragStart(track, e)
                : undefined
            }
            title={trackDraggable ? trackDragLabel : undefined}
            aria-label={trackDraggable ? trackDragLabel : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 transition",
              isSelected ? "border-brand-primary" : "border-border",
              trackDraggable && "cursor-grab active:cursor-grabbing",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(track)}
              className="flex-1 text-left"
            >
              <p className="text-xs font-medium leading-tight">{track.label}</p>
              <p className="text-[10px] text-muted-foreground">{track.genre}</p>
            </button>
            {(track.src || hasProceduralMusic(track.id)) && (
              <button
                type="button"
                onClick={() => {
                  void togglePreview(track);
                }}
                aria-label={previewing ? "Stop preview" : "Preview track"}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {previewing ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
