/**
 * Shared harness for the widget-plugin parity test (#2312): render one
 * widget BOTH ways — the export's Canvas2D paint and the DOM stage's
 * PluginWidgetBody — and reduce each to the same list of "marks" (filled /
 * stroked shapes with their bounding box and colour, text runs, media
 * boxes) in paint order. Equal mark lists = the two renderers draw the same
 * geometry. `parityCases()` walks the plugin registry, so a new plugin is
 * covered without touching the test.
 */
import { render } from "@testing-library/react";
import i18next from "i18next";
import { defaultWidget, type WidgetKind, type WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import type { LinkedContentSummary } from "@/lib/studio/editor-v2/linked-content";
import type { DrawEnv, DrawLookups } from "@/lib/studio/widgets/draw-ops";
import type { Box } from "@/lib/studio/widgets/frame";
import type { Ctx2D } from "@/lib/studio/widgets/frame-canvas";
import type { PaintMedia } from "@/lib/studio/widgets/paint-ops";
import { UNIQUE_WIDGET_PLUGINS, pluginForWidgetKind } from "@/lib/studio/widgets/registry";
import { fontShorthand, type Measure } from "@/lib/studio/widgets/text-layout";
import PluginWidgetBody from "../PluginWidgetBody";

export type Mark =
  | { t: "fill"; color: string; alpha: number; bbox: number[] }
  | { t: "stroke"; color: string; width: number; alpha: number; bbox: number[] }
  | { t: "text"; text: string; x: number; y: number; color: string; font: string; align: string; alpha: number }
  | { t: "media"; url: string; bbox: number[] };

export const PARITY_CANVAS = { width: 1280, height: 720 };
export const PARITY_CONTENT: Box = { x: 200, y: 120, w: 480, h: 300 };

/** Deterministic metrics: 0.55em per character. */
export const parityMeasure: DrawEnv["measure"] = (font): Measure => {
  const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
  return (s) => s.length * px * 0.55;
};

/** A résumé summary shaped like `fetchSummary`'s output. */
export const LINKED_SUMMARY: LinkedContentSummary = {
  kind: "resume",
  id: "res-1",
  title: "Senior Product Designer",
  subtitle: "Active · Master",
  body: ["• Led the checkout redesign (+18% conversion)", "• Built the design system used by 40 engineers"],
  badges: ["Figma", "Design systems", "Research"],
};

const LOOKUPS: DrawLookups = {
  linkedContent: (_kind, id) => (id === "res-1" ? LINKED_SUMMARY : undefined),
  engagementTitle: (_kind, id) => (id === "form-1" ? "Book a portfolio review" : ""),
  qrMatrix: () => null,
};

export function parityEnv(clipTimeSec = 0.4): DrawEnv {
  return {
    render: { fontFamily: "Inter, sans-serif", target: "interactive" },
    canvas: PARITY_CANVAS,
    clipTimeSec,
    clipDurationSec: 4,
    measure: parityMeasure,
    // The same i18next instance the DOM's useTranslation reads.
    t: (key, vars) => String(vars ? i18next.t(key, vars) : i18next.t(key)),
    lookups: LOOKUPS,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

function bboxOf(points: Array<[number, number]>): number[] {
  if (points.length === 0) return [];
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(round);
}

/** A 2D context that records marks instead of pixels. */
export function markRecorder(): { ctx: Ctx2D; marks: Mark[] } {
  const marks: Mark[] = [];
  const state: Record<string, unknown> = { globalAlpha: 1, filter: "none", fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, font: "", textAlign: "start" };
  const stack: Array<Record<string, unknown>> = [];
  let points: Array<[number, number]> = [];
  let clip: number[] = [];
  const methods: Record<string, (...a: number[]) => unknown> = {
    save: () => stack.push({ ...state, __clip: clip }),
    restore: () => {
      const prev = stack.pop();
      if (!prev) return;
      clip = prev.__clip as number[];
      Object.assign(state, prev);
    },
    beginPath: () => {
      points = [];
    },
    moveTo: (x, y) => points.push([x, y]),
    lineTo: (x, y) => points.push([x, y]),
    arcTo: (x1, y1, x2, y2) => points.push([x1, y1], [x2, y2]),
    quadraticCurveTo: (cx, cy, x, y) => points.push([cx, cy], [x, y]),
    bezierCurveTo: (a, b, c, d, x, y) => points.push([a, b], [c, d], [x, y]),
    arc: (x, y, r) => points.push([x - r, y - r], [x + r, y + r]),
    ellipse: (cx, cy, rx, ry) => points.push([cx - rx, cy - ry], [cx + rx, cy + ry]),
    rect: (x, y, w, h) => points.push([x, y], [x + w, y + h]),
    clip: () => {
      clip = bboxOf(points);
    },
    fill: () => marks.push({ t: "fill", color: String(state.fillStyle), alpha: round(Number(state.globalAlpha)), bbox: bboxOf(points) }),
    stroke: () =>
      marks.push({ t: "stroke", color: String(state.strokeStyle), width: Number(state.lineWidth), alpha: round(Number(state.globalAlpha)), bbox: bboxOf(points) }),
    fillRect: (x, y, w, h) =>
      marks.push({ t: "fill", color: String(state.fillStyle), alpha: round(Number(state.globalAlpha)), bbox: bboxOf([[x, y], [x + w, y + h]]) }),
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
  };
  const fillText = (text: string, x: number, y: number) =>
    marks.push({
      t: "text",
      text,
      x: round(x),
      y: round(y),
      color: String(state.fillStyle),
      font: String(state.font),
      align: String(state.textAlign),
      alpha: round(Number(state.globalAlpha)),
    });
  const drawImage = (src: { __url?: string }) => marks.push({ t: "media", url: src.__url ?? "", bbox: clip });
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop === "fillText") return fillText;
      if (prop === "drawImage") return drawImage;
      if (prop in methods) return methods[prop];
      if (prop in target) return target[prop];
      return () => undefined;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as Ctx2D, marks };
}

const MEDIA: PaintMedia = {
  image: (url) => ({ __url: url, naturalWidth: 800, naturalHeight: 600 }) as unknown as ReturnType<PaintMedia["image"]>,
  video: (url) => ({ __url: url, videoWidth: 1920, videoHeight: 1080 }) as unknown as ReturnType<PaintMedia["video"]>,
};

/** The export's render: Canvas2D marks. */
export function canvasMarks(params: WidgetParams, env = parityEnv()): Mark[] {
  const { ctx, marks } = markRecorder();
  pluginForWidgetKind(params.kind).paint(ctx, PARITY_CONTENT, params, env, MEDIA);
  return marks;
}

const num = (el: Element, attr: string) => Number(el.getAttribute(attr) ?? 0);
const opacity = (el: Element) => round(Number(el.getAttribute("opacity") ?? 1));
const ANCHOR_TO_ALIGN: Record<string, string> = { start: "left", middle: "center", end: "right" };

function shapeMarks(el: Element, bbox: number[]): Mark[] {
  const out: Mark[] = [];
  const fill = el.getAttribute("fill");
  if (fill && fill !== "none") out.push({ t: "fill", color: fill, alpha: opacity(el), bbox });
  const stroke = el.getAttribute("stroke");
  if (stroke) out.push({ t: "stroke", color: stroke, width: num(el, "stroke-width"), alpha: opacity(el), bbox });
  return out;
}

function pathPoints(d: string): Array<[number, number]> {
  const nums = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

/** The DOM's render: marks read back from the mounted elements (SVG
 *  shapes, media elements, and raster canvases' own recorded paint). */
export function domMarks(params: WidgetParams, env = parityEnv()): Mark[] {
  const rasterMarks = new Map<HTMLCanvasElement, Mark[]>();
  const original = HTMLCanvasElement.prototype.getContext;
  const { play, pause } = HTMLMediaElement.prototype;
  HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
    const rec = markRecorder();
    rasterMarks.set(this, rec.marks);
    return rec.ctx;
  } as unknown as typeof original;
  // jsdom has no media playback; the stage's playhead sync calls these.
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => undefined;
  try {
    const { container, unmount } = render(
      <PluginWidgetBody
        params={params}
        content={PARITY_CONTENT}
        canvas={env.canvas}
        render={env.render}
        clipTimeSec={env.clipTimeSec}
        clipDurationSec={env.clipDurationSec}
        isPlayback
        projectId={null}
        measure={env.measure}
        lookups={env.lookups}
        staticEmbeds
      />,
    );
    const marks: Mark[] = [];
    container.querySelectorAll("rect[data-op], ellipse[data-op], path[data-op], text[data-op], img[data-op], video[data-op], canvas[data-op]").forEach((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === "rect") {
        const x = num(el, "x");
        const y = num(el, "y");
        marks.push(...shapeMarks(el, bboxOf([[x, y], [x + num(el, "width"), y + num(el, "height")]])));
      } else if (tag === "ellipse") {
        const cx = num(el, "cx");
        const cy = num(el, "cy");
        const rx = num(el, "rx");
        const ry = num(el, "ry");
        marks.push(...shapeMarks(el, bboxOf([[cx - rx, cy - ry], [cx + rx, cy + ry]])));
      } else if (tag === "path") {
        marks.push(...shapeMarks(el, bboxOf(pathPoints(el.getAttribute("d") ?? ""))));
      } else if (tag === "text") {
        const weight = el.getAttribute("font-weight") ?? "normal";
        marks.push({
          t: "text",
          text: el.textContent ?? "",
          x: round(num(el, "x")),
          y: round(num(el, "y")),
          color: el.getAttribute("fill") ?? "",
          font: fontShorthand({
            fontPx: num(el, "font-size"),
            fontWeight: weight === "normal" || weight === "bold" ? weight : Number(weight),
            fontFamily: el.getAttribute("font-family") ?? "",
            italic: el.getAttribute("font-style") === "italic",
          }),
          align: ANCHOR_TO_ALIGN[el.getAttribute("text-anchor") ?? "start"],
          alpha: opacity(el),
        });
      } else if (tag === "canvas") {
        marks.push(...(rasterMarks.get(el as HTMLCanvasElement) ?? []));
      } else {
        const style = (el as HTMLElement).style;
        // Media boxes are placed relative to the content origin.
        const left = parseFloat(style.left) + PARITY_CONTENT.x;
        const top = parseFloat(style.top) + PARITY_CONTENT.y;
        marks.push({ t: "media", url: el.getAttribute("data-url") ?? "", bbox: bboxOf([[left, top], [left + parseFloat(style.width), top + parseFloat(style.height)]]) });
      }
    });
    unmount();
    return marks;
  } finally {
    HTMLCanvasElement.prototype.getContext = original;
    HTMLMediaElement.prototype.play = play;
    HTMLMediaElement.prototype.pause = pause;
  }
}

/** Extra variants per kind, on top of each kind's default widget, so the
 *  branches that matter (media present, tails, shapes, bound entities)
 *  are compared too. Kinds without an entry still get their default. */
const VARIANTS: Partial<Record<WidgetKind, Array<(p: WidgetParams) => WidgetParams>>> = {
  text: [(p) => (p.kind === "text" ? { ...p, data: { ...p.data, background: "#0f172a", align: "center", text: "Ship the résumé today" } } : p)],
  image: [(p) => (p.kind === "image" ? { ...p, data: { ...p.data, source: { kind: "url", url: "https://cdn.example.com/headshot.jpg" }, fit: "contain" } } : p)],
  video: [(p) => (p.kind === "video" ? { ...p, data: { ...p.data, source: { kind: "url", url: "https://cdn.example.com/pitch.mp4" } } } : p)],
  webcam: [(p) => (p.kind === "webcam" ? { ...p, data: { ...p.data, recordingUrl: "https://cdn.example.com/take-2.webm" } } : p)],
  "speech-bubble": (["thought", "shout", "whisper"] as const).map(
    (shape) => (p: WidgetParams) => (p.kind === "speech-bubble" ? { ...p, data: { ...p.data, shape } } : p),
  ),
  "sfx-burst": (["jagged", "circle-jagged", "lightning"] as const).map(
    (shape) => (p: WidgetParams) => (p.kind === "sfx-burst" ? { ...p, data: { ...p.data, shape } } : p),
  ),
  "linked-content": [(p) => (p.kind === "linked-content" ? { ...p, data: { ...p.data, entityId: "res-1" } } : p)],
  "engagement-asset": [(p) => (p.kind === "engagement-asset" ? { ...p, data: { ...p.data, assetId: "form-1" } } : p)],
  avatar: [(p) => (p.kind === "avatar" ? { ...p, data: { ...p.data, script: "Hi, I build design systems." } } : p)],
  "brand-kit": [(p) => (p.kind === "brand-kit" ? { ...p, data: { ...p.data, logoUrl: "https://cdn.example.com/logo.png" } } : p)],
};

/** One case per kind every plugin owns (+ variants), from the registry. */
export function parityCases(): Array<[string, WidgetParams]> {
  const cases: Array<[string, WidgetParams]> = [];
  for (const plugin of UNIQUE_WIDGET_PLUGINS) {
    for (const kind of plugin.widgetKinds) {
      const base = defaultWidget(kind).params;
      cases.push([`${plugin.effectKind} (${kind})`, base]);
      (VARIANTS[kind] ?? []).forEach((variant, i) => cases.push([`${plugin.effectKind} (${kind} #${i + 1})`, variant(base)]));
    }
  }
  return cases;
}
