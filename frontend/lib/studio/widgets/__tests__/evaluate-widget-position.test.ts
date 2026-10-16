/**
 * Widget transform keyframes (#808 / #3160): evaluateWidgetPositionAt
 * reuses effect-param `evaluateKeyframes` so x/y/width/height/rotation
 * lerp the same way a keyframed opacity does. resolveFrame consumes the
 * pose; enter/exit motion still applies on top.
 *
 * Run: vitest run lib/studio/widgets/__tests__/evaluate-widget-position.test.ts
 */
import { describe, it, expect } from "vitest";
import { defaultWidget, type Widget, type WidgetPosition } from "@/lib/studio/editor-v2/canvas-state";
import { evaluateWidgetPositionAt, parseWidgetKeyframes } from "@/lib/studio/widgets/evaluate-widget-position";
import { frameInputFromWidget, resolveFrame } from "@/lib/studio/widgets/frame";
import { clipToWidget, widgetToClip } from "@/lib/studio/editor-v2/timeline-widget-emit";
import { resolveClipFrame } from "@/lib/timeline/effects/widget-frame";

const CANVAS = { width: 1000, height: 500 };

function posed(overrides: Partial<WidgetPosition> = {}): Widget {
  const w = defaultWidget("shape-rect");
  return {
    ...w,
    position: {
      x: 0.1,
      y: 0.2,
      width: 0.4,
      height: 0.3,
      z: 4,
      rotation: 0,
      ...overrides,
    },
  };
}

describe("evaluateWidgetPositionAt", () => {
  it("returns the static position identity when there are no keyframes", () => {
    const w = posed();
    expect(evaluateWidgetPositionAt(w, 0)).toBe(w.position);
    expect(evaluateWidgetPositionAt(w, 12)).toBe(w.position);
    expect(evaluateWidgetPositionAt({ ...w, keyframes: [] }, 1)).toBe(w.position);
  });

  it("lerps x/y/rotation/width/height between two keyframes", () => {
    const w: Widget = {
      ...posed(),
      keyframes: [
        { atSec: 0, position: { x: 0, y: 0, width: 0.2, height: 0.2, rotation: 0 } },
        { atSec: 4, position: { x: 0.8, y: 0.4, width: 0.6, height: 0.6, rotation: 90 } },
      ],
    };
    const mid = evaluateWidgetPositionAt(w, 2);
    expect(mid.x).toBeCloseTo(0.4);
    expect(mid.y).toBeCloseTo(0.2);
    expect(mid.width).toBeCloseTo(0.4);
    expect(mid.height).toBeCloseTo(0.4);
    expect(mid.rotation).toBeCloseTo(45);
    expect(mid.z).toBe(4);
  });

  it("holds the first sample before it and the last sample after it", () => {
    const w: Widget = {
      ...posed({ x: 0.5, rotation: 10 }),
      keyframes: [
        { atSec: 2, position: { x: 0.1, rotation: 0 } },
        { atSec: 6, position: { x: 0.9, rotation: 80 } },
      ],
    };
    expect(evaluateWidgetPositionAt(w, 0).x).toBeCloseTo(0.1);
    expect(evaluateWidgetPositionAt(w, 0).rotation).toBeCloseTo(0);
    expect(evaluateWidgetPositionAt(w, 2).x).toBeCloseTo(0.1);
    expect(evaluateWidgetPositionAt(w, 8).x).toBeCloseTo(0.9);
    expect(evaluateWidgetPositionAt(w, 8).rotation).toBeCloseTo(80);
  });

  it("partial position only overrides listed fields; z is never interpolated", () => {
    const w: Widget = {
      ...posed({ x: 0.1, y: 0.2, width: 0.4, height: 0.3, z: 7, rotation: 15 }),
      keyframes: [
        { atSec: 0, position: { x: 0 } },
        { atSec: 2, position: { x: 1, z: 99 } },
      ],
    };
    const mid = evaluateWidgetPositionAt(w, 1);
    expect(mid.x).toBeCloseTo(0.5);
    expect(mid.y).toBe(0.2);
    expect(mid.width).toBe(0.4);
    expect(mid.height).toBe(0.3);
    expect(mid.rotation).toBe(15);
    expect(mid.z).toBe(7);
  });
});

describe("parseWidgetKeyframes", () => {
  it("drops malformed samples and empty payloads", () => {
    expect(parseWidgetKeyframes(undefined)).toBeUndefined();
    expect(parseWidgetKeyframes([])).toBeUndefined();
    expect(parseWidgetKeyframes([{ atSec: "0", position: { x: 1 } }])).toBeUndefined();
    expect(parseWidgetKeyframes([{ atSec: 0, position: {} }])).toBeUndefined();
    expect(parseWidgetKeyframes([{ atSec: 1, position: { x: 0.25 } }])).toEqual([
      { atSec: 1, position: { x: 0.25 } },
    ]);
  });
});

describe("resolveFrame consumes the evaluated pose", () => {
  it("moves the box with the playhead and still applies enter/exit motion on top", () => {
    const w: Widget = {
      ...posed({ x: 0, y: 0, width: 0.2, height: 0.2, rotation: 0 }),
      keyframes: [
        { atSec: 0, position: { x: 0, y: 0 } },
        { atSec: 4, position: { x: 0.8, y: 0.4 } },
      ],
      motion: {
        enter: { kind: "fade", durationSeconds: 0.4, easing: "linear" },
        exit: { kind: "fade", durationSeconds: 0.4, easing: "linear" },
      },
    };
    const mid = resolveFrame(frameInputFromWidget(w, 2), CANVAS, {
      clipTimeSec: 2,
      clipDurationSec: 4,
    });
    expect(mid.box.x).toBeCloseTo(400);
    expect(mid.box.y).toBeCloseTo(100);
    expect(mid.box.w).toBeCloseTo(200);
    expect(mid.box.h).toBeCloseTo(100);
    // Mid-clip fade is fully opaque; motion still produced an AnimateOutput.
    expect(mid.animate.alpha).toBe(1);
    expect(mid.input.motion).not.toBeNull();
  });
});

describe("timeline emit round-trips keyframes for export", () => {
  it("clipToWidget restores samples and resolveClipFrame evaluates at scene time", () => {
    const w: Widget = {
      ...posed({ x: 0, y: 0, width: 0.2, height: 0.2 }),
      visibleFrom: 2,
      visibleTo: 6,
      keyframes: [
        { atSec: 2, position: { x: 0 } },
        { atSec: 6, position: { x: 0.8 } },
      ],
    };
    const clip = widgetToClip(w, 0, 180, 30, { fontFamily: "Inter" });
    expect(clip).not.toBeNull();
    const restored = clipToWidget(clip!, 0, 30);
    expect(restored?.keyframes).toEqual(w.keyframes);

    const params = clip!.effects[0]!.params;
    // Clip-local 2s + origin 2s = scene 4s → midpoint of 2..6.
    const frame = resolveClipFrame(params, {
      canvas: CANVAS as unknown as HTMLCanvasElement,
      clipFrame: 60,
      clipDurationFrames: 120,
      fps: 30,
    });
    expect(frame.box.x).toBeCloseTo(400);
  });
});
