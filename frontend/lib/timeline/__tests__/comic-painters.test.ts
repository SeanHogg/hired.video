/**
 * Comic widgets exported with their authored colours and tail: the export
 * painters must read the param names `canvasStateToTimeline` writes. They
 * used to read `textColor` / `bubbleColor` / `fillColor` / `tailX` while the
 * emitter wrote `color` / `bgColor` / `tailAnchorX`, so every exported
 * bubble, caption and burst fell back to default colours.
 */
import { describe, it, expect } from "vitest";
import "@/lib/timeline/effects";
import { getEffectDefinition } from "@/lib/timeline/effects/registry";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import { defaultWidget, emptyCanvasState, emptyScene, type Widget } from "@/lib/studio/editor-v2/canvas-state";

function recordingCtx() {
  const sets: Array<[string, unknown]> = [];
  const lines: Array<[number, number]> = [];
  const state: Record<string, unknown> = { globalAlpha: 1, filter: "none" };
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === "measureText") return (s: string) => ({ width: s.length * 10 });
      if (prop === "lineTo") return (x: number, y: number) => lines.push([x, y]);
      return () => undefined;
    },
    set(target, prop: string, value) {
      sets.push([prop, value]);
      target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, sets, lines };
}

function paintOnly(widget: Widget) {
  const state = emptyCanvasState({ width: 1000, height: 1000 });
  state.scenes = [{ ...emptyScene("S"), durationSeconds: 2, widgets: [widget] }];
  const timeline = canvasStateToTimeline(state);
  const effect = timeline.tracks.find((t) => t.id === "v2")!.clips[0].effects![0];
  const { ctx, sets, lines } = recordingCtx();
  getEffectDefinition(effect.kind)!.apply(effect, {
    ctx,
    canvas: { width: 1000, height: 1000 } as HTMLCanvasElement,
    timelineFrame: 0,
    clipFrame: 0,
    clipDurationFrames: 60,
    fps: 30,
  });
  const styles = (prop: string) => sets.filter(([p]) => p === prop).map(([, v]) => v);
  return { styles, lines };
}

describe("comic export painters read the emitted params", () => {
  it("speech bubble uses its fill, text colour and tail anchor", () => {
    const w = defaultWidget("speech-bubble");
    if (w.params.kind !== "speech-bubble") throw new Error("kind");
    w.params.data = { ...w.params.data, bgColor: "#abcdef", color: "#123456", tail: { anchorX: 0.9, anchorY: 0.95 } };
    const { styles, lines } = paintOnly(w);
    expect(styles("fillStyle")).toEqual(expect.arrayContaining(["#abcdef", "#123456"]));
    expect(lines).toContainEqual([900, 950]);
  });

  it("speech bubble without a tail draws none", () => {
    const w = defaultWidget("speech-bubble");
    if (w.params.kind !== "speech-bubble") throw new Error("kind");
    w.params.data = { ...w.params.data, tail: null };
    const { lines } = paintOnly(w);
    expect(lines.some(([, y]) => y > 950)).toBe(false);
  });

  it("caption box and sfx burst use their text colour and fill", () => {
    const caption = defaultWidget("caption-box");
    if (caption.params.kind !== "caption-box") throw new Error("kind");
    caption.params.data = { ...caption.params.data, color: "#111111", bgColor: "#222222" };
    expect(paintOnly(caption).styles("fillStyle")).toEqual(expect.arrayContaining(["#111111", "#222222"]));

    const sfx = defaultWidget("sfx-burst");
    if (sfx.params.kind !== "sfx-burst") throw new Error("kind");
    sfx.params.data = { ...sfx.params.data, color: "#333333", bgColor: "#444444" };
    expect(paintOnly(sfx).styles("fillStyle")).toEqual(expect.arrayContaining(["#333333", "#444444"]));
  });
});
