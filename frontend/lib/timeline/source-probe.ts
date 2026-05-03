/**
 * Client-side media-metadata probing for NLE sources.
 *
 * For M1 we run entirely in-browser: a File/Blob is loaded into a hidden
 * media element, the onloadedmetadata handler reads its native
 * dimensions and duration, then the element is torn down. fps is not
 * exposed by HTMLMediaElement and is not strictly necessary for the
 * timeline (the Timeline.fps governs the composition; per-clip fps is
 * advisory until proxy generation lands), so we default video sources
 * to 30 — the editor can override.
 *
 * Single source of truth — the file picker AND any future drag-import
 * flow MUST go through `probeSource()` to derive a MediaSource. Don't
 * re-implement metadata extraction inline at the call site.
 */

import type { MediaKind, MediaSource } from "@shared/timeline";

export interface ProbeResult {
  /** A blob: URL the editor uses for in-session playback. NOT persisted —
   *  the eventual server-upload step replaces this with an R2 URL. */
  url: string;
  durationFrames: number;
  fps: number;
  width: number | null;
  height: number | null;
  kind: MediaKind;
}

const DEFAULT_FPS = 30;

/** Pick the MediaKind from a File's MIME type. */
export function kindOfFile(file: File): MediaKind | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

/**
 * Probe a file in-browser. Returns metadata + a session-scoped blob URL.
 * The caller is responsible for revoking the URL when the source is
 * removed.
 */
export async function probeSource(file: File): Promise<ProbeResult> {
  const kind = kindOfFile(file);
  if (!kind) throw new Error(`Unsupported file type: ${file.type || file.name}`);
  const url = URL.createObjectURL(file);

  if (kind === "image") {
    // Images have no duration; we treat them as a 1-second still by
    // default (the editor can resize). Width/height from Image().
    const dims = await loadImageDimensions(url);
    return {
      url,
      durationFrames: DEFAULT_FPS,
      fps: DEFAULT_FPS,
      width: dims.width,
      height: dims.height,
      kind,
    };
  }

  // video or audio — use a media element.
  const meta = await loadMediaMetadata(url, kind);
  return {
    url,
    durationFrames: Math.max(1, Math.round(meta.duration * DEFAULT_FPS)),
    fps: DEFAULT_FPS,
    width: kind === "video" ? meta.width : null,
    height: kind === "video" ? meta.height : null,
    kind,
  };
}

/** Build the MediaSource record the Timeline references by id. */
export function probeResultToSource(
  id: string,
  result: ProbeResult,
  filename: string,
): MediaSource {
  return {
    id,
    kind: result.kind,
    url: result.url,
    proxyUrl: null,
    durationFrames: result.durationFrames,
    fps: result.fps,
    width: result.width,
    height: result.height,
    filename,
    uploadedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Internal probes — kept local because the only thing the rest of the app
// should know is `probeSource()`.
// ---------------------------------------------------------------------------

function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = url;
  });
}

function loadMediaMetadata(
  url: string,
  kind: "video" | "audio",
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const el =
      kind === "video"
        ? document.createElement("video")
        : (document.createElement("audio") as HTMLMediaElement);
    el.preload = "metadata";
    const cleanup = () => {
      el.removeAttribute("src");
      el.load();
    };
    el.onloadedmetadata = () => {
      const isVideo = kind === "video";
      const w = isVideo ? (el as HTMLVideoElement).videoWidth : 0;
      const h = isVideo ? (el as HTMLVideoElement).videoHeight : 0;
      const duration = isFinite(el.duration) ? el.duration : 0;
      cleanup();
      resolve({ duration, width: w, height: h });
    };
    el.onerror = () => {
      cleanup();
      reject(new Error("Media failed to load"));
    };
    el.src = url;
  });
}
