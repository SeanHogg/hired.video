/**
 * Screenshot capture — the single Control for the Screenshot palette
 * tile. Opens the browser's display-media picker, grabs one frame from
 * the returned stream, uploads it via the existing R2 image pipeline
 * (`uploadImage`), and returns a persistent URL ready to stamp into
 * an Image widget.
 *
 * Per the DRY rule: this hook is the ONE place that fires
 * `getDisplayMedia` + frame snapshot. Both the palette tile's click
 * handler and the canvas's drop handler call it; neither owns capture
 * logic of its own.
 */
import { useCallback } from "react";
import { uploadImage } from "@/lib/services/upload-service";

const IS_SUPPORTED =
  typeof navigator !== "undefined" &&
  typeof navigator.mediaDevices?.getDisplayMedia === "function";

export interface UseScreenshotCaptureResult {
  /** Open the picker, snapshot one frame, upload, and resolve to the
   *  persistent URL. Returns null when the user cancels the picker,
   *  the browser can't capture, or the upload fails — callers should
   *  treat null as "do nothing" (no toast, no widget). */
  capture: () => Promise<string | null>;
  /** Whether this browser supports display-media capture at all.
   *  Surfaces to the palette tile so unsupported browsers don't show
   *  a tile that does nothing on click. */
  isSupported: boolean;
}

export function useScreenshotCapture(): UseScreenshotCaptureResult {
  const capture = useCallback(async (): Promise<string | null> => {
    if (!IS_SUPPORTED) return null;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
    } catch {
      // User cancelled the picker or denied permission — silent.
      return null;
    }
    try {
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      // Two RAF ticks: one tick is sometimes empty in Chrome before
      // the captured frame lands in the video element; two ticks is
      // reliable across Chrome/Edge/Firefox.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve()),
        ),
      );
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return null;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) return null;
      const file = new File(
        [blob],
        `screenshot-${Date.now()}.png`,
        { type: "image/png" },
      );
      return await uploadImage(file);
    } catch {
      return null;
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
    }
  }, []);

  return { capture, isSupported: IS_SUPPORTED };
}
