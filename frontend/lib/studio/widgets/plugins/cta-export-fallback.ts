/**
 * The export fallback for a CTA link (#2312) — the CTA card's button and
 * the linked-content card's pill. On the watch page each is a clickable
 * zone (interactions.ts); a downloaded or posted file has no overlay, so
 * the card would be a dead box. For the `"export"` render target the card
 * also paints:
 *   • the link as short readable text under the button (scheme, `www.` and
 *     campaign UTMs dropped; the width decides the ellipsis)
 *   • a QR code encoding the FULL URL — UTMs included, since the export
 *     bakes them in before painting — when the card is big enough to make
 *     it scannable
 * Pure draw-op data: the painter has no CTA branch.
 */
import { ctaUrlFromParams } from "@shared/cta-hotzones";
import type { CtaWidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import type { Box } from "../frame";
import type { DrawEnv, DrawOp, PathCmd } from "../draw-ops";
import type { WidgetInteraction } from "../plugin";

/** A module narrower than this blurs out of a compressed 1080p frame. */
export const QR_MIN_MODULE_PX = 3;
/** Light margin around the code, in modules (scanners need ≥ 2). */
export const QR_QUIET_MODULES = 2;
/** The QR column never takes more than this share of the card width. */
const QR_MAX_WIDTH_SHARE = 0.34;

export interface CtaExportFallback {
  /** Where the headline / sub / button / link stack goes (the card minus
   *  the QR column). */
  stack: Box;
  /** Readable link line under the button. */
  linkText: string;
  /** The QR ops (empty when the card is too small or the encoder is off). */
  qr: DrawOp[];
}

/** The link as a person would type it: no scheme, no `www.`, no `utm_*`
 *  params (the QR carries those), no trailing slash. */
export function readableUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return url;
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_")) parsed.searchParams.delete(key);
  }
  const query = parsed.searchParams.toString();
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
  return `${parsed.host.replace(/^www\./i, "")}${path}${query ? `?${query}` : ""}`;
}

/** A QR matrix as ops: a white quiet-zone card plus ONE path of the dark
 *  modules (row runs merged), on a whole-pixel module grid so edges stay
 *  crisp. Centred in `box`; empty when the box can't fit a scannable code. */
export function qrOps(matrix: ReadonlyArray<ReadonlyArray<boolean>>, box: Box): DrawOp[] {
  const span = matrix.length + QR_QUIET_MODULES * 2;
  const modulePx = Math.floor(Math.min(box.w, box.h) / span);
  if (matrix.length === 0 || modulePx < QR_MIN_MODULE_PX) return [];
  const side = modulePx * span;
  const left = Math.round(box.x + (box.w - side) / 2);
  const top = Math.round(box.y + (box.h - side) / 2);
  const d: PathCmd[] = [];
  matrix.forEach((row, r) => {
    const y = top + (r + QR_QUIET_MODULES) * modulePx;
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < row.length && row[c]) c++;
      const x0 = left + (start + QR_QUIET_MODULES) * modulePx;
      const x1 = left + (c + QR_QUIET_MODULES) * modulePx;
      d.push(["M", x0, y], ["L", x1, y], ["L", x1, y + modulePx], ["L", x0, y + modulePx], ["Z"]);
    }
  });
  return [
    { op: "rect", box: { x: left, y: top, w: side, h: side }, radius: modulePx, fill: "#ffffff" },
    { op: "path", d, fill: "#000000" },
  ];
}

/** What the export adds to a card linking to `url`, or null when it adds
 *  nothing (the interactive target, the owner turned it off, no link). */
export function linkExportFallback(
  url: string | null,
  enabled: boolean,
  content: Box,
  pad: number,
  env: DrawEnv,
): CtaExportFallback | null {
  if (env.render.target !== "export" || !enabled || !url) return null;
  const linkText = readableUrl(url);
  const matrix = env.lookups.qrMatrix(url);
  const side = Math.min(content.h - pad * 2, content.w * QR_MAX_WIDTH_SHARE);
  const column: Box = { x: content.x + content.w - pad - side, y: content.y + (content.h - side) / 2, w: side, h: side };
  const qr = matrix && side > 0 ? qrOps(matrix, column) : [];
  const stack: Box = qr.length ? { ...content, w: content.w - side - pad } : content;
  return { stack, linkText, qr };
}

/** The CTA card's fallback: its trimmed `ctaUrl` (the shared hot-zone rule). */
export function ctaExportFallback(data: CtaWidgetParams, content: Box, pad: number, env: DrawEnv): CtaExportFallback | null {
  return linkExportFallback(ctaUrlFromParams({ ctaUrl: data.ctaUrl }), data.exportFallback !== false, content, pad, env);
}

/** The QR payloads a link's export needs (a plugin's `assets().qrCodes`). */
export function linkQrPayloads(url: string | null, enabled: boolean): string[] {
  return enabled && url ? [url] : [];
}

/** The CTA card's QR payloads. */
export function ctaQrPayloads(data: CtaWidgetParams): string[] {
  return linkQrPayloads(ctaUrlFromParams({ ctaUrl: data.ctaUrl }), data.exportFallback !== false);
}

/** A CTA-link plugin's playback interaction, read off its EMITTED params
 *  with the SAME rule the API's `extractCtaHotzones` applies, so the
 *  public payload (UTM-baked) and the client-derived zone agree. */
export function ctaLinkInteractions(clip: Record<string, unknown>): WidgetInteraction[] {
  const url = ctaUrlFromParams(clip);
  return url ? [{ kind: "cta", url }] : [];
}
