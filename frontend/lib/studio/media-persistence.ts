/**
 * In-browser media → a durable URL, or a failure the UI must handle (#563).
 *
 * The one rule: a `blob:` URL never reaches saved studio state. A blob URL
 * dies with the tab, so a project saved with one loses that media after a
 * reload or on another device. Every producer of client-side media (recorded
 * clips, composed music, dubbed tracks, in-browser AI images) uploads first
 * through this module; a failed upload comes back as a result the surface
 * turns into Retry / Download / Discard (`UnsavedMediaAlert`), never as a
 * blob URL dropped onto the canvas. `stripTabScopedUrls` is the save path's
 * last line of defence for anything that slips through.
 */
import i18next from "i18next";
import { studioService } from "@/lib/services/studio-service";

/** URLs that only live in this tab or bloat the row — never a hosted asset. */
export function isEphemeralMediaUrl(url: string): boolean {
  return /^(blob|data):/i.test(url.trim());
}

/** `blob:` URLs only — gone after a reload. `data:` URLs are self-contained
 *  and some runtimes persist them on purpose (procedural sprites, brush
 *  layers), so the save guard leaves those alone. */
export function isTabScopedUrl(url: string): boolean {
  return /^blob:/i.test(url.trim());
}

export type PersistMediaResult =
  | { ok: true; url: string }
  | { ok: false; reason: "no_url" | "error"; message?: string };

/** Run an upload and accept its URL only when it's durable. */
export async function persistMediaBlob(
  upload: () => Promise<{ url: string | null | undefined }>,
): Promise<PersistMediaResult> {
  try {
    const { url } = await upload();
    if (!url || isEphemeralMediaUrl(url)) return { ok: false, reason: "no_url" };
    return { ok: true, url };
  } catch (err) {
    return { ok: false, reason: "error", message: err instanceof Error ? err.message : undefined };
  }
}

export type SceneAudioUploader = (file: File) => Promise<{ data: { url: string } }>;

/** The upload file for a rendered audio blob (WAV unless the blob says otherwise). */
export function audioFileFromBlob(blob: Blob, label: string): File {
  const type = blob.type || "audio/wav";
  const ext = type.includes("mpeg") ? "mp3" : type.includes("webm") ? "webm" : "wav";
  const base = label.trim().replace(/[\\/:*?"<>|]+/g, "-") || "audio";
  return new File([blob], `${base}.${ext}`, { type });
}

/** Host a rendered audio blob (composed music, dubbed track). */
export function persistAudioBlob(
  blob: Blob,
  label: string,
  upload: SceneAudioUploader = (file) => studioService.uploadSceneAudio(file),
): Promise<PersistMediaResult> {
  return persistMediaBlob(async () => (await upload(audioFileFromBlob(blob, label))).data);
}

export type SceneImageUploader = (file: File) => Promise<{ data: { url: string } }>;

/**
 * The durable URL for an AI-generated image. Server engines already return
 * a hosted `resultUrl`; in-browser engines (WebGPU) only have the blob, so it
 * is uploaded here. Throws a localized error when the image can't be kept —
 * the prompt hook shows it and nothing is placed.
 */
export async function persistGeneratedImage(
  result: { blob: Blob; resultUrl?: string },
  upload: SceneImageUploader = (file) => studioService.uploadSceneImage(file),
): Promise<string> {
  if (result.resultUrl && !isEphemeralMediaUrl(result.resultUrl)) return result.resultUrl;
  const type = result.blob.type || "image/png";
  const ext = type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : "png";
  const outcome = await persistMediaBlob(async () =>
    (await upload(new File([result.blob], `ai-image-${Date.now()}.${ext}`, { type }))).data,
  );
  if (!outcome.ok) throw new Error(i18next.t("studio.unsavedMedia.imageNotSaved"));
  return outcome.url;
}

/** Save the blob through the browser's download prompt. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Give the browser a tick to start the download before releasing it.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/**
 * Defence in depth for the save path: a copy of `value` with every `blob:`
 * string replaced by "" (a missing source, which every runtime already
 * treats as "nothing to load"), so a tab-scoped URL never reaches the saved
 * row. Untouched subtrees keep their identity; returns `value` itself when
 * nothing was stripped.
 */
export function stripTabScopedUrls<T>(value: T): T {
  return strip(value) as T;
}

function strip(value: unknown): unknown {
  if (typeof value === "string") return isTabScopedUrl(value) ? "" : value;
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const out = strip(item);
      if (out !== item) changed = true;
      return out;
    });
    return changed ? next : value;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const out = strip(item);
      if (out !== item) changed = true;
      next[key] = out;
    }
    return changed ? next : value;
  }
  return value;
}
