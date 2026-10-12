/**
 * Tests for `useVideoWidgetSync` (#559) — pin the play/pause/seek
 * contract the editor's playback clock depends on.
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useVideoWidgetSync } from "../use-video-widget-sync";
import { useRef } from "react";

/** Build a fake `<video>` element exposing the surface the hook reads. */
function fakeVideoElement(initial: { currentTime?: number } = {}) {
  return {
    currentTime: initial.currentTime ?? 0,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  } as unknown as HTMLVideoElement;
}

describe("useVideoWidgetSync", () => {
  it("plays when isPlayback flips true", () => {
    const el = fakeVideoElement();
    const { result } = renderHook(() => {
      const ref = useRef<HTMLVideoElement | null>(el);
      useVideoWidgetSync({ clipTimeSec: 0, isPlayback: true }, ref);
      return ref;
    });
    expect(result.current.current).toBe(el);
    expect((el.play as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it("pauses when isPlayback is false", () => {
    const el = fakeVideoElement({ currentTime: 1.5 });
    renderHook(() => {
      const ref = useRef<HTMLVideoElement | null>(el);
      useVideoWidgetSync({ clipTimeSec: 1.5, isPlayback: false }, ref);
      return ref;
    });
    expect((el.pause as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it("seeks the element when clipTimeSec diverges past tolerance", () => {
    const el = fakeVideoElement({ currentTime: 0 });
    renderHook(() => {
      const ref = useRef<HTMLVideoElement | null>(el);
      useVideoWidgetSync({ clipTimeSec: 2.0, isPlayback: false }, ref);
      return ref;
    });
    expect(el.currentTime).toBe(2.0);
  });

  it("doesn't seek when divergence is within tolerance (avoid stutter)", () => {
    const el = fakeVideoElement({ currentTime: 1.0 });
    renderHook(() => {
      const ref = useRef<HTMLVideoElement | null>(el);
      // 0.1s divergence is below the 0.15s tolerance.
      useVideoWidgetSync({ clipTimeSec: 1.1, isPlayback: false }, ref);
      return ref;
    });
    expect(el.currentTime).toBe(1.0);
  });

  it("swallows play() promise rejection (autoplay block)", () => {
    const el = fakeVideoElement();
    (el.play as ReturnType<typeof vi.fn>).mockReturnValue(
      Promise.reject(new Error("autoplay blocked")),
    );
    expect(() => {
      renderHook(() => {
        const ref = useRef<HTMLVideoElement | null>(el);
        useVideoWidgetSync({ clipTimeSec: 0, isPlayback: true }, ref);
        return ref;
      });
    }).not.toThrow();
  });

  it("mints a ref when one isn't provided", () => {
    const { result } = renderHook(() =>
      useVideoWidgetSync({ clipTimeSec: 0, isPlayback: false }),
    );
    expect(result.current.current).toBeNull();
  });
});
