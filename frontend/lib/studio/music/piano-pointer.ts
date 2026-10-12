/**
 * Piano-key pointer / touch state machine (#2162).
 *
 * `PianoKey` in Keyboard.tsx used a boolean `heldRef` plus unscoped
 * pointerup/leave/cancel. That is fine for a mouse click; it is wrong
 * for mobile multi-touch:
 *
 *   - Two fingers on the SAME key: the second down was ignored (ok)
 *     but the first up/leave released the note while the second finger
 *     was still holding.
 *   - Two fingers on DIFFERENT keys: iOS/Android often fire
 *     `pointerleave` on the first key when the second finger lands.
 *     Combined with boolean held, that killed the first note of a chord.
 *   - `setPointerCapture` was called on `event.target` (the inner
 *     label span, unless `pointer-events: none`) rather than
 *     `currentTarget`.
 *   - No `touch-action: none`, so the overflow-x keyboard scroller
 *     stole the gesture as a pan.
 *
 * This reducer tracks a Set of pointerIds per key:
 *   - first pointer down → note-on
 *   - extra downs on the same key are counted, no extra note-on
 *   - up/cancel of one pointer only note-offs when the set is empty
 *   - touch `pointerleave` is ignored (touch always delivers up/cancel)
 *   - mouse `pointerleave` while captured is ignored (capture owns the
 *     pointer until up/cancel — drag-off still ends on mouseup)
 *   - mouse `pointerleave` without capture still releases (fallback so
 *     a failed capture cannot stick a note)
 *
 * Keyboard.tsx PianoKey should spread `usePianoKeyPointer(onDown, onUp)`
 * onto the key div instead of the boolean heldRef handlers.
 */

import { useCallback, useRef } from "react";

export const PIANO_KEY_TOUCH_STYLE: React.CSSProperties = {
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
};

export interface PianoKeyPointerState {
  /** pointerIds currently holding this key. */
  held: ReadonlySet<number>;
  /** pointerIds we asked the element to capture. */
  captured: ReadonlySet<number>;
}

export type PianoKeyPointerEventKind = "down" | "up" | "leave" | "cancel";

export type PianoKeyPointerType = "mouse" | "touch" | "pen" | string;

export interface PianoKeyPointerEvent {
  kind: PianoKeyPointerEventKind;
  pointerId: number;
  pointerType?: PianoKeyPointerType;
}

export type PianoKeyPointerEffect =
  | { type: "note-on" }
  | { type: "note-off" }
  | { type: "capture"; pointerId: number }
  | { type: "release-capture"; pointerId: number }
  | { type: "prevent-default" };

export function emptyPianoKeyPointerState(): PianoKeyPointerState {
  return { held: new Set(), captured: new Set() };
}

function cloneState(state: PianoKeyPointerState): {
  held: Set<number>;
  captured: Set<number>;
} {
  return {
    held: new Set(state.held),
    captured: new Set(state.captured),
  };
}

function isTouch(pointerType: PianoKeyPointerType | undefined): boolean {
  return pointerType === "touch";
}

/**
 * Pure reducer — tests drive this directly with synthetic pointerIds.
 * Effects are applied by `usePianoKeyPointer` (or a test harness).
 */
export function reducePianoKeyPointer(
  state: PianoKeyPointerState,
  event: PianoKeyPointerEvent,
): { state: PianoKeyPointerState; effects: PianoKeyPointerEffect[] } {
  const next = cloneState(state);
  const effects: PianoKeyPointerEffect[] = [];
  const { kind, pointerId } = event;

  if (kind === "down") {
    effects.push({ type: "prevent-default" });
    effects.push({ type: "capture", pointerId });
    next.captured.add(pointerId);
    const wasEmpty = next.held.size === 0;
    next.held.add(pointerId);
    if (wasEmpty) effects.push({ type: "note-on" });
    return { state: next, effects };
  }

  if (kind === "leave") {
    // Touch always delivers pointerup / pointercancel. Honouring leave
    // on touch is what kills a chord when the second finger lands.
    if (isTouch(event.pointerType)) return { state, effects };
    // Capture owns the pointer until up/cancel. Leave still fires when
    // the cursor exits the key box, but mouseup will arrive here.
    if (next.captured.has(pointerId)) return { state, effects };
    // Capture failed (legacy / iOS quirk) — treat leave as release so
    // a mouse drag-off cannot stick the note.
  }

  if (kind === "up" || kind === "cancel" || kind === "leave") {
    if (!next.held.has(pointerId)) return { state, effects };
    next.held.delete(pointerId);
    if (next.captured.has(pointerId)) {
      next.captured.delete(pointerId);
      effects.push({ type: "release-capture", pointerId });
    }
    if (next.held.size === 0) effects.push({ type: "note-off" });
    return { state: next, effects };
  }

  return { state, effects };
}

export interface PianoKeyPointerHandlers {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
}

/**
 * Per-key hook. Each PianoKey mounts its own instance so two fingers
 * on two keys are two independent state machines (the chord case).
 */
export function usePianoKeyPointer(
  onDown: () => void,
  onUp: () => void,
): { handlers: PianoKeyPointerHandlers; style: React.CSSProperties } {
  const stateRef = useRef<PianoKeyPointerState>(emptyPianoKeyPointerState());
  const onDownRef = useRef(onDown);
  const onUpRef = useRef(onUp);
  onDownRef.current = onDown;
  onUpRef.current = onUp;

  const apply = useCallback(
    (event: React.PointerEvent<HTMLElement>, kind: PianoKeyPointerEventKind) => {
      const { state, effects } = reducePianoKeyPointer(stateRef.current, {
        kind,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
      });
      stateRef.current = state;
      for (const fx of effects) {
        switch (fx.type) {
          case "prevent-default":
            event.preventDefault();
            break;
          case "capture":
            event.currentTarget.setPointerCapture?.(fx.pointerId);
            break;
          case "release-capture":
            if (event.currentTarget.hasPointerCapture?.(fx.pointerId)) {
              event.currentTarget.releasePointerCapture?.(fx.pointerId);
            }
            break;
          case "note-on":
            onDownRef.current();
            break;
          case "note-off":
            onUpRef.current();
            break;
        }
      }
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => apply(e, "down"),
    [apply],
  );
  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => apply(e, "up"),
    [apply],
  );
  const onPointerLeave = useCallback(
    (e: React.PointerEvent<HTMLElement>) => apply(e, "leave"),
    [apply],
  );
  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLElement>) => apply(e, "cancel"),
    [apply],
  );

  return {
    handlers: { onPointerDown, onPointerUp, onPointerLeave, onPointerCancel },
    style: PIANO_KEY_TOUCH_STYLE,
  };
}
