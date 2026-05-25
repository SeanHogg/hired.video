/**
 * Tests for `useBarDrag` — pin the 3-step pointer lifecycle every
 * timeline bar component depends on: begin captures snapshot, move
 * fires deltaSec + mode, end clears + fires onEnd.
 */

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBarDrag } from "../use-bar-drag";

/** Build a fake React pointer event with the minimal surface the
 *  hook reads — clientX, pointerId, currentTarget. */
function fakePointerEvent(
  opts: { clientX: number; pointerId?: number; trackWidth?: number } = { clientX: 0 },
): React.PointerEvent<HTMLElement> {
  const trackWidth = opts.trackWidth ?? 1000;
  const trackEl = {
    getBoundingClientRect: () => ({ width: trackWidth }) as DOMRect,
  } as unknown as HTMLElement;
  const target = {
    setPointerCapture: vi.fn(),
    closest: (sel: string) => (sel === "[data-track]" ? trackEl : null),
  } as unknown as HTMLElement;
  return {
    pointerId: opts.pointerId ?? 1,
    clientX: opts.clientX,
    currentTarget: target,
    stopPropagation: vi.fn(),
  } as unknown as React.PointerEvent<HTMLElement>;
}

describe("useBarDrag", () => {
  it("converts pixel delta to seconds based on track width + totalSeconds", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() =>
      useBarDrag<"move">({
        totalSeconds: 10,
        resolveTrackElement: (e) => (e.currentTarget as HTMLElement).closest("[data-track]") as HTMLElement,
        onMove,
      }),
    );
    // Begin a drag at clientX=100, track is 1000px wide.
    act(() => {
      result.current.begin(fakePointerEvent({ clientX: 100 }), "move");
    });
    // Move to clientX=200 → 100px delta = 10% of track = 1 second
    // (totalSeconds=10).
    act(() => {
      result.current.move(fakePointerEvent({ clientX: 200 }));
    });
    expect(onMove).toHaveBeenCalledWith(1, "move");
  });

  it("passes the mode through to onMove unchanged", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() =>
      useBarDrag<"trim-start" | "trim-end" | "fade-in" | "fade-out">({
        totalSeconds: 10,
        resolveTrackElement: (e) => (e.currentTarget as HTMLElement).closest("[data-track]") as HTMLElement,
        onMove,
      }),
    );
    act(() => {
      result.current.begin(fakePointerEvent({ clientX: 0 }), "trim-end");
    });
    act(() => {
      result.current.move(fakePointerEvent({ clientX: 50 }));
    });
    expect(onMove).toHaveBeenCalledWith(0.5, "trim-end");
  });

  it("ignores move events when no drag is active", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() =>
      useBarDrag<"move">({
        totalSeconds: 10,
        resolveTrackElement: () => null,
        onMove,
      }),
    );
    act(() => {
      result.current.move(fakePointerEvent({ clientX: 100 }));
    });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("ignores move events with a different pointerId than the begin", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() =>
      useBarDrag<"move">({
        totalSeconds: 10,
        resolveTrackElement: (e) => (e.currentTarget as HTMLElement).closest("[data-track]") as HTMLElement,
        onMove,
      }),
    );
    act(() => {
      result.current.begin(fakePointerEvent({ clientX: 0, pointerId: 1 }), "move");
    });
    act(() => {
      result.current.move(fakePointerEvent({ clientX: 100, pointerId: 2 }));
    });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("fires onEnd with the drag mode on pointer-up", () => {
    const onEnd = vi.fn();
    const { result } = renderHook(() =>
      useBarDrag<"move">({
        totalSeconds: 10,
        resolveTrackElement: (e) => (e.currentTarget as HTMLElement).closest("[data-track]") as HTMLElement,
        onMove: vi.fn(),
        onEnd,
      }),
    );
    act(() => {
      result.current.begin(fakePointerEvent({ clientX: 0 }), "move");
    });
    act(() => {
      result.current.end(fakePointerEvent({ clientX: 100 }));
    });
    expect(onEnd).toHaveBeenCalledWith("move");
  });

  it("subsequent move after end is a no-op (drag fully cleared)", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() =>
      useBarDrag<"move">({
        totalSeconds: 10,
        resolveTrackElement: (e) => (e.currentTarget as HTMLElement).closest("[data-track]") as HTMLElement,
        onMove,
      }),
    );
    act(() => {
      result.current.begin(fakePointerEvent({ clientX: 0 }), "move");
    });
    act(() => {
      result.current.end(fakePointerEvent({ clientX: 100 }));
    });
    onMove.mockClear();
    act(() => {
      result.current.move(fakePointerEvent({ clientX: 200 }));
    });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("bails out cleanly when resolveTrackElement returns null", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() =>
      useBarDrag<"move">({
        totalSeconds: 10,
        resolveTrackElement: () => null,
        onMove,
      }),
    );
    // begin with no resolvable track — should NOT throw and should
    // leave drag inactive.
    act(() => {
      result.current.begin(fakePointerEvent({ clientX: 0 }), "move");
    });
    act(() => {
      result.current.move(fakePointerEvent({ clientX: 200 }));
    });
    expect(onMove).not.toHaveBeenCalled();
  });
});
