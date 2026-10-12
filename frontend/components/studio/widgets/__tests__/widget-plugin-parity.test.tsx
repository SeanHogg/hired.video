/**
 * One canvas, one renderer per widget (#2312): every widget plugin, rendered
 * by the export (Canvas2D paint) and by the DOM stage (PluginWidgetBody),
 * draws the same geometry — same shapes and boxes, same colours, same text
 * lines at the same anchors, same media boxes, in the same order.
 *
 * Cases come from the plugin registry (`parityCases`), so a new plugin is
 * covered without editing this file.
 *
 * Run: vitest run components/studio/widgets/__tests__/widget-plugin-parity.test.tsx
 */
import { describe, expect, it } from "vitest";
import { defaultWidget } from "@/lib/studio/editor-v2/canvas-state";
import { WIDGET_PLUGINS } from "@/lib/studio/widgets/registry";
import { LINKED_SUMMARY, PARITY_CONTENT, canvasMarks, domMarks, parityCases, parityEnv } from "./plugin-parity";

describe("every widget plugin draws the same on the DOM and in the export", () => {
  it.each(parityCases())("%s", (_name, params) => {
    expect(domMarks(params)).toEqual(canvasMarks(params));
  });
});

describe("parity cases exercise the branches that matter", () => {
  it("covers every registered widget kind, and each draws something in the export", () => {
    const cases = parityCases();
    for (const kind of Object.keys(WIDGET_PLUGINS)) {
      const drawn = cases.filter(([, p]) => p.kind === kind).some(([, p]) => canvasMarks(p).length > 0);
      expect(drawn, `${kind} paints in at least one case`).toBe(true);
    }
  });

  it("the linked-content card paints the preloaded résumé summary", () => {
    const base = defaultWidget("linked-content").params;
    if (base.kind !== "linked-content") throw new Error("kind");
    const texts = canvasMarks({ ...base, data: { ...base.data, entityId: "res-1" } })
      .filter((m) => m.t === "text")
      .map((m) => (m.t === "text" ? m.text : ""));
    expect(texts).toContain(LINKED_SUMMARY.title);
    expect(texts).toContain("Figma");
  });

  it("a speech-bubble tail reaches its canvas-fraction anchor on both renderers", () => {
    const base = defaultWidget("speech-bubble").params;
    if (base.kind !== "speech-bubble") throw new Error("kind");
    // A speaker below the bubble: the tip lies outside the content box.
    const bubble = { ...base, data: { ...base.data, tail: { anchorX: 0.3, anchorY: 0.8 } } };
    const env = parityEnv();
    const tipY = 0.8 * env.canvas.height;
    expect(tipY).toBeGreaterThan(PARITY_CONTENT.y + PARITY_CONTENT.h);
    for (const marks of [canvasMarks(bubble), domMarks(bubble)]) {
      expect(marks.some((m) => m.t === "fill" && Math.abs(m.bbox[3] - tipY) < 0.01)).toBe(true);
    }
  });

  it("an empty image is an editor-only hint: nothing in the export or playback", () => {
    const empty = defaultWidget("image").params;
    expect(canvasMarks(empty)).toEqual([]);
    expect(domMarks(empty)).toEqual([]);
  });

  it("the avatar's mouth follows the clip time (watch page = export)", () => {
    const base = defaultWidget("avatar").params;
    if (base.kind !== "avatar") throw new Error("kind");
    const speaking = { ...base, data: { ...base.data, script: "Hi, I build design systems." } };
    const atStart = canvasMarks(speaking, parityEnv(0));
    const later = canvasMarks(speaking, parityEnv(0.7));
    expect(later).not.toEqual(atStart);
    expect(domMarks(speaking, parityEnv(0.7))).toEqual(later);
  });
});
