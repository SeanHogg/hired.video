/**
 * useVoiceTake — record one take from the microphone (or take an audio
 * file), upload it through the app's audio upload, and hand back a hosted
 * clip `{ url, durationSeconds }` for the video plan. Uploading needs a
 * session: a signed-out visitor is asked for the silent guest session first
 * (the same guest-first gate as the post dock).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { studioService } from "@/lib/services/studio-service";

export interface VoiceClip {
  url: string;
  durationSeconds: number;
}

export type TakeState = "idle" | "recording" | "uploading" | "error";

/** Seconds of a hosted or local audio file (0 when it can't be read). */
export function audioDuration(src: string): Promise<number> {
  return new Promise((resolve) => {
    const el = new Audio();
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 0);
    el.onerror = () => resolve(0);
    el.src = src;
  });
}

async function uploadClip(file: File): Promise<VoiceClip> {
  const local = URL.createObjectURL(file);
  try {
    const durationSeconds = await audioDuration(local);
    const { data } = await studioService.uploadSceneAudio(file);
    return { url: data.url, durationSeconds };
  } finally {
    URL.revokeObjectURL(local);
  }
}

export function useVoiceTake() {
  const [state, setState] = useState<TakeState>("idle");
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const resolveTake = useRef<((clip: VoiceClip | null) => void) | null>(null);

  const stopTimer = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => () => {
    stopTimer();
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  /** Start recording; resolves with the uploaded take once `stop()` is called. */
  const start = useCallback(async (): Promise<VoiceClip | null> => {
    if (state === "recording") return null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      const done = new Promise<VoiceClip | null>((resolve) => (resolveTake.current = resolve));
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        stopTimer();
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        setState("uploading");
        try {
          const clip = await uploadClip(new File([blob], `voice-take-${Date.now()}.webm`, { type: blob.type }));
          setState("idle");
          resolveTake.current?.(clip);
        } catch {
          setState("error");
          resolveTake.current?.(null);
        }
      };
      recorder.current = rec;
      rec.start();
      setSeconds(0);
      setState("recording");
      timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
      return done;
    } catch {
      setState("error");
      return null;
    }
  }, [state]);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  /** Upload a picked audio file as the take. */
  const upload = useCallback(async (file: File): Promise<VoiceClip | null> => {
    setState("uploading");
    try {
      const clip = await uploadClip(file);
      setState("idle");
      return clip;
    } catch {
      setState("error");
      return null;
    }
  }, []);

  return { state, seconds, start, stop, upload };
}
