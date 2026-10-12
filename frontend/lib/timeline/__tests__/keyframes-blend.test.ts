/**
 * NLE M2 (#282): keyframe tracks on effect params and per-widget blend
 * modes. Pins the evaluation math, the two dispatch seams (registry
 * `applyEffects` + widget `resolveFrame`) and that the DOM preview and the
 * export painter read the same blend mode.
 *
 * Run: vitest run lib/timeline/__tests__/keyframes-blend.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  evaluateKeyframes,
  isKeyframeTrack,
  rampTrack,
  resolveKeyframedParams,
  trackStartValue,
} from "@/lib/timeline/effects/keyframes";
import { BLEND_MODES, blendModeLabelKey, resolveBlendMode } from "@/lib/timeline/effects/blend";
import { applyEffects, registerEffect } from "@/lib/timeline/effects/registry";
import { defaultWidget, type Widget } from "@/lib/studio/editor-v2/canvas-state";
import { frameInputFromWidget, resolveFrame } from "@/lib/studio/widgets/frame";
import { applyFrameToCtx, type Ctx2D } from "@/lib/studio/widgets/frame-canvas";
import { frameToCss } from "@/lib/studio/widgets/frame-css";

const CANVAS = { width: 1920, height: 1080 };

/** A text widget shaped like a saved canvas-state widget. */
function widgetWith(effects: Widget["effects"]): Widget {
  return { ...defaultWidget("text"), effects };
}

describe("evaluateKeyframes", () => {
  const fade = rampTrack(0, 1);

  it("interpolates linearly between two keyframes", () => {
    expect(evaluateKeyframes(fade, 0)).toBe(0);
    expect(evaluateKeyframes(fade, 0.25)).toBeCloseTo(0.25);
    expect(evaluateKeyframes(fade, 1)).toBe(1);
  });

  it("clamps progress outside 0..1 and holds the end values", () => {
    expect(evaluateKeyframes(fade, -3)).toBe(0);
    expect(evaluateKeyframes(fade, 7)).toBe(1);
    expect(evaluateKeyframes(fade, Number.NaN)).toBe(0);
  });

  it("applies the curve of the segment's starting keyframe", () => {
    const easeIn = rampTrack(0, 100, "ease-in");
    // cubic ease-in at 0.5 = 0.125
    expect(evaluateKeyframes(easeIn, 0.5)).toBeCloseTo(12.5);
  });

  it("holds a 'hold' keyframe until the next one, and sorts unsorted tracks", () => {
    const track = {
      keyframes: [
        { t: 1, value: 30 },
        { t: 0, value: 10, easing: "hold" as const },
        { t: 0.5, value: 20 },
      ],
    };
    expect(evaluateKeyframes(track, 0.4)).toBe(10);
    expect(evaluateKeyframes(track, 0.75)).toBeCloseTo(25);
  });

  it("a single keyframe is a constant", () => {
    expect(evaluateKeyframes({ keyframes: [{ t: 0.3, value: 4 }] }, 0.9)).toBe(4);
  });
});

describe("isKeyframeTrack / resolveKeyframedParams", () => {
  it("rejects static values and malformed tracks", () => {
    expect(isKeyframeTrack(0.5)).toBe(false);
    expect(isKeyframeTrack({ keyframes: [] })).toBe(false);
    expect(isKeyframeTrack({ keyframes: [{ t: "0", value: 1 }] })).toBe(false);
    expect(isKeyframeTrack({ keyframes: [{ t: 0, value: 1, easing: "bounce" }] })).toBe(false);
    expect(isKeyframeTrack([{ t: 0, value: 1 }])).toBe(false);
  });

  it("returns the same params object when nothing is keyframed", () => {
    const params = { tx: 10, scale: 1.2 };
    expect(resolveKeyframedParams(params, 0.5)).toBe(params);
  });

  it("resolves only the keyframed keys", () => {
    const out = resolveKeyframedParams({ tx: rampTrack(0, 200), scale: 1.5 }, 0.5);
    expect(out).toEqual({ tx: 100, scale: 1.5 });
  });

  it("collapses a track to its opening value when animation is switched off", () => {
    expect(trackStartValue(rampTrack(0.2, 0.9))).toBe(0.2);
  });
});

describe("applyEffects resolves keyframes before dispatch", () => {
  const seen: unknown[] = [];
  registerEffect({
    kind: "test-probe-keyframes",
    labelKey: "test.probe",
    category: "transform",
    defaults: { amount: 0 },
    apply(effect) {
      seen.push(effect.params.amount);
    },
  });

  it("hands the applier a plain number at the clip's progress", () => {
    seen.length = 0;
    const ctx = {} as CanvasRenderingContext2D;
    const canvas = {} as HTMLCanvasElement;
    applyEffects([{ kind: "test-probe-keyframes", params: { amount: rampTrack(0, 90) } }], {
      ctx,
      canvas,
      timelineFrame: 45,
      clipFrame: 15,
      clipDurationFrames: 30,
      fps: 30,
    });
    expect(seen).toEqual([45]);
  });

  it("a zero-length clip resolves at progress 0 instead of dividing by zero", () => {
    seen.length = 0;
    applyEffects([{ kind: "test-probe-keyframes", params: { amount: rampTrack(5, 90) } }], {
      ctx: {} as CanvasRenderingContext2D,
      canvas: {} as HTMLCanvasElement,
      timelineFrame: 0,
      clipFrame: 0,
      clipDurationFrames: 0,
      fps: 30,
    });
    expect(seen).toEqual([5]);
  });
});

describe("widget frame — keyframed opacity and blend modes", () => {
  it("a keyframed opacity fades the widget in across its lifetime", () => {
    const w = widgetWith([{ kind: "opacity", params: { opacity: rampTrack(0, 1) } }]);
    const at = (s: number) => resolveFrame(frameInputFromWidget(w), CANVAS, { clipTimeSec: s, clipDurationSec: 4 }).opacity;
    expect(at(1)).toBeCloseTo(0.25);
    expect(at(4)).toBe(1);
  });

  it("the last valid blend entry wins and is not re-run by the pixel pass", () => {
    const w = widgetWith([
      { kind: "blend", params: { mode: "screen" } },
      { kind: "blend", params: { mode: "not-a-mode" } },
      { kind: "blend", params: { mode: "multiply" } },
    ]);
    const frame = resolveFrame(frameInputFromWidget(w), CANVAS, { clipTimeSec: 0, clipDurationSec: 2 });
    expect(frame.blendMode).toBe("multiply");
    expect(frame.pixelEffects).toEqual([]);
  });

  it("DOM and canvas renderers apply the same blend mode", () => {
    const w = widgetWith([{ kind: "blend", params: { mode: "overlay" } }]);
    const frame = resolveFrame(frameInputFromWidget(w), CANVAS, { clipTimeSec: 0, clipDurationSec: 2 });
    const state: Record<string, unknown> = { globalAlpha: 1 };
    const ctx = new Proxy(state, {
      get: (t, p: string) => (p in t ? t[p] : () => undefined),
      set: (t, p: string, v) => {
        t[p] = v;
        return true;
      },
    }) as unknown as Ctx2D;
    applyFrameToCtx(ctx, frame);
    expect(state.globalCompositeOperation).toBe("overlay");
    expect(frameToCss(frame).mixBlendMode).toBe("overlay");
  });

  it("no blend effect leaves the widget on normal compositing", () => {
    const frame = resolveFrame(frameInputFromWidget(widgetWith([])), CANVAS, { clipTimeSec: 0, clipDurationSec: 2 });
    expect(frame.blendMode).toBeNull();
    expect(frameToCss(frame).mixBlendMode).toBeUndefined();
    expect(resolveBlendMode(undefined)).toBeNull();
  });

  it("every mode has a camel-cased label key", () => {
    expect(blendModeLabelKey("color-dodge")).toBe("studio.effects.option.blend.colorDodge");
    expect(new Set(BLEND_MODES.map(blendModeLabelKey)).size).toBe(BLEND_MODES.length);
  });
});
