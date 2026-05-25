/**
 * `useBarDrag` — shared timeline-bar pointer interaction hook.
 *
 * Closes the studio-audit DRY finding that AdvancedTimeline's
 * `SceneBlock`, `WidgetBlock`, and the new audio `<AudioBar>` (#1115)
 * each carried their own pointer-capture + delta-seconds math. The
 * shape is identical across all three: pointer-down on a handle
 * records start state, pointer-move converts pixel delta to seconds
 * relative to the track width, pointer-up clears. Adding a new bar
 * kind (timeline markers, SFX hits, chapter pins) shouldn't mean
 * re-implementing the same 40 lines of drag plumbing.
 *
 * The hook is mode-agnostic — callers pass their own discriminated
 * mode string and receive the seconds delta on every move. Caller
 * does the clamping + the actual state mutation.
 *
 * Per the standing DRY rule (`feedback_extract_on_duplication`):
 * one source for "drag a bar on a horizontal timeline" — the per-bar
 * components stay focused on layout + their kind-specific clamps.
 */
import { useCallback, useRef } from "react";

export interface BarDragHandlers<Mode extends string> {
  /** Begin a drag. The component calls this from `onPointerDown` of
   *  whichever handle was grabbed (the bar body, a trim handle, a
   *  fade handle). `mode` discriminates so callers can branch their
   *  per-mode math when `onMove` fires. */
  begin: (event: React.PointerEvent<HTMLElement>, mode: Mode) => void;
  /** Forward `onPointerMove` here. Fires `onMove` with the delta in
   *  seconds relative to the track width AND the mode passed to
   *  `begin`. No-op when no drag is active. */
  move: (event: React.PointerEvent<HTMLElement>) => void;
  /** Forward `onPointerUp` + `onPointerCancel`. Releases pointer
   *  capture + fires `onEnd` for any caller-side commit (history
   *  push, autosave debounce reset). No-op when no drag is active. */
  end: (event: React.PointerEvent<HTMLElement>) => void;
}

export interface UseBarDragOpts<Mode extends string> {
  /** Width of the timeline track in seconds — drives the pixel→seconds
   *  conversion. Pulled fresh per `begin()` so re-renders that shrink
   *  / grow the track don't poison an in-flight drag. */
  totalSeconds: number;
  /** Selector that walks up from the pointer-target to the track
   *  element whose pixel width drives the conversion. Returning null
   *  cancels the drag — defensive guard for ref-not-mounted-yet edge
   *  cases. */
  resolveTrackElement: (event: React.PointerEvent<HTMLElement>) => HTMLElement | null;
  /** Per-tick callback — receives the seconds delta from drag-start
   *  AND the mode the drag was begun with. Caller applies the delta
   *  to its bar's state with kind-specific clamping. */
  onMove: (deltaSeconds: number, mode: Mode) => void;
  /** Optional drag-end hook. Called once on pointer-up/cancel — caller
   *  uses this to commit history, fire autosave debounce, etc. */
  onEnd?: (mode: Mode) => void;
}

interface InFlightDrag<Mode extends string> {
  pointerId: number;
  mode: Mode;
  startClientX: number;
  trackWidthPx: number;
}

/** Build the three handler functions a bar component spreads onto its
 *  pointer events. Generic over the mode union so each bar can carry
 *  its own discriminator (e.g. `"move" | "trim-start" | "trim-end" |
 *  "fade-in" | "fade-out"` for audio bars). */
export function useBarDrag<Mode extends string>({
  totalSeconds,
  resolveTrackElement,
  onMove,
  onEnd,
}: UseBarDragOpts<Mode>): BarDragHandlers<Mode> {
  const dragRef = useRef<InFlightDrag<Mode> | null>(null);

  const begin = useCallback(
    (event: React.PointerEvent<HTMLElement>, mode: Mode) => {
      event.stopPropagation();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const trackEl = resolveTrackElement(event);
      if (!trackEl) return;
      dragRef.current = {
        pointerId: event.pointerId,
        mode,
        startClientX: event.clientX,
        trackWidthPx: trackEl.getBoundingClientRect().width,
      };
    },
    [resolveTrackElement],
  );

  const move = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.trackWidthPx <= 0) return;
      const deltaSeconds =
        ((event.clientX - drag.startClientX) / drag.trackWidthPx) * totalSeconds;
      onMove(deltaSeconds, drag.mode);
    },
    [onMove, totalSeconds],
  );

  const end = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      onEnd?.(drag.mode);
    },
    [onEnd],
  );

  return { begin, move, end };
}
