/**
 * Playback chrome for a v2 canvas player.
 *
 * Owns: skip-to-start + play/pause + seek scrubber + timecode. Renders
 * on a self-contained dark bar so the same controls read legibly on
 * either a light page (public watch / resume / profile surfaces) or
 * the editor's dark preview overlay.
 *
 * Per the standing DRY rule this is the SINGLE controls component
 * every canvas playback surface mounts. Editor fullscreen overlay +
 * public watch page + every other consumer mount this directly — no
 * surface re-implements play/pause/scrub.
 */
import { Pause, Play, SkipBack } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import { cn } from "@/lib/utils";

export interface PlaybackControlsProps {
  playback: PreviewPlayback;
  className?: string;
}

function formatTime(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PlaybackControls({
  playback,
  className,
}: PlaybackControlsProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3 px-4 py-3 bg-black/80 text-white backdrop-blur-sm",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => playback.seek(0)}
        aria-label="Back to start"
        className="h-10 w-10 rounded-full p-0 text-white hover:bg-white/10"
      >
        <SkipBack className="h-4 w-4" />
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={playback.toggle}
        aria-label={playback.isPlaying ? "Pause" : "Play"}
        className="h-12 w-12 rounded-full p-0"
      >
        {playback.isPlaying ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5" />
        )}
      </Button>
      <input
        type="range"
        min={0}
        max={Math.max(0.1, playback.duration)}
        step={0.05}
        value={playback.playhead}
        onChange={(e) => playback.seek(Number(e.target.value))}
        className="h-1 flex-1 max-w-md cursor-pointer accent-brand-purple"
        aria-label="Playhead"
      />
      <span className="min-w-[6rem] text-center text-xs tabular-nums opacity-80">
        {formatTime(playback.playhead)} / {formatTime(playback.duration)}
      </span>
    </div>
  );
}
