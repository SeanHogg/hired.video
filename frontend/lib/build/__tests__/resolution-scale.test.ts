/**
 * One pixel scale for the export resolution: the owner's hand edits
 * (plan.canvas) are stored at the 1080p design scale, grow with the export
 * resolution exactly like the generated type, and an edit made on a 4K
 * canvas is stored back at 1080p (so switching resolution never compounds).
 */
import { describe, expect, it } from "vitest";
import { ResumeContentSchema } from "@shared/resume";
import type { VideoPlan } from "@shared/video-plan";
import type { CanvasState, Widget } from "@/lib/studio/editor-v2/canvas-state";
import { buildVideoOutline } from "../video-outline";
import { outlineToCanvasState } from "../video-canvas";
import { addWidget, applyCanvasOverrides, overrideWidgetLook } from "../canvas-overrides";
import { planWidgetPatch } from "../frame-edits";
import { resolutionScale, scalePixelData, scaleStyle } from "../resolution-scale";
import type { Translate } from "../video-copy";

const content = ResumeContentSchema.parse({
  basics: { name: "Sean Hogg", label: "Chief Innovation Officer" },
  work: [{ name: "BuilderForce.ai", position: "Chief Innovation Officer", startDate: "2023-01", highlights: ["Directed a team of 30 engineers"] }],
  skills: [{ name: "AI strategy" }],
});
const t: Translate = (key) => key;
const HEADING = "build-who-heading";

const canvasAt = (plan: VideoPlan): CanvasState => {
  const outline = buildVideoOutline(content, plan);
  return applyCanvasOverrides(outlineToCanvasState(outline, t), plan.canvas, resolutionScale(outline.export.resolution));
};
const widget = (canvas: CanvasState, id: string): Widget | undefined =>
  canvas.scenes.flatMap((s) => s.widgets).find((w) => w.id === id);
const fontPx = (w: Widget | undefined) => (w?.params.data as { fontPx?: number } | undefined)?.fontPx;

describe("resolution scale helpers", () => {
  it("scales only pixel keys and pixel chrome", () => {
    expect(scalePixelData({ fontPx: 40, color: "#fff", strokeWidth: 3 }, 2)).toEqual({ fontPx: 80, color: "#fff", strokeWidth: 6 });
    expect(scaleStyle({ padding: 12, borderColor: "#000", borderRadius: 9 }, 2 / 3)).toEqual({ padding: 8, borderColor: "#000", borderRadius: 6 });
    expect(resolutionScale(undefined)).toBe(1);
    expect(resolutionScale("4k")).toBe(2);
  });
});

describe("hand edits at the export resolution", () => {
  const edited = overrideWidgetLook({}, HEADING, { params: { fontPx: 60 }, containerStyle: { padding: 10, backgroundColor: "#000000" } });

  it("grows a hand-set font size with the resolution, like the generated type", () => {
    expect(fontPx(widget(canvasAt(edited), HEADING))).toBe(60);
    const big = widget(canvasAt({ ...edited, export: { resolution: "4k" } }), HEADING);
    expect(fontPx(big)).toBe(120);
    expect(big?.containerStyle).toEqual({ padding: 20, backgroundColor: "#000000" });
  });

  it("scales a widget the owner added", () => {
    const base = widget(canvasAt({}), HEADING)!;
    const mine: Widget = { ...base, id: "mine-1" };
    const plan = addWidget({ export: { resolution: "4k" } }, "who", mine);
    expect(fontPx(widget(canvasAt(plan), "mine-1"))).toBe((fontPx(base) ?? 0) * 2);
  });

  it("stores an edit made on a 4K canvas at the 1080p design scale", () => {
    const plan: VideoPlan = { export: { resolution: "4k" } };
    const shown = widget(canvasAt(plan), HEADING)!;
    const patch: Partial<Widget> = { params: { ...shown.params, data: { ...shown.params.data, fontPx: 150 } } as Widget["params"] };
    const { plan: next } = planWidgetPatch(plan, shown, patch, resolutionScale("4k"));
    expect(next.canvas?.widgets?.[HEADING]?.params).toEqual({ fontPx: 75 });
    // And it shows at the size the owner typed.
    expect(fontPx(widget(canvasAt(next), HEADING))).toBe(150);
  });
});
