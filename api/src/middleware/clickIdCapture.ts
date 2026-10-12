/**
 * Click-ID capture middleware.
 *
 * When a visitor lands on hired.video from a paid ad, the destination
 * URL carries a platform-specific click identifier:
 *   - Meta:     ?fbclid=...
 *   - Google:   ?gclid=... (also ?wbraid=, ?gbraid= for app campaigns)
 *   - LinkedIn: ?li_fat_id=...
 *   - TikTok:   ?ttclid=...
 *   - Bing:     ?msclkid=...
 *
 * We capture these at landing in a 90-day cookie so subsequent server
 * actions (signup, paid_upgrade) can attribute the conversion back to
 * the originating click via the CAPI fan-out
 * (services/paid-media/conversions/capi.ts).
 *
 * Frontend reads the same cookie via document.cookie and sends it on
 * conversion events too — server middleware is the fallback for SSR /
 * server-only conversion paths.
 */

import type { Context, MiddlewareHandler } from "hono";

const CLICK_ID_PARAMS = ["fbclid", "gclid", "li_fat_id", "ttclid", "msclkid"] as const;
type ClickIdParam = (typeof CLICK_ID_PARAMS)[number];

/** Cookie name used for each click ID (matches frontend `paid-media-pixels.ts`). */
const COOKIE_NAME: Record<ClickIdParam, string> = {
  fbclid:    "_hv_fbclid",
  gclid:     "_hv_gclid",
  li_fat_id: "_hv_li_fat_id",
  ttclid:    "_hv_ttclid",
  msclkid:   "_hv_msclkid",
};

const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 days — matches Meta's fbclid window

function isValidClickId(id: string): boolean {
  // Accept ASCII printable, max 256 chars. Platforms use base64-url-like
  // or hex IDs; we don't validate format beyond a sanity bound.
  return id.length > 0 && id.length <= 256 && /^[\w.\-=]+$/.test(id);
}

/** Hono middleware. Idempotent — safe to mount on every request. */
export const clickIdCaptureMiddleware: MiddlewareHandler = async (c, next) => {
  const url = new URL(c.req.url);
  for (const param of CLICK_ID_PARAMS) {
    const value = url.searchParams.get(param);
    if (!value || !isValidClickId(value)) continue;
    // Set cookie. SameSite=Lax so it survives the redirect chain from
    // an ad click; Secure=true in prod (left for the response layer to
    // handle via setSecureCookie helper if needed).
    c.header(
      "Set-Cookie",
      `${COOKIE_NAME[param]}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`,
      { append: true },
    );
  }
  return next();
};

/** Read click IDs from request cookies. Returns null entries for
 *  missing IDs so the caller can spread into a ConversionEvent. */
export function readClickIds(c: Context): {
  fbclid:  string | null;
  gclid:   string | null;
  liFatId: string | null;
  ttclid:  string | null;
  msclkid: string | null;
} {
  const cookie = c.req.header("cookie") ?? "";
  const get = (name: string): string | null => {
    const m = new RegExp(`(?:^|; )${name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&")}=([^;]*)`).exec(cookie);
    return m ? decodeURIComponent(m[1]) : null;
  };
  return {
    fbclid:  get(COOKIE_NAME.fbclid),
    gclid:   get(COOKIE_NAME.gclid),
    liFatId: get(COOKIE_NAME.li_fat_id),
    ttclid:  get(COOKIE_NAME.ttclid),
    msclkid: get(COOKIE_NAME.msclkid),
  };
}
