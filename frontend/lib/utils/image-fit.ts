/**
 * Image-fit math — single source for "scale this source rectangle
 * into this destination rectangle". Extracted per the DRY rule after
 * the same letterbox / cover calculation showed up in three places:
 *   • `lib/services/headshot-engine.ts` — composite subject onto backdrop
 *   • `components/studio/drawing/DrawingStage.tsx` (via drawing-engine) —
 *     fit AI-generated image onto a layer
 *   • `lib/timeline/frame-renderer.ts` — letterbox nested timelines
 *
 * `cover` fills the destination — the source is scaled UP so the whole
 * destination is painted; source may overflow the destination bounds.
 * `contain` letterboxes — the source fits ENTIRELY inside the
 * destination; whitespace may appear on the short axis.
 *
 * Returns the dest-coordinate rect `(dx, dy, dw, dh)` callers pass to
 * `ctx.drawImage(src, dx, dy, dw, dh)`.
 */

export interface FitRect {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** Cover-fit — source fills destination, may overflow. */
export function coverRect(
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
): FitRect {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { dx: 0, dy: 0, dw: destWidth, dh: destHeight };
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const destRatio = destWidth / destHeight;
  if (sourceRatio > destRatio) {
    const drawH = destHeight;
    const drawW = destHeight * sourceRatio;
    return { dx: (destWidth - drawW) / 2, dy: 0, dw: drawW, dh: drawH };
  }
  const drawW = destWidth;
  const drawH = destWidth / sourceRatio;
  return { dx: 0, dy: (destHeight - drawH) / 2, dw: drawW, dh: drawH };
}

/** Contain-fit (letterbox) — source fits entirely inside destination,
 *  may leave whitespace. Centred. */
export function containRect(
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
): FitRect {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { dx: 0, dy: 0, dw: destWidth, dh: destHeight };
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const destRatio = destWidth / destHeight;
  let dw: number;
  let dh: number;
  if (sourceRatio > destRatio) {
    dw = destWidth;
    dh = destWidth / sourceRatio;
  } else {
    dh = destHeight;
    dw = destHeight * sourceRatio;
  }
  return {
    dx: (destWidth - dw) / 2,
    dy: (destHeight - dh) / 2,
    dw,
    dh,
  };
}
