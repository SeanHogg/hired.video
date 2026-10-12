/**
 * MusicTrack — what Advanced APPENDS under the strip's Music row (which
 * keeps its Simple look and still opens Media, where the track is chosen):
 * the video's ONE music clip on a lane as long as the video. Drag the clip
 * to move it, its edges to trim it, its top corners to set the fades
 * (TimeHandle — 44px hit areas, arrow keys too); each gesture is ONE undo
 * step (its own group). The bin (in the row header, so the lane is as wide
 * as every other track's) makes the video silent. The plan math is
 * music-track.ts → music-mix.ts.
 */
import { useRef, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { dragMusicHandle, musicClipStyle, playableSeconds, type MusicClip, type MusicHandle } from "@/lib/build/music-track";
import type { MusicTimingPatch } from "@/lib/build/music-mix";
import { MUSIC_LANE_SELECTOR, secondsPerPxOf } from "@/lib/build/strip-geometry";
import TimeHandle from "./TimeHandle";
import TrackRow from "./TrackRow";

interface MusicTrackProps {
  clip: MusicClip;
  /** The video's length, seconds. */
  totalSeconds: number;
  /** A drag tick: the patch, under the gesture's undo group. */
  onTiming: (patch: MusicTimingPatch, group: string) => void;
  onRemove: () => void;
}

const FADE_VISUAL = "pointer-events-none mt-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary opacity-70 group-hover/handle:opacity-100 group-focus-visible/handle:ring-2 group-focus-visible/handle:ring-ring";

export default function MusicTrack({ clip, totalSeconds, onTiming, onRemove }: MusicTrackProps) {
  const { t } = useTranslation();
  const style = musicClipStyle(clip, totalSeconds);
  // The clip as it was when the gesture began, and the gesture's undo group.
  const start = useRef({ clip, group: "" });
  const gestures = useRef(0);
  const perPx = secondsPerPxOf(MUSIC_LANE_SELECTOR, totalSeconds);

  const handle = (part: MusicHandle, label: string, value: number, className: string, visual?: ReactNode, place?: CSSProperties) => (
    <TimeHandle
      label={label}
      value={value}
      max={Math.max(totalSeconds, clip.durationSeconds)}
      secondsPerPx={perPx}
      onBegin={() => {
        gestures.current += 1;
        start.current = { clip, group: `video:music-mix:${gestures.current}` };
      }}
      onDelta={(d) => onTiming(dragMusicHandle(start.current.clip, part, d), start.current.group)}
      className={className}
      visual={visual}
      style={place}
    />
  );

  const play = playableSeconds(clip);
  const remove = (
    <button
      type="button"
      onClick={onRemove}
      aria-label={t("workspace.strip.music.remove")}
      title={t("workspace.strip.music.remove")}
      className="flex h-11 w-11 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
  return (
    // The same TrackRow as Text / Captions: the bin sits in the row header, so
    // the lane spans the full track width and a time lands under the same
    // scene boundary as on every other row.
    <TrackRow label={t("build.media.music")} controls={remove} columns="minmax(0, 1fr)">
      <div data-music-lane="" className="relative h-11 min-w-0 rounded-md border border-border bg-muted/40">
        <div className="group absolute inset-y-1" style={{ left: style.left, width: style.width }}>
          <div className="relative h-full overflow-hidden rounded border border-primary/40 bg-primary/10">
            {/* The fades, drawn as ramps over the clip. */}
            <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-gradient-to-r from-card/80 to-transparent" style={{ width: style.fadeIn }} />
            <span aria-hidden="true" className="absolute inset-y-0 right-0 bg-gradient-to-l from-card/80 to-transparent" style={{ width: style.fadeOut }} />
          </div>
          {/* The body (move) first; edges and fades sit over it, later wins. */}
          {handle("move", t("workspace.strip.music.move"), clip.startOffsetSec, "left-0 right-0 w-auto cursor-grab", <span aria-hidden="true" />)}
          {handle("start", t("workspace.strip.music.start"), clip.trimStartSec, "left-0 -translate-x-1/2")}
          {handle("end", t("workspace.strip.music.end"), play, "right-0 translate-x-1/2")}
          {handle("fadeIn", t("studio.audioMixer.fadeIn"), clip.fadeInSec, "-top-1 bottom-auto h-6 -translate-x-1/2 items-start", <span aria-hidden="true" className={FADE_VISUAL} />, {
            left: style.fadeIn,
          })}
          {handle("fadeOut", t("studio.audioMixer.fadeOut"), clip.fadeOutSec, "-top-1 bottom-auto h-6 translate-x-1/2 items-start", <span aria-hidden="true" className={FADE_VISUAL} />, {
            right: style.fadeOut,
          })}
        </div>
      </div>
    </TrackRow>
  );
}
