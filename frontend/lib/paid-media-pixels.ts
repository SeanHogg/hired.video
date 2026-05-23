/**
 * Runtime pixel injection for paid media.
 *
 * Reads /api/paid-media/pixels/public (no auth) and appends the
 * platform-specific tracking snippets to <head>. Idempotent — safe to
 * call multiple times; each snippet is keyed by a `data-paid-media`
 * attribute so we never inject the same script twice.
 *
 * Click-ID capture: when a visitor lands on hired.video from a paid ad
 * carrying ?fbclid / ?gclid / ?li_fat_id / ?ttclid / ?msclkid, we store
 * the value in a 90-day cookie so subsequent conversions can include
 * it server-side via paid-media-service.recordConversion(). The Hono
 * middleware does the same on the server — this client-side version
 * exists because some signups happen entirely client-side (e.g. magic
 * link issued from a deep link) and never round-trip through the
 * server before the conversion fires.
 */

import { paidMediaService, type PublicPixelConfig } from "./services/paid-media-service";

const CLICK_ID_PARAMS = ["fbclid", "gclid", "li_fat_id", "ttclid", "msclkid"] as const;
type ClickIdParam = (typeof CLICK_ID_PARAMS)[number];

const COOKIE_NAME: Record<ClickIdParam, string> = {
  fbclid:    "_hv_fbclid",
  gclid:     "_hv_gclid",
  li_fat_id: "_hv_li_fat_id",
  ttclid:    "_hv_ttclid",
  msclkid:   "_hv_msclkid",
};

const COOKIE_MAX_AGE_DAYS = 90;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    _linkedin_partner_id?: string;
    _linkedin_data_partner_ids?: string[];
    lintrk?: (action: string, params?: Record<string, unknown>) => void;
    ttq?: { load: (id: string) => void; page: () => void; track: (event: string, params?: Record<string, unknown>) => void };
    uetq?: Array<unknown> | { push: (...args: unknown[]) => void };
  }
}

// ─── Click-ID cookie capture (client-side mirror of server middleware) ───
export function captureClickIds(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  for (const param of CLICK_ID_PARAMS) {
    const value = url.searchParams.get(param);
    if (!value) continue;
    document.cookie = `${COOKIE_NAME[param]}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  }
}

export function readClickIds(): Record<ClickIdParam, string | null> {
  const out = {} as Record<ClickIdParam, string | null>;
  for (const param of CLICK_ID_PARAMS) {
    out[param] = readCookie(COOKIE_NAME[param]);
  }
  return out;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = new RegExp(`(?:^|; )${name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&")}=([^;]*)`).exec(document.cookie);
  return m ? decodeURIComponent(m[1]) : null;
}

// ─── Pixel snippet appenders ─────────────────────────────────────────────
function ensureScriptOnce(key: string, src: string, attrs?: Record<string, string>): boolean {
  if (typeof document === "undefined") return false;
  if (document.querySelector(`script[data-paid-media="${key}"]`)) return false;
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  s.dataset.paidMedia = key;
  for (const [k, v] of Object.entries(attrs ?? {})) s.setAttribute(k, v);
  document.head.appendChild(s);
  return true;
}

function ensureInlineOnce(key: string, code: string): boolean {
  if (typeof document === "undefined") return false;
  if (document.querySelector(`script[data-paid-media="${key}"]`)) return false;
  const s = document.createElement("script");
  s.dataset.paidMedia = key;
  s.text = code;
  document.head.appendChild(s);
  return true;
}

function ensureNoscriptImg(key: string, src: string): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`noscript[data-paid-media="${key}"]`)) return;
  const n = document.createElement("noscript");
  n.dataset.paidMedia = key;
  n.innerHTML = `<img height="1" width="1" style="display:none" src="${src}" alt="" />`;
  document.body.appendChild(n);
}

function injectMeta(pixelId: string) {
  ensureInlineOnce("meta-base", `
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${pixelId}');
    fbq('track', 'PageView');
  `);
  ensureNoscriptImg("meta-noscript", `https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1`);
}

function injectGoogleAds(conversionId: string, measurementId: string | null) {
  if (!ensureScriptOnce("gtag-loader", `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(conversionId)}`)) return;
  ensureInlineOnce("gtag-init", `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${conversionId}');
    ${measurementId ? `gtag('config', '${measurementId}');` : ""}
  `);
}

function injectLinkedIn(partnerId: string) {
  ensureInlineOnce("linkedin-init", `
    _linkedin_partner_id = "${partnerId}";
    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    window._linkedin_data_partner_ids.push("${partnerId}");
  `);
  ensureInlineOnce("linkedin-loader", `
    (function(l) {
      if (!l){window.lintrk = function(a,b){window.lintrk.q.push([a,b])}; window.lintrk.q=[]}
      var s = document.getElementsByTagName("script")[0];
      var b = document.createElement("script");
      b.type = "text/javascript";b.async = true;
      b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
      s.parentNode.insertBefore(b, s);
    })(window.lintrk);
  `);
  ensureNoscriptImg("linkedin-noscript", `https://px.ads.linkedin.com/collect/?pid=${encodeURIComponent(partnerId)}&fmt=gif`);
}

function injectTikTok(pixelId: string) {
  ensureInlineOnce("tiktok-init", `
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
      ttq.load('${pixelId}');
      ttq.page();
    }(window, document, 'ttq');
  `);
}

function injectBingUet(tagId: string) {
  ensureInlineOnce("bing-uet", `
    (function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[],f=function(){var o={ti:"${tagId}", enableAutoSpaTracking: true};o.q=w[u],w[u]=new UET(o),w[u].push("pageLoad")},n=d.createElement(t),n.src=r,n.async=1,n.onload=n.onreadystatechange=function(){var s=this.readyState;s&&s!=="loaded"&&s!=="complete"||(f(),n.onload=n.onreadystatechange=null)},i=d.getElementsByTagName(t)[0],i.parentNode.insertBefore(n,i)})(window,document,"script","//bat.bing.com/bat.js","uetq");
  `);
}

// ─── Public entry point ───────────────────────────────────────────────────
export interface InstallPixelsOptions {
  /** Which workspace's pixels to load. Defaults to the house workspace
   *  (hired.video's own marketing pixels) — appropriate for the public
   *  marketing site / signup pages. */
  workspaceUserId?: string;
  workspaceCompanyId?: string | null;
}

export async function installPaidMediaPixels(opts: InstallPixelsOptions = {}): Promise<void> {
  captureClickIds();
  try {
    const config = await paidMediaService.getPublicPixelConfig(opts.workspaceUserId, opts.workspaceCompanyId ?? null);
    if (!config || (config as any).configured === false) return;
    const cfg = config as PublicPixelConfig;
    if (cfg.metaPixelId)               injectMeta(cfg.metaPixelId);
    if (cfg.googleAdsConversionId)     injectGoogleAds(cfg.googleAdsConversionId, cfg.ga4MeasurementId);
    else if (cfg.ga4MeasurementId)     injectGoogleAds(cfg.ga4MeasurementId, null);
    if (cfg.linkedInPartnerId)         injectLinkedIn(cfg.linkedInPartnerId);
    if (cfg.tiktokPixelId)             injectTikTok(cfg.tiktokPixelId);
    if (cfg.bingUetTagId)              injectBingUet(cfg.bingUetTagId);
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[paid-media] failed to load pixel config", err);
    }
  }
}

/** Fire a client-side "track" event on every installed pixel. Use for
 *  events that should be deduplicated with the server-side CAPI fan-out
 *  (recordConversion). Each platform's tracking call is fire-and-forget. */
export function trackEvent(eventName: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try { window.fbq?.("track", eventName, params); } catch { /* fb pixel missing */ }
  try { window.gtag?.("event", eventName, params); } catch { /* gtag missing */ }
  try { window.lintrk?.("track", { conversion_id: params?.conversionId }); } catch { /* lintrk missing */ }
  try { window.ttq?.track(eventName, params); } catch { /* tiktok missing */ }
  try {
    const uet = window.uetq;
    if (Array.isArray(uet)) uet.push("event", eventName, params);
    else uet?.push("event", eventName, params);
  } catch { /* bing uet missing */ }
}
