/**
 * Comic outlines (#939) in a 0..100 unit square, stretched onto the widget's
 * content box by `scaleUnitPath`. One table for both renderers — the DOM
 * used to draw these as SVG while the export drew different shapes.
 */
import type { SfxBurstWidgetParams, SpeechBubbleWidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import type { Box } from "../frame";
import { parseUnitPath, scaleUnitPath, type DrawOp, type PathCmd, type Stroke } from "../draw-ops";

const BUBBLE_OUTLINES: Record<"thought" | "shout", PathCmd[]> = {
  // Cloud: lobes around the box (trailing puffs are separate circles).
  thought: parseUnitPath(
    "M 50,8 C 70,8 84,18 84,30 C 92,32 96,40 96,50 C 96,64 82,72 70,70 C 66,80 56,84 46,82 C 38,90 24,86 22,76 C 8,76 6,60 14,52 C 8,42 14,28 26,28 C 28,16 40,8 50,8 Z",
  ),
  // Jagged starburst — yelling.
  shout: parseUnitPath(
    "M 50,2 L 56,12 L 68,8 L 64,20 L 78,18 L 70,28 L 84,32 L 74,40 L 88,46 L 76,52 L 86,62 L 74,64 L 82,76 L 70,72 L 72,86 L 60,78 L 58,92 L 48,82 L 42,94 L 36,82 L 26,90 L 26,76 L 14,80 L 18,68 L 6,64 L 14,56 L 4,48 L 14,42 L 6,32 L 18,30 L 12,18 L 24,20 L 24,8 L 36,14 L 40,2 Z",
  ),
};

const BURST_OUTLINES: Record<SfxBurstWidgetParams["shape"], PathCmd[]> = {
  star: parseUnitPath("M 50,2 L 60,38 L 98,38 L 68,60 L 78,96 L 50,74 L 22,96 L 32,60 L 2,38 L 40,38 Z"),
  jagged: parseUnitPath(
    "M 50,2 L 58,18 L 76,8 L 70,26 L 92,30 L 78,44 L 96,56 L 78,62 L 90,80 L 70,76 L 72,96 L 56,82 L 50,98 L 44,82 L 28,96 L 30,76 L 10,80 L 22,62 L 4,56 L 22,44 L 8,30 L 30,26 L 24,8 L 42,18 Z",
  ),
  "circle-jagged": parseUnitPath(
    "M 50,4 L 60,10 L 70,6 L 76,16 L 88,18 L 90,30 L 96,40 L 90,52 L 96,64 L 84,72 L 80,84 L 68,84 L 58,94 L 48,86 L 38,96 L 28,86 L 16,88 L 12,76 L 4,68 L 10,56 L 4,44 L 12,32 L 8,20 L 22,18 L 28,8 L 40,12 Z",
  ),
  lightning: parseUnitPath("M 50,2 L 30,42 L 50,42 L 28,98 L 78,40 L 56,40 L 76,2 Z"),
};

export function burstOutline(shape: SfxBurstWidgetParams["shape"], box: Box): PathCmd[] {
  return scaleUnitPath(BURST_OUTLINES[shape], box);
}

/** The bubble body: an ellipse for speech / whisper (dashed), the cloud or
 *  the starburst for thought / shout. */
export function bubbleBodyOps(shape: SpeechBubbleWidgetParams["shape"], box: Box, fill: string, stroke: Stroke): DrawOp[] {
  if (shape === "thought" || shape === "shout") {
    return [{ op: "path", d: scaleUnitPath(BUBBLE_OUTLINES[shape], box), fill, stroke }];
  }
  const s: Stroke = shape === "whisper" ? { ...stroke, dash: [stroke.width * 2, stroke.width * 2] } : stroke;
  const inset = s.width / 2;
  return [{ op: "ellipse", box: { x: box.x + inset, y: box.y + inset, w: box.w - inset * 2, h: box.h - inset * 2 }, fill, stroke: s }];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The pointer from a bubble toward the speaker at `tip` (canvas px). Speech /
 * shout / whisper get a triangle whose base sits inside the bubble (the body,
 * drawn after, covers it) plus a fill-only patch over the body's outline where
 * the tail leaves it; thought gets two shrinking puffs.
 */
export function bubbleTailOps(
  shape: SpeechBubbleWidgetParams["shape"],
  box: Box,
  tip: { x: number; y: number },
  fill: string,
  stroke: Stroke,
): { under: DrawOp[]; over: DrawOp[] } {
  const baseX = clamp(tip.x, box.x + box.w * 0.25, box.x + box.w * 0.75);
  if (shape === "thought") {
    const from = { x: baseX, y: box.y + box.h * 0.9 };
    const r = Math.max(3, Math.min(box.w, box.h) * 0.06);
    const puff = (t: number, radius: number): DrawOp => {
      const cx = from.x + (tip.x - from.x) * t;
      const cy = from.y + (tip.y - from.y) * t;
      return { op: "ellipse", box: { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 }, fill, stroke };
    };
    return { under: [], over: [puff(0.35, r), puff(0.7, r * 0.6)] };
  }
  const baseY = box.y + box.h * 0.75;
  const half = clamp(box.w * 0.08, 4, 18);
  const tail: DrawOp = {
    op: "path",
    d: [["M", baseX - half, baseY], ["L", tip.x, tip.y], ["L", baseX + half, baseY], ["Z"]],
    fill,
    stroke,
  };
  // Cover the body outline across the tail's mouth: a fill-only triangle
  // narrower than the tail by the stroke width, reaching half way to the tip.
  const inner = half - stroke.width;
  const patch: DrawOp = {
    op: "path",
    d: [
      ["M", baseX - inner, baseY],
      ["L", baseX + (tip.x - baseX) * 0.5, baseY + (tip.y - baseY) * 0.5],
      ["L", baseX + inner, baseY],
      ["Z"],
    ],
    fill,
  };
  return { under: [tail], over: inner > 0 ? [patch] : [] };
}

/** Unit-square fallback puffs for a thought bubble with no tail. */
export function freePuffOps(box: Box, fill: string, stroke: Stroke): DrawOp[] {
  const circle = (cx: number, cy: number, r: number): DrawOp => {
    const rx = (r / 100) * box.w;
    const ry = (r / 100) * box.h;
    return {
      op: "ellipse",
      box: { x: box.x + (cx / 100) * box.w - rx, y: box.y + (cy / 100) * box.h - ry, w: rx * 2, h: ry * 2 },
      fill,
      stroke,
    };
  };
  return [circle(30, 92, 4), circle(22, 98, 2.5)];
}
