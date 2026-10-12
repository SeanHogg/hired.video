/**
 * Widget plugins (#2312): one plugin per kind owns emit / parse / paint, and
 * the frame is resolved once for both renderers. These pin the contracts
 * that keep the DOM preview and the exported video from drifting.
 *
 * Run: vitest run lib/studio/widgets/__tests__/widget-plugins.test.ts
 */
import { describe, it, expect } from "vitest";
import { defaultWidget, type Widget, type WidgetKind } from "@/lib/studio/editor-v2/canvas-state";
import { frameInputFromWidget, resolveFrame, type ResolvedFrame } from "@/lib/studio/widgets/frame";
import { applyFrameToCtx, type Ctx2D } from "@/lib/studio/widgets/frame-canvas";
import { frameToCss } from "@/lib/studio/widgets/frame-css";
import { INSERTABLE_WIDGET_KINDS } from "@/lib/studio/editor-v2/canvas-state";
import { DEFAULT_FILTERS } from "@/lib/studio/video-filters";
import { NO_LOOKUPS, type DrawEnv } from "@/lib/studio/widgets/draw-ops";
import { WIDGET_PLUGINS, pluginForEffectKind } from "@/lib/studio/widgets/registry";
import { NO_MEDIA } from "@/lib/studio/widgets/paint-ops";
import { layoutTextBlock, textBaselineOffset, wrapLines, type Measure } from "@/lib/studio/widgets/text-layout";

/** 10px per character — deterministic metrics without a canvas. */
const measure: Measure = (s) => s.length * 10;
const RENDER = { fontFamily: "Inter, sans-serif", target: "interactive" as const };
const CANVAS = { width: 1000, height: 500 };
const ENV: DrawEnv = {
  render: RENDER,
  canvas: CANVAS,
  clipTimeSec: 0,
  clipDurationSec: 5,
  measure: () => measure,
  t: (key) => key,
  lookups: NO_LOOKUPS,
};

/** Records the 2D-context calls a painter makes. */
function recordingCtx() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const state: Record<string, unknown> = { globalAlpha: 1, filter: "none" };
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === "measureText") return (s: string) => ({ width: measure(s) });
      return (...args: unknown[]) => calls.push({ op: prop, args });
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as Ctx2D, calls, state };
}

describe("wrapLines", () => {
  it("wraps greedily on words", () => {
    expect(wrapLines("aaa bbb ccc", 70, measure)).toEqual(["aaa bbb", "ccc"]);
  });
  it("keeps explicit newlines and blank lines", () => {
    expect(wrapLines("one\n\ntwo", 500, measure)).toEqual(["one", "", "two"]);
  });
  it("breaks a word wider than the line by character", () => {
    expect(wrapLines("abcdefgh", 30, measure)).toEqual(["abc", "def", "gh"]);
  });
});

describe("plugin save / load round-trip", () => {
  const kinds = Object.keys(WIDGET_PLUGINS) as WidgetKind[];
  it("registers a plugin for every kind a user can insert", () => {
    for (const kind of INSERTABLE_WIDGET_KINDS) expect(WIDGET_PLUGINS[kind]).toBeDefined();
  });
  it.each(kinds)("%s parses back what it emits", (kind) => {
    const widget = defaultWidget(kind);
    const plugin = WIDGET_PLUGINS[kind];
    const restored = plugin.parse(plugin.emit(widget.params));
    expect(restored).toEqual(widget.params);
    expect(pluginForEffectKind(plugin.effectKind)).toBe(plugin);
  });
});

describe("one frame, both renderers", () => {
  function styled(): Widget {
    const w = defaultWidget("shape-rect");
    return {
      ...w,
      position: { ...w.position, x: 0.1, y: 0.2, width: 0.4, height: 0.3, rotation: 15 },
      containerStyle: { backgroundColor: "#111111", borderColor: "#ff0000", padding: 6 },
      effects: [
        { kind: "opacity", params: { opacity: 0.5 } },
        { kind: "blur", params: { intensity: 0.5 } },
        { kind: "film-grain", params: {} },
      ],
    };
  }
  const frame: ResolvedFrame = resolveFrame(frameInputFromWidget(styled()), CANVAS, { clipTimeSec: 0, clipDurationSec: 5 });

  it("insets the content box by padding + the 2px default border", () => {
    expect(frame.box).toEqual({ x: 100, y: 100, w: 400, h: 150 });
    expect(frame.content).toEqual({ x: 108, y: 108, w: 384, h: 134 });
  });

  it("gives the DOM and the canvas the same opacity, blur and rotation", () => {
    const css = frameToCss(frame);
    const { ctx, calls, state } = recordingCtx();
    applyFrameToCtx(ctx, frame);
    expect(css.opacity).toBe(0.5);
    expect(state.globalAlpha).toBe(0.5);
    expect(css.filter).toBe("blur(12px)");
    expect(state.filter).toBe("blur(12px)");
    expect(css.transform).toBe("rotate(15deg)");
    expect(calls.find((c) => c.op === "rotate")?.args[0]).toBeCloseTo((15 * Math.PI) / 180);
  });

  it("leaves only pixel-domain effects for the export pass", () => {
    expect(frame.pixelEffects.map((e) => e.kind)).toEqual(["film-grain"]);
  });
});

describe("text: the export paints the shared layout's lines", () => {
  it("fills exactly the layout's lines, centred as a block", () => {
    const widget = defaultWidget("text");
    if (widget.params.kind !== "text") throw new Error("expected text");
    const params = { ...widget.params, data: { ...widget.params.data, text: "alpha beta gamma\ndelta", fontPx: 20, align: "left" as const } };
    const content = { x: 0, y: 0, w: 120, h: 200 };

    const style = { fontPx: 20, fontWeight: "normal" as const, fontFamily: RENDER.fontFamily };
    const layout = layoutTextBlock(params.data.text, style, content, measure);
    const { ctx, calls, state } = recordingCtx();
    WIDGET_PLUGINS.text.paint(ctx, content, params, ENV, NO_MEDIA);
    // The DOM's SVG text uses the same alphabetic baseline (not central / middle).
    expect(state.textBaseline).toBe("alphabetic");

    const painted = calls.filter((c) => c.op === "fillText");
    expect(painted.map((c) => c.args[0])).toEqual(layout.lines);
    expect(layout.lines).toEqual(["alpha beta", "gamma", "delta"]);
    const blockHeight = layout.lines.length * layout.lineHeightPx;
    expect(layout.top).toBeCloseTo((200 - blockHeight) / 2);
    // Line middle + the shared alphabetic-baseline offset (both renderers).
    expect(painted[0].args[2]).toBeCloseTo(layout.top + layout.lineHeightPx / 2 + textBaselineOffset(style));
  });
});

describe("plugin data the old switches dropped", () => {
  it("image keeps its colour grade and alt text through save / load", () => {
    const widget = defaultWidget("image");
    if (widget.params.kind !== "image") throw new Error("expected image");
    const params = {
      ...widget.params,
      data: { ...widget.params.data, altText: "Team photo", filters: { ...DEFAULT_FILTERS, brightness: 1.2 } },
    };
    expect(WIDGET_PLUGINS.image.parse(WIDGET_PLUGINS.image.emit(params))).toEqual(params);
  });

  it("video declares its chroma key as a pixel-pass effect", () => {
    const widget = defaultWidget("video");
    if (widget.params.kind !== "video") throw new Error("expected video");
    const params = { ...widget.params, data: { ...widget.params.data, chromaKey: { keyColor: "#00ff00", threshold: 0.3, softness: 0.1 } } };
    expect(WIDGET_PLUGINS.video.pixelEffects(params)).toEqual([
      { kind: "chroma-key", params: { keyColor: "#00ff00", threshold: 0.3, softness: 0.1, spillSuppression: 0.5 } },
    ]);
    expect(WIDGET_PLUGINS.image.pixelEffects(defaultWidget("image").params)).toEqual([]);
  });

  it("a malformed blob parses to safe defaults instead of throwing", () => {
    expect(WIDGET_PLUGINS["sfx-burst"].parse({ shape: "nope", fontPx: "big" })).toMatchObject({ kind: "sfx-burst", data: { shape: "star", fontPx: 48 } });
    expect(WIDGET_PLUGINS.chart.parse({ chartType: 7, colors: [1, "#fff"] })).toMatchObject({ data: { chartType: "bar", colors: ["#fff"] } });
  });
});
