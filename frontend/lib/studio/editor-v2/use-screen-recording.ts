/**
 * #822 — Browser screen-recording hook for the V2 timeline. Mirrors
 * `useScreenshotCapture` but pipes the `getDisplayMedia` stream
 * through `MediaRecorder`, then uploads the captured blob via
 * `uploadVideo` so it lands as a Video widget on the canvas.
 *
 * Self-gates: returns `isSupported: false` on browsers without
 * `MediaRecorder` or `getDisplayMedia` so the parent palette tile can
 * hide itself without a prop-drilled `canRecord` boolean.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadVideo } from "@/lib/services/upload-service";

export interface ScreenRecordingState {
  isSupported: boolean;
  isRecording: boolean;
  durationMs: number;
  error: string | null;
}

export interface UseScreenRecording extends ScreenRecordingState {
  start: () => Promise<void>;
  stop: () => Promise<{ url: string; durationMs: number } | null>;
}

const SUPPORTED =
  typeof window !== "undefined" &&
  typeof navigator !== "undefined" &&
  !!(navigator as any).mediaDevices?.getDisplayMedia &&
  typeof (window as any).MediaRecorder === "function";

export function useScreenRecording(): UseScreenRecording {
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    if (tickRef.current !== null) {
      cancelAnimationFrame(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    if (!SUPPORTED) {
      setError("Screen recording not supported in this browser");
      return;
    }
    setError(null);
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
      streamRef.current = stream;
      chunksRef.current = [];
      // Pick the best supported MIME — Chromium ships VP9/Opus in WebM,
      // Safari ships H.264 in MP4. We accept either; the upload route
      // tolerates both.
      const mime =
        ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find(
          (m) => (window as any).MediaRecorder.isTypeSupported?.(m),
        ) ?? "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = performance.now();
      setIsRecording(true);
      const tick = () => {
        if (!startedAtRef.current) return;
        setDurationMs(performance.now() - startedAtRef.current);
        tickRef.current = requestAnimationFrame(tick);
      };
      tickRef.current = requestAnimationFrame(tick);

      // The user can also stop a screen-share via the browser's own
      // "Stop sharing" UI; clean up when the track ends.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screen capture failed");
    }
  }, []);

  const stop = useCallback(async (): Promise<{ url: string; durationMs: number } | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;
    if (recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    const finalDuration = performance.now() - startedAtRef.current;
    setIsRecording(false);
    setDurationMs(finalDuration);
    if (tickRef.current !== null) {
      cancelAnimationFrame(tickRef.current);
      tickRef.current = null;
    }
    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
    cleanup();
    try {
      const { url } = await uploadVideo(
        new File([blob], `screen-${Date.now()}.${blob.type.includes("mp4") ? "mp4" : "webm"}`, {
          type: blob.type,
        }),
      );
      return { url, durationMs: finalDuration };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      return null;
    }
  }, [cleanup]);

  return {
    isSupported: SUPPORTED,
    isRecording,
    durationMs,
    error,
    start,
    stop,
  };
}
