/** A document's free elements → one PNG per printed page (rasterize-overlays.ts). */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/lib/timeline/effects";
import { getEffectDefinition } from "@/lib/timeline/effects/registry";
import { INSERTABLE_WIDGET_KINDS, defaultWidget, type Widget, type WidgetKind } from "@/lib/studio/editor-v2/canvas-state";
import {
  EXPORT_PAINTERS,
  STILL_AT_SEC,
  overlayPageCount,
  pagesTouched,
  paintOrder,
  passOnPage,
  pixelPassFor,
  rasterizeOverlayPages,
  runDevicePixelPass,
  stillWidgets,
  widgetsByPage,
  withoutPixelEffects,
} from "../rasterize-overlays";

const at = (id: string, y: number, height: number, z = 1): Widget => ({
  ...defaultWidget("shape-rect"),
  id,
  position: { x: 0.1, y, width: 0.3, height, z, rotation: 0 },
});

describe("every widget kind has an export painter", () => {
  const kinds = Object.keys(EXPORT_PAINTERS) as WidgetKind[];

  it("covers every kind a user can add, plus the bound ones", () => {
    for (const kind of [...INSERTABLE_WIDGET_KINDS, "linked-content", "engagement-asset"] as WidgetKind[]) {
      expect(kinds).toContain(kind);
    }
  });

  it.each(kinds)("%s → a registered painter", (kind) => {
    const { effect } = EXPORT_PAINTERS[kind];
    expect(getEffectDefinition(effect), `${kind} paints with ${effect}`).not.toBeNull();
  });

  it("draws video and webcam as a still (documented poster path)", () => {
    expect(EXPORT_PAINTERS.video.still).toBe(true);
    expect(EXPORT_PAINTERS.webcam.still).toBe(true);
    expect(STILL_AT_SEC).toBeGreaterThan(0);
  });
});

describe("pagesTouched", () => {
  it("names every page a box crosses, in page units", () => {
    expect(pagesTouched(at("a", 0.1, 0.2))).toEqual([0]);
    expect(pagesTouched(at("b", 0.9, 0.3))).toEqual([0, 1]);
    expect(pagesTouched(at("c", 2.2, 0.1))).toEqual([2]);
    expect(pagesTouched(at("d", 1, 1))).toEqual([1]);
  });
});

describe("overlayPageCount", () => {
  it("is the document's pages, or further down for a low element", () => {
    expect(overlayPageCount([at("a", 0.1, 0.1)], 2)).toBe(2);
    expect(overlayPageCount([at("a", 2.5, 0.1)], 1)).toBe(3);
    expect(overlayPageCount([], 0)).toBe(1);
  });
});

describe("paintOrder", () => {
  it("paints back to front; ties keep insertion order", () => {
    const order = paintOrder([at("top", 0, 0.1, 5), at("low", 0, 0.1, 1), at("tie", 0, 0.1, 1)]).map((w) => w.id);
    expect(order).toEqual(["low", "tie", "top"]);
  });
});

describe("stillWidgets", () => {
  it("puts elements at rest on the plane, always visible", () => {
    const moving: Widget = { ...at("m", 1.5, 0.2), visibleFrom: 2, visibleTo: 3, motion: { enter: null, exit: null } as unknown as Widget["motion"] };
    const [still] = stillWidgets([moving], 2);
    expect(still.position.y).toBeCloseTo(0.75);
    expect(still.position.height).toBeCloseTo(0.1);
    expect(still.motion).toBeNull();
    expect(still.visibleFrom).toBeNull();
    expect(still.visibleTo).toBeNull();
  });
});

describe("widgetsByPage", () => {
  it("lists each page's elements in paint order; a page-break crosser is on both", () => {
    const ws = [at("a", 0.1, 0.2), at("b", 0.9, 0.3), at("c", 4.2, 0.1)];
    expect(widgetsByPage(ws, 5)).toEqual([[0, 1], [1], [], [], [2]]);
  });
});

describe("passOnPage", () => {
  it("moves the content box up by the page offset, effects unchanged", () => {
    const pass = { effects: [{ kind: "film-grain", params: {} }], content: { x: 10, y: 1500, w: 20, h: 30 } };
    expect(passOnPage(pass, 1000)).toEqual({ effects: pass.effects, content: { x: 10, y: 500, w: 20, h: 30 } });
    expect(passOnPage(pass, 0)).toBe(pass);
  });
});

describe("rasterizeOverlayPages", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns one empty slot per page with nothing to draw", async () => {
    expect(await rasterizeOverlayPages({ widgets: [], pageWidth: 816, pageHeight: 1056, pages: 2 })).toEqual([null, null]);
  });

  /** A recording 2D context: scale / translate are logged, everything else
   *  is a no-op (measureText answers a width). */
  function fakeContext(log: string[]): CanvasRenderingContext2D {
    const store: Record<string | symbol, unknown> = {};
    return new Proxy(store, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === "scale" || prop === "translate") return (...a: number[]) => log.push(`${String(prop)}(${a.join(",")})`);
        return () => ({ width: 0, addColorStop: () => undefined });
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
  }

  it("paints each page on its own page-sized canvas, only where elements are", async () => {
    const logs: string[][] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => {
      const log: string[] = [];
      logs.push(log);
      return fakeContext(log);
    }) as unknown as HTMLCanvasElement["getContext"]);
    const sizes: Array<[number, number]> = [];
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (this: HTMLCanvasElement) {
      sizes.push([this.width, this.height]);
      return `data:image/png;base64,page${sizes.length}`;
    });

    const out = await rasterizeOverlayPages({
      widgets: [at("cross", 0.9, 0.3), at("low", 5.5, 0.1)],
      pageWidth: 100,
      pageHeight: 200,
      pages: 6,
    });

    // Pages 0 + 1 (the crosser) and 5; nothing else is drawn.
    expect(out.map((u) => u !== null)).toEqual([true, true, false, false, false, true]);
    // Never a whole-plane canvas: every canvas is one page at print scale.
    expect(sizes).toEqual([[200, 400], [200, 400], [200, 400]]);
    expect(logs).toHaveLength(3);
    expect(logs[0]).toEqual(["scale(2,2)", "translate(0,0)"]);
    expect(logs[1]).toEqual(["scale(2,2)", "translate(0,-200)"]);
    expect(logs[2]).toEqual(["scale(2,2)", "translate(0,-1000)"]);
  });

  it("a linked CTA prints its readable link and QR (no click overlay on paper)", async () => {
    const texts: string[] = [];
    let fills = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => {
      const ctx = fakeContext([]);
      return new Proxy(ctx, {
        get(target, prop) {
          if (prop === "fillText") return (text: string) => texts.push(text);
          if (prop === "fill") return () => (fills += 1);
          return Reflect.get(target, prop);
        },
      });
    }) as unknown as HTMLCanvasElement["getContext"]);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => "data:image/png;base64,page");
    const cta = defaultWidget("cta");
    if (cta.params.kind === "cta") cta.params.data.ctaUrl = "https://www.hired.video/jobs/senior-product-designer";
    cta.position = { x: 0.1, y: 0.1, width: 0.8, height: 0.4, z: 1, rotation: 0 };

    await rasterizeOverlayPages({ widgets: [cta], pageWidth: 816, pageHeight: 1056, pages: 1 });

    expect(texts).toContain("hired.video/jobs/senior-product-designer");
    // Card, button, QR quiet zone and the QR modules path.
    expect(fills).toBeGreaterThanOrEqual(4);
  });

  it("a tainted page costs only that page", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => fakeContext([])) as unknown as HTMLCanvasElement["getContext"]);
    let n = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
      n += 1;
      if (n === 1) throw new DOMException("tainted", "SecurityError");
      return "data:image/png;base64,ok";
    });
    const out = await rasterizeOverlayPages({ widgets: [at("a", 0.1, 0.1), at("b", 1.1, 0.1)], pageWidth: 100, pageHeight: 200, pages: 2 });
    expect(out).toEqual([null, "data:image/png;base64,ok"]);
  });
});

describe("per-element pixel effects run in device pixels", () => {
  const grainy: Widget = {
    ...at("g", 0.5, 0.25),
    position: { x: 0.25, y: 0.5, width: 0.5, height: 0.25, z: 1, rotation: 0 },
    effects: [
      { kind: "opacity", params: { opacity: 0.8 } },
      { kind: "film-grain", params: { intensity: 0.4 } },
    ],
  };
  const plane = { width: 800, height: 1000 };

  it("holds the pixel effects back from the painter, keeping the rest", () => {
    const pass = pixelPassFor(grainy, plane);
    expect(pass.effects.map((e) => e.kind)).toEqual(["film-grain"]);
    expect(pass.content).toEqual({ x: 200, y: 500, w: 400, h: 250 });
    expect(withoutPixelEffects(grainy, pass.effects).effects?.map((e) => e.kind)).toEqual(["opacity"]);
  });

  it("calls the pass with the identity transform and the box at print scale", () => {
    const calls: string[] = [];
    const ctx = {
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
      setTransform: (...m: number[]) => calls.push(`setTransform(${m.join(",")})`),
    } as unknown as CanvasRenderingContext2D;
    const canvas = {} as HTMLCanvasElement;
    const apply = vi.fn();
    runDevicePixelPass(ctx, canvas, pixelPassFor(grainy, plane), 2, { timelineFrame: 3, fps: 30 }, apply);
    expect(apply).toHaveBeenCalledTimes(1);
    const [, onCanvas, effects, rect, frame, fps] = apply.mock.calls[0];
    expect(onCanvas).toBe(canvas);
    expect(effects.map((e: { kind: string }) => e.kind)).toEqual(["film-grain"]);
    expect(rect).toEqual({ x: 400, y: 1000, w: 800, h: 500 });
    expect([frame, fps]).toEqual([3, 30]);
    expect(calls).toEqual(["save", "setTransform(1,0,0,1,0,0)", "restore"]);
  });

  it("does nothing for an element without pixel effects", () => {
    const apply = vi.fn();
    runDevicePixelPass({} as CanvasRenderingContext2D, {} as HTMLCanvasElement, pixelPassFor(at("p", 0, 0.1), plane), 2, { timelineFrame: 0, fps: 30 }, apply);
    expect(apply).not.toHaveBeenCalled();
  });

  it("treats a video's chroma key as a pixel effect", () => {
    const video: Widget = defaultWidget("video");
    if (video.params.kind === "video") video.params.data.chromaKey = { keyColor: "#00ff00", threshold: 0.4, softness: 0.1 };
    const pass = pixelPassFor(video, plane);
    expect(pass.effects[0]).toMatchObject({ kind: "chroma-key", params: { keyColor: "#00ff00", spillSuppression: 0.5 } });
    const stripped = withoutPixelEffects(video, pass.effects);
    expect(stripped.params.kind === "video" && stripped.params.data.chromaKey).toBeNull();
  });
});
