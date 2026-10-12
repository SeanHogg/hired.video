/**
 * `<AudioBar>` — single draggable timeline bar for a music or
 * voiceover clip (#1115). Closes the audio-timeline-UI half of #567.
 *
 * Five interaction modes, all driven by the shared `useBarDrag` hook:
 *   - `move`         → body drag updates `startOffsetSec`
 *   - `trim-start`   → left edge drag updates `trimStartSec`
 *   - `trim-end`     → right edge drag updates `trimEndSec`
 *   - `fade-in`      → left fade triangle drag updates `fadeInSec`
 *   - `fade-out`     → right fade triangle drag updates `fadeOutSec`
 *
 * Per the DRY rule the pointer math lives ONCE in `useBarDrag`; this
 * component only knows how each mode maps to its clamp. The same hook
 * powers SceneBlock + WidgetBlock + this bar (the existing blocks
 * keep their inline drag for now but the hook is available for their
 * next refactor pass).
 *
 * The component is presentational + state-bound — accepts a typed
 * `value` snapshot of the clip's editable timing + emits a single
 * `onChange` per drag tick with the next value. Caller commits to
 * history on `onCommit` (fires on pointer-up).
 */
import { useRef } from "react";
import { useBarDrag } from "@/lib/studio/editor-v2/use-bar-drag";
import { cn } from "@/lib/utils";

export type AudioBarMode =
  | "move"
  | "trim-start"
  | "trim-end"
  | "fade-in"
  | "fade-out";

/** Editable timing snapshot the bar reads + emits. All values are in
 *  seconds. The bar enforces "playable length must stay positive" +
 *  "fades fit inside the clip" + "trim values are non-negative" so
 *  the parent's clamps stay simple. */
export interface AudioBarValue {
  /** Composition-time start. Music: `startOffsetSec`. Voiceover:
   *  `anchorSceneStartSec + startOffsetSec`. Caller resolves anchor. */
  startSec: number;
  /** Composition-time end (= start + playable length). */
  endSec: number;
  /** Source-file trim at the head, in seconds. */
  trimStartSec: number;
  /** Source-file trim at the tail, in seconds. */
  trimEndSec: number;
  /** Fade-in length in seconds. */
  fadeInSec: number;
  /** Fade-out length in seconds. */
  fadeOutSec: number;
  /** Maximum playable length from the source (= source duration). The
   *  bar uses this to clamp trim drags so a user can't trim past the
   *  end of the audio. */
  sourceDurationSec: number;
}

interface AudioBarProps {
  value: AudioBarValue;
  /** Total composition length in seconds — drives bar width math. */
  totalSeconds: number;
  /** Display label inside the bar. */
  label: string;
  /** True when the bar is currently selected (highlights). */
  selected: boolean;
  /** Per-track accent class — voiceover uses one colour, music
   *  another, so the user can tell rows apart at a glance. */
  accentClass?: string;
  /** Fired on every drag tick with the next value (still in-flight).
   *  Parent applies clamps + re-renders. */
  onChange: (next: AudioBarValue) => void;
  /** Fired once on pointer-up — parent's history wrapper commits the
   *  current value as a single undo step (instead of N intermediate
   *  steps fired during the drag). */
  onCommit: () => void;
  /** Click-without-drag handler. Selects the bar in the parent. */
  onSelect: () => void;
}

const MIN_PLAYABLE_SEC = 0.05;

export default function AudioBar({
  value,
  totalSeconds,
  label,
  selected,
  accentClass,
  onChange,
  onCommit,
  onSelect,
}: AudioBarProps) {
  // Pointer-down snapshot — captures the start state once so move
  // ticks read from a stable base instead of re-deriving from the
  // possibly-mid-drag `value` prop (which would feedback-amplify).
  const snapshotRef = useRef<AudioBarValue | null>(null);

  const drag = useBarDrag<AudioBarMode>({
    totalSeconds,
    resolveTrackElement: (e) => {
      const el = (e.currentTarget as HTMLElement).closest("[data-audio-track]");
      return el instanceof HTMLElement ? el : null;
    },
    onMove: (deltaSec, mode) => {
      const snap = snapshotRef.current;
      if (!snap) return;
      const next = applyDelta(snap, deltaSec, mode);
      onChange(next);
    },
    onEnd: () => {
      snapshotRef.current = null;
      onCommit();
    },
  });

  function begin(event: React.PointerEvent<HTMLElement>, mode: AudioBarMode) {
    snapshotRef.current = { ...value };
    drag.begin(event, mode);
  }

  const leftPct = totalSeconds > 0 ? (value.startSec / totalSeconds) * 100 : 0;
  const widthPct =
    totalSeconds > 0 ? ((value.endSec - value.startSec) / totalSeconds) * 100 : 0;
  const playableSec = Math.max(MIN_PLAYABLE_SEC, value.endSec - value.startSec);
  // Fade widths as fraction-of-bar — used to size the visual triangles
  // so the user sees where the gain ramp lands.
  const fadeInFrac = Math.min(1, value.fadeInSec / playableSec);
  const fadeOutFrac = Math.min(1, value.fadeOutSec / playableSec);

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => begin(e, "move")}
      onPointerMove={drag.move}
      onPointerUp={drag.end}
      onPointerCancel={drag.end}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "absolute top-1 bottom-1 flex cursor-grab items-center overflow-hidden rounded border px-1.5 text-[10px] transition",
        accentClass ?? "border-amber-500/40 bg-amber-500/15 hover:border-amber-500",
        selected && "border-brand-primary bg-brand-primary/20",
      )}
      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      aria-label={`Audio bar ${label}`}
    >
      {/* Fade-in triangle — visualises the gain ramp + acts as the
          drag-to-resize fade-in handle. Width = fadeIn fraction of bar. */}
      <span
        onPointerDown={(e) => begin(e, "fade-in")}
        onPointerMove={drag.move}
        onPointerUp={drag.end}
        onPointerCancel={drag.end}
        className="absolute left-0 top-0 bottom-0 cursor-ew-resize bg-gradient-to-r from-black/40 to-transparent"
        style={{ width: `${Math.max(2, fadeInFrac * 100)}%` }}
        aria-label="Fade in"
      />
      {/* Trim-start handle — narrower hit-area on the absolute left
          edge so the fade triangle gets the wider one. */}
      <span
        onPointerDown={(e) => begin(e, "trim-start")}
        onPointerMove={drag.move}
        onPointerUp={drag.end}
        onPointerCancel={drag.end}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-brand-primary"
        aria-label="Trim start"
      />
      <span className="truncate px-1">{label}</span>
      {/* Trim-end handle on the absolute right edge. */}
      <span
        onPointerDown={(e) => begin(e, "trim-end")}
        onPointerMove={drag.move}
        onPointerUp={drag.end}
        onPointerCancel={drag.end}
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-brand-primary"
        aria-label="Trim end"
      />
      {/* Fade-out triangle. */}
      <span
        onPointerDown={(e) => begin(e, "fade-out")}
        onPointerMove={drag.move}
        onPointerUp={drag.end}
        onPointerCancel={drag.end}
        className="absolute right-0 top-0 bottom-0 cursor-ew-resize bg-gradient-to-l from-black/40 to-transparent"
        style={{ width: `${Math.max(2, fadeOutFrac * 100)}%` }}
        aria-label="Fade out"
      />
    </div>
  );
}

/** Shrink fade-in + fade-out so their sum doesn't exceed the new
 *  playable length. Fade-in keeps priority (it was authored first);
 *  fade-out fills the remainder. */
function fitFadesToPlayable(
  fadeIn: number,
  fadeOut: number,
  playable: number,
): { fadeIn: number; fadeOut: number } {
  const cappedFadeIn = Math.max(0, Math.min(fadeIn, playable));
  const cappedFadeOut = Math.max(0, Math.min(fadeOut, playable - cappedFadeIn));
  return { fadeIn: cappedFadeIn, fadeOut: cappedFadeOut };
}

/** Pure delta application — exported for tests + future reuse from
 *  keyboard-nudge handlers. Per-mode clamps live HERE so the parent
 *  doesn't re-derive them. */
export function applyDelta(
  snap: AudioBarValue,
  deltaSec: number,
  mode: AudioBarMode,
): AudioBarValue {
  const playable = snap.endSec - snap.startSec;
  switch (mode) {
    case "move": {
      // Drag the bar laterally — both ends move together. Clamp the
      // start to ≥ 0; the end can run past totalSeconds (the
      // composition trims silently). Trim values are untouched.
      const nextStart = Math.max(0, snap.startSec + deltaSec);
      return {
        ...snap,
        startSec: nextStart,
        endSec: nextStart + playable,
      };
    }
    case "trim-start": {
      // Drag the bar's left edge in / out — shortens playable length
      // from the head. Trim values move so the source-file pointer
      // jumps to a later position. Clamp so playable stays ≥ MIN.
      const nextStart = Math.min(
        snap.endSec - MIN_PLAYABLE_SEC,
        Math.max(0, snap.startSec + deltaSec),
      );
      const trimDelta = nextStart - snap.startSec;
      const nextTrimStart = Math.max(0, snap.trimStartSec + trimDelta);
      const nextPlayable = snap.endSec - nextStart;
      // If the new playable is shorter than the existing fade budget,
      // shrink the fades to fit. Fade-in scaling first; fade-out picks
      // up whatever's left.
      const { fadeIn, fadeOut } = fitFadesToPlayable(
        snap.fadeInSec,
        snap.fadeOutSec,
        nextPlayable,
      );
      return {
        ...snap,
        startSec: nextStart,
        trimStartSec: nextTrimStart,
        fadeInSec: fadeIn,
        fadeOutSec: fadeOut,
      };
    }
    case "trim-end": {
      // Drag the bar's right edge — shortens / extends playable
      // length from the tail. Clamp so playable stays ≥ MIN AND so
      // the played length doesn't exceed `sourceDurationSec` minus
      // trim-start (can't play past the end of the source file).
      const maxEnd =
        snap.startSec + (snap.sourceDurationSec - snap.trimStartSec);
      const nextEnd = Math.max(
        snap.startSec + MIN_PLAYABLE_SEC,
        Math.min(maxEnd, snap.endSec + deltaSec),
      );
      const trimDelta = snap.endSec - nextEnd;
      const nextTrimEnd = Math.max(0, snap.trimEndSec + trimDelta);
      const nextPlayable = nextEnd - snap.startSec;
      const { fadeIn, fadeOut } = fitFadesToPlayable(
        snap.fadeInSec,
        snap.fadeOutSec,
        nextPlayable,
      );
      return {
        ...snap,
        endSec: nextEnd,
        trimEndSec: nextTrimEnd,
        fadeInSec: fadeIn,
        fadeOutSec: fadeOut,
      };
    }
    case "fade-in": {
      // Drag the fade-in triangle. The triangle's right edge sits at
      // `startSec + fadeInSec`; dragging that edge expands or shrinks
      // the fade. Clamp 0 ≤ fadeIn ≤ playable - fadeOut so fades
      // can't overlap.
      const playableLen = snap.endSec - snap.startSec;
      const headroom = Math.max(0, playableLen - snap.fadeOutSec);
      return {
        ...snap,
        fadeInSec: Math.max(0, Math.min(headroom, snap.fadeInSec + deltaSec)),
      };
    }
    case "fade-out": {
      // Drag the fade-out triangle. The triangle's left edge sits at
      // `endSec - fadeOutSec`; dragging it LEFT grows the fade
      // (deltaSec is negative when dragging left, so subtract).
      const playableLen = snap.endSec - snap.startSec;
      const headroom = Math.max(0, playableLen - snap.fadeInSec);
      return {
        ...snap,
        fadeOutSec: Math.max(0, Math.min(headroom, snap.fadeOutSec - deltaSec)),
      };
    }
  }
}
