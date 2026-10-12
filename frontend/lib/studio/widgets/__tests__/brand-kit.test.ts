/**
 * Brand kit (#577): default geometry, emit/parse, empty logo is
 * editor-only, a set logo paints contain + alpha and preloads as an image.
 *
 * Run: vitest run lib/studio/widgets/__tests__/brand-kit.test.ts
 */
import { describe, it, expect } from "vitest";
import { defaultWidget } from "@/lib/studio/editor-v2/canvas-state";
import { NO_LOOKUPS, type DrawEnv } from "@/lib/studio/widgets/draw-ops";
import { WIDGET_PLUGINS } from "@/lib/studio/widgets/registry";

const ENV: DrawEnv = {
  render: { fontFamily: "Inter, sans-serif", target: "interactive" },
  canvas: { width: 1000, height: 500 },
  clipTimeSec: 0,
  clipDurationSec: 5,
  measure: () => (s) => s.length * 10,
  t: (key) => key,
  lookups: NO_LOOKUPS,
};

const CONTENT = { x: 800, y: 420, w: 120, h: 60 };

describe("brand-kit plugin", () => {
  const plugin = WIDGET_PLUGINS["brand-kit"];

  it("defaults to a small bottom-right box with empty logo and opacity 1", () => {
    const widget = defaultWidget("brand-kit");
    expect(widget.kind).toBe("brand-kit");
    expect(widget.position.x).toBe(0.84);
    expect(widget.position.y).toBe(0.84);
    expect(widget.position.width).toBe(0.12);
    expect(widget.position.height).toBe(0.12);
    expect(widget.params).toEqual({
      kind: "brand-kit",
      data: { brandKitId: "", logoUrl: "", opacity: 1 },
    });
  });

  it("round-trips emit / parse, clamping opacity to 0..1", () => {
    const widget = defaultWidget("brand-kit");
    if (widget.params.kind !== "brand-kit") throw new Error("expected brand-kit");
    const params = {
      ...widget.params,
      data: {
        brandKitId: "kit-1",
        logoUrl: "https://cdn.example.com/logo.png",
        opacity: 0.7,
      },
    };
    expect(plugin.parse(plugin.emit(params))).toEqual(params);
    expect(plugin.parse({ opacity: 4 })).toEqual({
      kind: "brand-kit",
      data: { brandKitId: "", logoUrl: "", opacity: 1 },
    });
  });

  it("an empty logo is an editor-only hint with no export assets", () => {
    const empty = defaultWidget("brand-kit").params;
    const ops = plugin.draw(empty, CONTENT, ENV);
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.every((op) => op.editorOnly === true)).toBe(true);
    expect(plugin.assets(empty)).toEqual({});
  });

  it("paints the logo contain-fitted at the widget opacity and preloads it", () => {
    const empty = defaultWidget("brand-kit").params;
    if (empty.kind !== "brand-kit") throw new Error("expected brand-kit");
    const params = {
      ...empty,
      data: {
        ...empty.data,
        brandKitId: "kit-1",
        logoUrl: "https://cdn.example.com/logo.png",
        opacity: 0.7,
      },
    };
    expect(plugin.draw(params, CONTENT, ENV)).toEqual([
      {
        op: "media",
        media: "image",
        url: "https://cdn.example.com/logo.png",
        box: CONTENT,
        fit: "contain",
        alpha: 0.7,
      },
    ]);
    expect(plugin.assets(params)).toEqual({ images: ["https://cdn.example.com/logo.png"] });
  });
});
