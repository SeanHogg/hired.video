/**
 * The renderer-neutral drawing a widget plugin produces (#2312).
 *
 * A plugin's `draw()` turns widget data into a short list of ops in canvas
 * pixels (the content box's own coordinates). Both renderers interpret the
 * SAME list:
 *   - the export paints it with Canvas2D (paint-ops.ts)
 *   - the DOM stage renders it as SVG / <img> / <video> / <canvas>
 *     (components/studio/widgets/WidgetDrawingView.tsx)
 * so the editor preview, the watch page and the posted MP4 cannot drift on
 * geometry, colours or text breaks.
 *
 * Pure and React-free — the export pipeline imports this.
 */
import type { ChromaKeyParams } from "@/lib/studio/editor-v2/canvas-state";
import type { LinkedContentKind, LinkedContentSummary } from "@/lib/studio/editor-v2/linked-content";
import type { EngagementAssetKind } from "@/lib/studio/editor-v2/engagement-assets";
import type { VideoFilters } from "@/lib/studio/video-filters";
import type { Box } from "./frame";
import type { Ctx2D } from "./frame-canvas";
import type { RenderContext } from "./plugin";
import type { Measure, TextStyle } from "./text-layout";

export type ImageFit = "cover" | "contain" | "stretch";

export interface Stroke {
  color: string;
  width: number;
  /** Dash pattern in px (canvas `setLineDash`, SVG `stroke-dasharray`). */
  dash?: number[];
}

/** Absolute path commands in canvas px (the subset both renderers share). */
export type PathCmd =
  | ["M", number, number]
  | ["L", number, number]
  | ["C", number, number, number, number, number, number]
  | ["Z"];

interface OpBase {
  /** 0..1 multiplier on top of the frame's opacity. */
  alpha?: number;
  /** Authoring affordance (an empty-state hint): the edit canvas shows it,
   *  playback and the export never do. */
  editorOnly?: boolean;
}

export type DrawOp =
  | (OpBase & { op: "rect"; box: Box; radius?: number; fill?: string; stroke?: Stroke })
  | (OpBase & { op: "ellipse"; box: Box; fill?: string; stroke?: Stroke })
  | (OpBase & { op: "path"; d: PathCmd[]; fill?: string; stroke?: Stroke })
  | (OpBase & {
      op: "text";
      text: string;
      /** Anchor x for `align`; y is the line's vertical middle. */
      x: number;
      y: number;
      /** Canvas uses its shorthand; the DOM sets the SVG font attributes. */
      font: TextStyle;
      color: string;
      align: "left" | "center" | "right";
    })
  | (OpBase & {
      op: "media";
      media: "image" | "video";
      url: string;
      /** The box the media fills (it is clipped to it). */
      box: Box;
      fit: ImageFit;
      mirror?: boolean;
      /** Screen-reader text for an image (WCAG 1.1.1). */
      alt?: string;
      /** CSS filter for a per-widget colour grade (`filtersToCss`).
       *  Used when `ctx.filter` exists; the DOM stage always uses this. */
      filter?: string;
      /** Structured grade for the pixel-math fallback (Safari < 18). */
      grade?: VideoFilters;
      muted?: boolean;
      /** DOM-only: the export keys through the pixel pass instead. */
      chromaKey?: ChromaKeyParams | null;
    })
  | (OpBase & {
      op: "raster";
      box: Box;
      /** Changes whenever the painted pixels would — the DOM repaints on it. */
      key: string;
      /** Paints in canvas px (the DOM maps its <canvas> onto `box`). */
      paint: (ctx: Ctx2D, box: Box) => void;
    })
  | (OpBase & {
      op: "embed";
      /** The DOM mounts the entity's own live component here. */
      embed: "linked-content" | "engagement-asset";
      box: Box;
      /** What renderers without that component draw (the export). */
      fallback: DrawOp[];
    });

/** Project data the export preloads before painting (synchronous reads).
 *  The DOM's live embeds fetch their own, so it passes `NO_LOOKUPS`. */
export interface DrawLookups {
  linkedContent(kind: LinkedContentKind, id: string): LinkedContentSummary | null | undefined;
  engagementTitle(kind: EngagementAssetKind, id: string): string;
  /** The QR module matrix (`true` = dark) for `text`, or null when the
   *  encoder isn't loaded or the text can't be encoded. */
  qrMatrix(text: string): boolean[][] | null;
}

export const NO_LOOKUPS: DrawLookups = {
  linkedContent: () => undefined,
  engagementTitle: () => "",
  qrMatrix: () => null,
};

/** Everything a plugin's `draw` may read besides its own params. */
export interface DrawEnv {
  render: RenderContext;
  /** Canvas size in px — for params stored as canvas fractions. */
  canvas: { width: number; height: number };
  /** Clip-local time (the authored start pose in the edit canvas). */
  clipTimeSec: number;
  clipDurationSec: number;
  /** Text metrics for a `font` shorthand. */
  measure(font: string): Measure;
  /** i18n lookup for any label the drawing paints. */
  t(key: string, vars?: Record<string, string>): string;
  lookups: DrawLookups;
}

export function pathToSvg(d: ReadonlyArray<PathCmd>): string {
  return d.map((c) => c.join(" ")).join(" ");
}

/** Map a path authored in a 0..100 unit square onto `box`. */
export function scaleUnitPath(d: ReadonlyArray<PathCmd>, box: Box): PathCmd[] {
  const sx = (v: number) => box.x + (v / 100) * box.w;
  const sy = (v: number) => box.y + (v / 100) * box.h;
  return d.map((c): PathCmd => {
    switch (c[0]) {
      case "M":
        return ["M", sx(c[1]), sy(c[2])];
      case "L":
        return ["L", sx(c[1]), sy(c[2])];
      case "C":
        return ["C", sx(c[1]), sy(c[2]), sx(c[3]), sy(c[4]), sx(c[5]), sy(c[6])];
      case "Z":
        return ["Z"];
    }
  });
}

/** Parse a unit-square outline written as an SVG `d` string (M / L / C / Z,
 *  absolute, comma or space separated). */
export function parseUnitPath(d: string): PathCmd[] {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/g) ?? [];
  const out: PathCmd[] = [];
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M") out.push(["M", num(), num()]);
    else if (cmd === "L") out.push(["L", num(), num()]);
    else if (cmd === "C") out.push(["C", num(), num(), num(), num(), num(), num()]);
    else if (cmd === "Z") out.push(["Z"]);
  }
  return out;
}

export function insetBox(b: Box, by: number): Box {
  return { x: b.x + by, y: b.y + by, w: Math.max(0, b.w - by * 2), h: Math.max(0, b.h - by * 2) };
}

/** A filled box with a stroke drawn INSIDE it (CSS `border-box`): a centred
 *  stroke would bleed half its width outside the box the preview shows. */
export function filledBoxOps(
  kind: "rect" | "ellipse",
  box: Box,
  fill: string | undefined,
  stroke: Stroke | null,
  radius = 0,
): DrawOp[] {
  const ops: DrawOp[] = [];
  if (fill) ops.push(kind === "rect" ? { op: "rect", box, radius, fill } : { op: "ellipse", box, fill });
  if (stroke && stroke.width > 0) {
    const inner = insetBox(box, stroke.width / 2);
    ops.push(
      kind === "rect"
        ? { op: "rect", box: inner, radius: Math.max(0, radius - stroke.width / 2), stroke }
        : { op: "ellipse", box: inner, stroke },
    );
  }
  return ops;
}

/** Where media of `src` size lands for `fit` inside `box` (CSS object-fit). */
export function fitRect(box: Box, fit: ImageFit, srcW: number, srcH: number): Box {
  if (!srcW || !srcH || fit === "stretch" || box.w <= 0 || box.h <= 0) return box;
  const srcRatio = srcW / srcH;
  const boxRatio = box.w / box.h;
  const widthBound = fit === "cover" ? srcRatio <= boxRatio : srcRatio > boxRatio;
  const w = widthBound ? box.w : box.h * srcRatio;
  const h = widthBound ? box.w / srcRatio : box.h;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}
