import type { TFunction } from "i18next";
import {
  RECORDING_MODES,
  type RecordingMode,
} from "@/lib/studio/recording-modes";

export function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** RECORDING_MODES row for a mode (falls back to the first record). */
export function recordingModeMeta(mode: RecordingMode) {
  return RECORDING_MODES.find((m) => m.id === mode) ?? RECORDING_MODES[0];
}

/**
 * Maps a media-acquisition exception to user-facing copy that matches
 * the current recording mode. Pure / framework-free so the unit
 * tests can pin every mode × DOMException combination without
 * mounting the component. The mode-varying nouns ("Camera access" vs
 * "Screen share") and verbs ("Start Camera" vs "Share Screen") come
 * from RECORDING_MODES so adding a fourth mode is one record, not a
 * hunt through string literals. Copy is resolved through the caller's
 * `t` so the helper stays framework-free (no React / i18n import).
 */
export function mapMediaAcquisitionError(
  err: unknown,
  mode: RecordingMode,
  t: TFunction,
): string {
  const meta = recordingModeMeta(mode);

  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        return t("webcamRecorder.error.permissionDenied");
      case "NotFoundError":
        return t("webcamRecorder.error.noDevice");
      case "NotReadableError":
      case "TrackStartError":
        return t("webcamRecorder.error.deviceBusy");
      case "OverconstrainedError":
        return t("webcamRecorder.error.overconstrained");
      case "AbortError":
        return t("webcamRecorder.error.cancelled", {
          accessNoun: t(meta.accessNounKey),
          startVerb: t(meta.startVerbKey),
        });
      default:
        return t("webcamRecorder.error.accessFailed", {
          message: err.message || err.name,
        });
    }
  }
  return t("webcamRecorder.error.accessFailed", {
    message: err instanceof Error ? err.message : String(err),
  });
}

// Preferred MIME types in priority order
export function getSupportedMimeType(): string {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const type of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "video/webm";
}

/** Plays a <video> element, swallowing autoplay rejections. */
export function attachStream(el: HTMLVideoElement, stream: MediaStream): void {
  el.srcObject = stream;
  el.play().catch(() => {});
}
