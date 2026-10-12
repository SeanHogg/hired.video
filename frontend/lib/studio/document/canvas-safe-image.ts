/**
 * An image URL a canvas can draw WITHOUT tainting (so `toDataURL` works):
 *
 *   data: / blob: / same-origin   as is
 *   a host that sends CORS        as is (checked with an anonymous load)
 *   anything else                 fetched through the API's image proxy
 *                                 (GET /api/media/image) into a blob: URL
 *
 * Null when even the proxy can't read it. Callers revoke what `release`
 * names once they're done drawing.
 */
import { mediaProxyService } from "@/lib/services/media-proxy-service";

/** True when the URL can be drawn without asking anyone (no CORS check). */
export function isCanvasSafeByOrigin(url: string, origin: string): boolean {
  if (url.startsWith("data:") || url.startsWith("blob:")) return true;
  try {
    return new URL(url, origin).origin === origin;
  } catch {
    return false;
  }
}

/** How long the anonymous CORS probe may take before the proxy path takes
 *  over — a hanging host must not stall the download. */
export const CORS_PROBE_TIMEOUT_MS = 8000;

/** True when the image loads with CORS within `timeoutMs`; false on error or
 *  timeout (the pending load is abandoned). */
export function loadsWithCors(url: string, timeoutMs = CORS_PROBE_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      if (!ok) img.src = "";
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    img.crossOrigin = "anonymous";
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

export async function canvasSafeImageUrl(url: string): Promise<{ url: string; release?: () => void } | null> {
  if (!url) return null;
  if (isCanvasSafeByOrigin(url, window.location.origin)) return { url };
  if (await loadsWithCors(url)) return { url };
  try {
    const blob = await mediaProxyService.imageBlob(new URL(url, window.location.origin).toString());
    const local = URL.createObjectURL(blob);
    return { url: local, release: () => URL.revokeObjectURL(local) };
  } catch {
    return null;
  }
}
