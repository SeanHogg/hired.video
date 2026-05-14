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
import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { MUSIC_TRACKS, type MusicTrack } from "@/lib/studio/music-catalog";
import { cn } from "@/lib/utils";

export interface MusicPickerProps {
  /** Resolved selection id — matches `MusicTrack.id` for stock picks.
   *  Custom (composed/uploaded) music selections won't match any track
   *  here, which is intentional: the picker only highlights stock
   *  catalog rows. */
  activeSelectionId?: string | null;
  onSelect: (track: MusicTrack) => void;
  className?: string;
}

export default function MusicPicker({
  activeSelectionId,
  onSelect,
  className,
}: MusicPickerProps) {
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop any preview when the picker unmounts.
  useEffect(() => () => audioRef.current?.pause(), []);

  function togglePreview(track: MusicTrack) {
    if (!track.src) return;
    if (previewingId === track.id) {
      audioRef.current?.pause();
      setPreviewingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(track.src);
    audio.onended = () => setPreviewingId(null);
    audio.play().catch(() => setPreviewingId(null));
    audioRef.current = audio;
    setPreviewingId(track.id);
  }

  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {MUSIC_TRACKS.map((track) => {
        const isActive = track.id === activeSelectionId;
        const isPreviewing = track.id === previewingId;
        return (
          <li
            key={track.id}
            className={cn(
              "flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 transition",
              isActive ? "border-brand-purple" : "border-border",
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
            {track.src && (
              <button
                type="button"
                onClick={() => togglePreview(track)}
                aria-label={isPreviewing ? "Stop preview" : "Preview track"}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {isPreviewing ? (
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
