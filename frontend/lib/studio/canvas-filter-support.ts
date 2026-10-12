/**
 * Canvas `ctx.filter` support + Safari version detection (#2393).
 *
 * Per-widget colour grades used to set `ctx.filter` to a CSS string.
 * Safari before 18 has no `ctx.filter` at all, so those grades were a
 * no-op on export. Scene grades already fall back to pixel math
 * (`filter-pixels.ts`); widget media ops now do the same.
 *
 * Feature-detect (`"filter" in ctx`) is the runtime gate for the paint
 * path. Safari version is for the inspector warning — "this Safari is
 * too old" — not for choosing how to paint.
 */

export type FilterableCtx = { filter?: unknown };

/** True when the context honours `ctx.filter`. Older Safari has no such
 *  property at all, so a plain `in` check is reliable. */
export function supportsCanvasFilter(ctx: FilterableCtx): boolean {
  return "filter" in ctx;
}

/**
 * Major Safari version, or null when the UA is not Safari (Chrome,
 * Chromium, Edge, Firefox iOS, Android WebView all contain "Safari").
 */
export function safariMajorVersion(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
): number | null {
  if (!ua) return null;
  // Chrome/Chromium/Edge/Opera/Firefox-iOS/Android all include "Safari"
  // in the UA; skip them. CriOS is Chrome on iOS.
  if (/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android/i.test(ua)) return null;
  if (!/Safari/i.test(ua)) return null;
  const m = ua.match(/Version\/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Safari before 18 cannot apply `ctx.filter`. */
export function safariLacksCanvasFilter(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
): boolean {
  const v = safariMajorVersion(ua);
  return v !== null && v < 18;
}
