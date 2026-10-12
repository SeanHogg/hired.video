/**
 * StripPlaybackControls — the timeline strip's transport, the same on a
 * kit's video and a studio format: (back to start) · play/pause · scrub ·
 * "0:12 / 0:45". One clock: the surface's usePreviewPlayback.
 */
import { useTranslation } from "react-i18next";
import { Pause, Play, SkipBack } from "lucide-react";
import { formatClock } from "@/lib/build/video-outline";

interface StripClock {
  isPlaying: boolean;
  playhead: number;
  toggle: () => void;
  seek: (seconds: number) => void;
}

interface StripPlaybackControlsProps {
  playback: StripClock;
  /** Length of the timeline in seconds. */
  total: number;
  /** Show the back-to-start button. */
  backToStart?: boolean;
}

export default function StripPlaybackControls({ playback, total, backToStart = false }: StripPlaybackControlsProps) {
  const { t } = useTranslation();
  const length = Math.max(0.1, total);
  return (
    <>
      {backToStart && (
        <button
          type="button"
          onClick={() => playback.seek(0)}
          aria-label={t("studio.editorV2.backToStart")}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-foreground hover:bg-muted"
        >
          <SkipBack className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={playback.toggle}
        aria-label={playback.isPlaying ? t("studio.editorV2.pausePreview") : t("studio.editorV2.playPreview")}
        className="group flex h-11 w-11 flex-none items-center justify-center rounded-full focus-visible:outline-none"
      >
        {/* A 36px disc inside a 44px tap target. */}
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-ink-foreground group-hover:bg-ink/90 group-focus-visible:ring-2 group-focus-visible:ring-ring">
          {playback.isPlaying ? (
            <Pause className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          )}
        </span>
      </button>
      <input
        type="range"
        min={0}
        max={length}
        step={0.05}
        value={Math.min(playback.playhead, length)}
        onChange={(e) => playback.seek(Number(e.target.value))}
        aria-label={t("studio.editorV2.playhead")}
        className="h-1 min-w-0 max-w-[280px] flex-1 cursor-pointer accent-primary"
      />
      <span className="hidden flex-none font-mono text-xs tabular-nums text-muted-foreground sm:inline">
        {formatClock(playback.playhead)} / {formatClock(total)}
      </span>
    </>
  );
}
