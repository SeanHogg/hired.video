/**
 * Canvas chart drawer — single rendering implementation used by every
 * studio surface that draws a chart:
 *
 *   • The intake preview (driven by `<ChartRenderer>` which mounts an
 *     HTML <canvas> and calls drawChart at the right size).
 *   • The export-time scene compiler (canvas-nodes.ts, called inside
 *     the per-frame draw loop so the chart bakes into the final MP4).
 *
 * One implementation means the user sees in the editor exactly what
 * they get in the rendered video — no "ours uses recharts but the
 * exporter draws a placeholder" mismatch. Aesthetics are deliberately
 * simple; we trade recharts polish for guaranteed export fidelity.
 *
 * All four chart types (bar / line / pie / scatter) live here. The
 * function takes a `CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D`
 * so it works in both the live preview canvas and the export pipeline's
 * OffscreenCanvas frames.
 */

import {
  DEFAULT_CHART_COLORS,
  parseChartData,
  type ChartFormat,
} from "./chart-data";
import type { ChartType } from "@/types/video-script";

type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface DrawChartOptions {
  chartType: ChartType;
  data: string;
  format?: ChartFormat;
  /** Pixel rect on the target canvas. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Palette override; falls back to DEFAULT_CHART_COLORS. */
  colors?: string[];
  /** Title rendered above the chart area. */
  title?: string;
  /** Caption rendered below. */
  takeaway?: string;
  /** Foreground colour for axes / labels. Default white. */
  foreground?: string;
  /** Background fill — when omitted, the rect is left transparent so
   *  the underlying scene shows through. */
  background?: string;
}

/** Draw a chart into the given rect on `ctx`. Self-contained — handles
 *  empty / unparseable data by drawing a centred "no data" line so
 *  callers don't have to gate. */
export function drawChart(ctx: AnyCtx, opts: DrawChartOptions): void {
  const { chartType, data, format, x, y, w, h, title, takeaway } = opts;
  const fg = opts.foreground ?? "#ffffff";
  const palette = opts.colors && opts.colors.length > 0 ? opts.colors : DEFAULT_CHART_COLORS;

  ctx.save();
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(x, y, w, h);
  }

  // Reserve top space for the title and bottom space for the takeaway.
  const titleH = title ? Math.max(14, Math.round(h * 0.06)) : 0;
  const takeawayH = takeaway ? Math.max(12, Math.round(h * 0.08)) : 0;
  const padX = Math.round(w * 0.04);
  const padY = Math.round(h * 0.04);

  if (title) {
    ctx.font = `bold ${titleH}px Inter, sans-serif`;
    ctx.fillStyle = fg;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(truncateToWidth(ctx, title, w - padX * 2), x + padX, y + padY);
  }

  const plotX = x + padX;
  const plotY = y + padY + (titleH ? titleH + 4 : 0);
  const plotW = w - padX * 2;
  const plotH = h - padY * 2 - (titleH ? titleH + 4 : 0) - (takeawayH ? takeawayH + 6 : 0);

  const parsed = parseChartData(data, format);
  if (parsed.rows.length === 0 || parsed.keys.length < 2) {
    ctx.font = `${Math.max(11, Math.round(plotH * 0.08))}px Inter, sans-serif`;
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.6;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No data to plot", plotX + plotW / 2, plotY + plotH / 2);
    ctx.globalAlpha = 1;
    drawTakeaway();
    ctx.restore();
    return;
  }

  const labelKey = parsed.keys[0];
  const seriesKeys = parsed.keys
    .slice(1)
    .filter((k) => parsed.rows.some((r) => typeof r[k] === "number"));

  switch (chartType) {
    case "bar":     drawBar(ctx, parsed.rows, labelKey, seriesKeys, plotX, plotY, plotW, plotH, palette, fg); break;
    case "line":    drawLine(ctx, parsed.rows, labelKey, seriesKeys, plotX, plotY, plotW, plotH, palette, fg); break;
    case "pie":     drawPie(ctx, parsed.rows, labelKey, seriesKeys[0] ?? "", plotX, plotY, plotW, plotH, palette, fg); break;
    case "scatter": drawScatter(ctx, parsed.rows, labelKey, seriesKeys, plotX, plotY, plotW, plotH, palette, fg); break;
  }

  drawTakeaway();
  ctx.restore();

  function drawTakeaway() {
    if (!takeaway) return;
    const fontSize = Math.max(11, Math.round(takeawayH * 0.7));
    ctx.font = `italic ${fontSize}px Inter, sans-serif`;
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.85;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(
      truncateToWidth(ctx, takeaway, w - padX * 2),
      x + w / 2,
      y + h - padY,
    );
    ctx.globalAlpha = 1;
  }
}

// ─── Per-type drawers ──────────────────────────────────────────────────────

function drawBar(
  ctx: AnyCtx,
  rows: Array<Record<string, string | number>>,
  labelKey: string,
  seriesKeys: string[],
  x: number, y: number, w: number, h: number,
  palette: string[], fg: string,
) {
  if (seriesKeys.length === 0) return;
  const axisPad = Math.max(28, Math.round(w * 0.06));
  const plotX = x + axisPad;
  const plotW = w - axisPad - 8;
  const plotY = y;
  const plotH = h - 22; // room for x-axis labels

  const allValues = rows.flatMap((r) => seriesKeys.map((k) => Number(r[k]) || 0));
  const max = Math.max(0, ...allValues);
  const min = Math.min(0, ...allValues);
  const range = max - min || 1;

  drawAxes(ctx, plotX, plotY, plotW, plotH, fg);
  // Y axis labels (3 ticks)
  drawYTicks(ctx, plotX, plotY, plotH, min, max, fg);

  const groupGap = plotW / rows.length;
  const groupBarW = (groupGap * 0.7) / Math.max(1, seriesKeys.length);
  const groupStart = (groupGap * 0.15);

  rows.forEach((row, i) => {
    const baseX = plotX + i * groupGap + groupStart;
    seriesKeys.forEach((k, s) => {
      const v = Number(row[k]) || 0;
      const barH = ((v - min) / range) * plotH;
      const barX = baseX + s * groupBarW;
      const barY = plotY + plotH - barH;
      ctx.fillStyle = palette[s % palette.length];
      ctx.fillRect(barX, barY, Math.max(1, groupBarW - 2), Math.max(0, barH));
    });
    // X label
    const label = String(row[labelKey] ?? "");
    if (label) {
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.7;
      ctx.font = `${Math.max(9, Math.round(plotH * 0.05))}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(
        truncateToWidth(ctx, label, groupGap - 4),
        plotX + i * groupGap + groupGap / 2,
        plotY + plotH + 4,
      );
      ctx.globalAlpha = 1;
    }
  });

  drawLegend(ctx, seriesKeys, palette, x, y, w, fg);
}

function drawLine(
  ctx: AnyCtx,
  rows: Array<Record<string, string | number>>,
  labelKey: string,
  seriesKeys: string[],
  x: number, y: number, w: number, h: number,
  palette: string[], fg: string,
) {
  if (seriesKeys.length === 0) return;
  const axisPad = Math.max(28, Math.round(w * 0.06));
  const plotX = x + axisPad;
  const plotW = w - axisPad - 8;
  const plotY = y;
  const plotH = h - 22;

  const allValues = rows.flatMap((r) => seriesKeys.map((k) => Number(r[k]) || 0));
  const max = Math.max(...allValues);
  const min = Math.min(...allValues);
  const range = max - min || 1;

  drawAxes(ctx, plotX, plotY, plotW, plotH, fg);
  drawYTicks(ctx, plotX, plotY, plotH, min, max, fg);

  const stepX = rows.length > 1 ? plotW / (rows.length - 1) : 0;

  seriesKeys.forEach((k, s) => {
    ctx.strokeStyle = palette[s % palette.length];
    ctx.lineWidth = Math.max(2, Math.round(plotH * 0.012));
    ctx.beginPath();
    rows.forEach((row, i) => {
      const v = Number(row[k]) || 0;
      const px = plotX + i * stepX;
      const py = plotY + plotH - ((v - min) / range) * plotH;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });

  // X labels — first, middle, last to avoid clutter
  const sample = uniqueIndices(rows.length);
  ctx.fillStyle = fg;
  ctx.globalAlpha = 0.7;
  ctx.font = `${Math.max(9, Math.round(plotH * 0.05))}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const i of sample) {
    const label = String(rows[i]?.[labelKey] ?? "");
    if (!label) continue;
    ctx.fillText(truncateToWidth(ctx, label, stepX * 1.5), plotX + i * stepX, plotY + plotH + 4);
  }
  ctx.globalAlpha = 1;

  drawLegend(ctx, seriesKeys, palette, x, y, w, fg);
}

function drawPie(
  ctx: AnyCtx,
  rows: Array<Record<string, string | number>>,
  labelKey: string,
  seriesKey: string,
  x: number, y: number, w: number, h: number,
  palette: string[], fg: string,
) {
  if (!seriesKey) return;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) * 0.4;
  const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row[seriesKey]) || 0), 0);
  if (total <= 0) return;

  let angle = -Math.PI / 2;
  rows.forEach((row, i) => {
    const v = Math.max(0, Number(row[seriesKey]) || 0);
    if (v <= 0) return;
    const slice = (v / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = palette[i % palette.length];
    ctx.fill();
    angle += slice;
  });

  // Legend on the right side
  ctx.font = `${Math.max(10, Math.round(h * 0.05))}px Inter, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  rows.forEach((row, i) => {
    const label = String(row[labelKey] ?? `#${i + 1}`);
    const ly = y + 12 + i * 16;
    if (ly > y + h - 12) return;
    ctx.fillStyle = palette[i % palette.length];
    ctx.fillRect(x + 4, ly - 4, 8, 8);
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.85;
    ctx.fillText(truncateToWidth(ctx, label, 80), x + 16, ly);
    ctx.globalAlpha = 1;
  });
}

function drawScatter(
  ctx: AnyCtx,
  rows: Array<Record<string, string | number>>,
  labelKey: string,
  seriesKeys: string[],
  x: number, y: number, w: number, h: number,
  palette: string[], fg: string,
) {
  if (seriesKeys.length === 0) return;
  const axisPad = Math.max(28, Math.round(w * 0.06));
  const plotX = x + axisPad;
  const plotW = w - axisPad - 8;
  const plotY = y;
  const plotH = h - 22;

  // X values — numeric label column if possible, else row index.
  const xValues = rows.map((r, i) => {
    const v = r[labelKey];
    return typeof v === "number" ? v : i;
  });
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const xRange = xMax - xMin || 1;

  const allY = rows.flatMap((r) => seriesKeys.map((k) => Number(r[k]) || 0));
  const yMin = Math.min(...allY);
  const yMax = Math.max(...allY);
  const yRange = yMax - yMin || 1;

  drawAxes(ctx, plotX, plotY, plotW, plotH, fg);
  drawYTicks(ctx, plotX, plotY, plotH, yMin, yMax, fg);

  rows.forEach((row, i) => {
    const px = plotX + ((xValues[i] - xMin) / xRange) * plotW;
    seriesKeys.forEach((k, s) => {
      const v = Number(row[k]) || 0;
      const py = plotY + plotH - ((v - yMin) / yRange) * plotH;
      ctx.fillStyle = palette[s % palette.length];
      ctx.beginPath();
      ctx.arc(px, py, Math.max(2, Math.round(plotH * 0.012)), 0, Math.PI * 2);
      ctx.fill();
    });
  });

  drawLegend(ctx, seriesKeys, palette, x, y, w, fg);
}

// ─── Shared chrome ─────────────────────────────────────────────────────────

function drawAxes(ctx: AnyCtx, x: number, y: number, w: number, h: number, fg: string) {
  ctx.strokeStyle = fg;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawYTicks(ctx: AnyCtx, x: number, y: number, h: number, min: number, max: number, fg: string) {
  ctx.fillStyle = fg;
  ctx.globalAlpha = 0.6;
  ctx.font = `${Math.max(9, Math.round(h * 0.06))}px Inter, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let t = 0; t <= 2; t++) {
    const v = min + ((max - min) * (2 - t)) / 2;
    const py = y + (h * t) / 2;
    ctx.fillText(formatTick(v), x - 4, py);
  }
  ctx.globalAlpha = 1;
}

function drawLegend(ctx: AnyCtx, keys: string[], palette: string[], x: number, y: number, w: number, fg: string) {
  if (keys.length <= 1) return;
  ctx.font = `${Math.max(9, Math.round(w * 0.018))}px Inter, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let cx = x + 8;
  const cy = y + 8;
  keys.forEach((k, i) => {
    ctx.fillStyle = palette[i % palette.length];
    ctx.fillRect(cx, cy - 4, 8, 8);
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.85;
    ctx.fillText(k, cx + 12, cy);
    ctx.globalAlpha = 1;
    cx += 12 + ctx.measureText(k).width + 12;
  });
}

function truncateToWidth(ctx: AnyCtx, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  const ellipsis = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo) + ellipsis : "";
}

function formatTick(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

function uniqueIndices(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  if (n === 2) return [0, 1];
  return [0, Math.floor(n / 2), n - 1];
}
