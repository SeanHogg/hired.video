"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  applyBackgroundReplacement,
  type BackgroundReplacement,
} from "@/lib/studio/webcam/background-removal";
import { acquireSharedAudioContext } from "@/lib/audio/live-audio-context";
import {
  Camera,
  Video,
  StopCircle,
  RotateCcw,
  Monitor,
  Mic,
  MicOff,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  RECORDING_MODES,
  type RecordingMode,
} from "@/lib/studio/recording-modes";
import { RecordingModeButtons } from "@/components/studio/RecordingModeButtons";
import { WebcamBackgroundControls } from "@/components/studio/WebcamBackgroundControls";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebcamRecorderProps {
  /**
   * Hands the produced clip blob to the host. The recorder deliberately
   * has no trim / split / delete affordances (#1499): timing-model
   * operations belong on the timeline. The host turns the blob into a
   * video widget (V2) or scene (V1 NLE) where the existing edge-drag
   * trim handles and split/delete shortcuts already act on it.
   */
  onRecordingComplete: (blob: Blob, durationMs: number) => void;
  teleprompterText?: string;
  mode?: RecordingMode;
  maxDurationSec?: number;
  /** When true, calls startPreview() once on mount (after permissions
   *  prompt). Used by the Tool Promo template + extension capture
   *  handoff so users land already in the camera/screen prompt without
   *  hunting for a "Start Camera" button. Mode changes after mount
   *  still require remount via `key` — auto-start does NOT make mode
   *  reactive. */
  autoStart?: boolean;
  /** When supplied, the header shows the shared RecordingModeButtons
   *  chips so the user can swap source mid-session. Shown only while
   *  idle / previewing — hidden during an active recording and while a
   *  finished take awaits Use / Discard. The host owns `mode`, so it
   *  must remount this recorder (`key={mode}`) on change; the unmount
   *  cleanup releases every stream of the old source. */
  onModeChange?: (mode: RecordingMode) => void;
}

type RecordingState = "idle" | "previewing" | "recording" | "recorded";

type Resolution = "720p" | "1080p";

const RESOLUTION_CONSTRAINTS: Record<
  Resolution,
  { width: number; height: number }
> = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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
  const meta =
    RECORDING_MODES.find((m) => m.id === mode) ?? RECORDING_MODES[0];

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
function getSupportedMimeType(): string {
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WebcamRecorder({
  onRecordingComplete,
  teleprompterText,
  mode = "webcam",
  maxDurationSec,
  autoStart = false,
  onModeChange,
}: WebcamRecorderProps) {
  const { t } = useTranslation();
  // ---- State ----
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isMuted, setIsMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);

  // ---- Refs ----
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const videoPlaybackRef = useRef<HTMLVideoElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);

  const webcamStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const compositeStreamRef = useRef<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioCtxReleaseRef = useRef<(() => void) | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioAnimFrameRef = useRef<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasAnimFrameRef = useRef<number | null>(null);
  // #127 — Background-replacement state. Stored in a ref so the RAF
  // draw loop sees updates without re-running the effect that owns
  // the composite stream.
  const [bgReplacement, setBgReplacement] = useState<BackgroundReplacement>({ kind: "none" });
  const bgReplacementRef = useRef<BackgroundReplacement>(bgReplacement);
  bgReplacementRef.current = bgReplacement;

  // Mirror of isMuted readable from non-reactive callbacks (acquire*).
  // Lets newly-acquired streams come up already-muted when the user
  // pre-mutes before clicking Start.
  const isMutedRef = useRef(false);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Mirror of recordingState readable from the screen-track 'ended'
  // listener, which is attached at acquire-time and outlives every
  // state transition. Reading the React state directly captured the
  // value at *attach* time (always "idle" since acquisition happens
  // before the transition to "previewing") — so the recording
  // auto-stop never fired, and we had no way to react when the user
  // hit the browser's native "Stop sharing" tray during preview.
  const recordingStateRef = useRef<RecordingState>("idle");
  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  // ---- Derived ----
  const isScreenMode = mode === "screen" || mode === "screen+webcam";
  const isPipMode = mode === "screen+webcam";

  // ---- Cleanup helpers ----
  const stopAudioAnalysis = useCallback(() => {
    if (audioAnimFrameRef.current !== null) {
      cancelAnimationFrame(audioAnimFrameRef.current);
      audioAnimFrameRef.current = null;
    }
    if (audioContextRef.current) {
      // Release our hold on the shared live context (the analyser tap never
      // connects to the destination, so this is silent) rather than closing
      // it directly.
      audioCtxReleaseRef.current?.();
      audioCtxReleaseRef.current = null;
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const stopCanvasComposite = useCallback(() => {
    if (canvasAnimFrameRef.current !== null) {
      cancelAnimationFrame(canvasAnimFrameRef.current);
      canvasAnimFrameRef.current = null;
    }
  }, []);

  const stopAllStreams = useCallback(() => {
    [webcamStreamRef, screenStreamRef, compositeStreamRef].forEach((ref) => {
      ref.current?.getTracks().forEach((t) => t.stop());
      ref.current = null;
    });
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanupAll = useCallback(() => {
    stopTimer();
    stopAudioAnalysis();
    stopCanvasComposite();
    stopAllStreams();
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
  }, [stopTimer, stopAudioAnalysis, stopCanvasComposite, stopAllStreams, recordedUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      stopAudioAnalysis();
      stopCanvasComposite();
      stopAllStreams();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Audio level meter ----
  const startAudioAnalysis = useCallback(
    (stream: MediaStream) => {
      stopAudioAnalysis();

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;

      try {
        const { ctx, release } = acquireSharedAudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        audioContextRef.current = ctx;
        audioCtxReleaseRef.current = release;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((a, b) => a + b, 0);
          const avg = sum / dataArray.length;
          setAudioLevel(Math.min(avg / 128, 1)); // normalise 0-1
          audioAnimFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // AudioContext may not be available in all environments
      }
    },
    [stopAudioAnalysis],
  );

  // Disable / re-enable every audio track across whichever streams
  // currently exist. Used by toggleMute and immediately after stream
  // acquisition so pre-mute is honored. Setting `enabled = false`
  // makes MediaRecorder encode silent frames — the recorded file
  // still has an audio track, just silent, which is what the mute
  // toggle promises.
  const applyMuteToAllStreams = useCallback((muted: boolean) => {
    [webcamStreamRef, screenStreamRef, compositeStreamRef].forEach((ref) => {
      ref.current?.getAudioTracks().forEach((t) => {
        t.enabled = !muted;
      });
    });
  }, []);

  // ---- Camera acquisition ----
  const acquireWebcam = useCallback(
    async (res: Resolution, facing: "user" | "environment") => {
      const { width, height } = RESOLUTION_CONSTRAINTS[res];
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: true,
      });
      if (isMutedRef.current) {
        stream.getAudioTracks().forEach((t) => { t.enabled = false; });
      }
      webcamStreamRef.current = stream;
      return stream;
    },
    [],
  );

  // Mic-only acquisition for screen-only mode — we want voice
  // narration but no camera, so don't ask for video and don't
  // surface a confusing camera prompt to users who only picked
  // "Screen".
  const acquireMicOnly = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    if (isMutedRef.current) {
      stream.getAudioTracks().forEach((t) => { t.enabled = false; });
    }
    webcamStreamRef.current = stream;
    return stream;
  }, []);

  const acquireScreen = useCallback(async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    if (isMutedRef.current) {
      stream.getAudioTracks().forEach((t) => { t.enabled = false; });
    }
    screenStreamRef.current = stream;

    // User clicked the browser's native "Stop sharing" tray. We have
    // to react in BOTH preview and recording states — read the live
    // state from the ref, since closure-captured `recordingState` is
    // always "idle" at attach time (acquisition runs before the
    // setRecordingState("previewing") call in startPreview).
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      const live = recordingStateRef.current;
      if (
        live === "recording" &&
        mediaRecorderRef.current?.state === "recording"
      ) {
        mediaRecorderRef.current.stop();
        return;
      }
      if (live === "previewing") {
        // Preview is now a dead frame — release everything (the
        // mic / webcam streams paired with the screen capture are
        // useless without it) and surface a notice so the user
        // knows why they're back at idle and how to re-arm.
        stopAudioAnalysis();
        stopCanvasComposite();
        stopAllStreams();
        setRecordingState("idle");
        setError(
          t("webcamRecorder.screenSharingEnded", {
            startVerb: t("webcamRecorder.shareScreen"),
          }),
        );
      }
    });

    return stream;
  }, [t, stopAudioAnalysis, stopCanvasComposite, stopAllStreams]);

  // ---- Composite canvas for screen+webcam PiP ----
  const startCanvasComposite = useCallback(
    (screenStream: MediaStream, webcamStream: MediaStream): MediaStream => {
      const canvas = document.createElement("canvas");
      canvasRef.current = canvas;

      const screenTrack = screenStream.getVideoTracks()[0];
      const settings = screenTrack.getSettings();
      canvas.width = settings.width || 1920;
      canvas.height = settings.height || 1080;

      const ctx = canvas.getContext("2d")!;

      const screenVideo = document.createElement("video");
      screenVideo.srcObject = screenStream;
      screenVideo.muted = true;
      screenVideo.play();

      const camVideo = document.createElement("video");
      camVideo.srcObject = webcamStream;
      camVideo.muted = true;
      camVideo.play();

      // The visible PiP overlay (pipVideoRef) is attached by the
      // `recordingState`-keyed effect below — at this point the
      // <video> element isn't mounted yet because state is still
      // "idle".

      const pipW = Math.round(canvas.width * 0.25);
      const pipH = Math.round(canvas.height * 0.25);
      const margin = 16;

      // #127 — Person-segment + background-replacement composition.
      // When `bgReplacement` is set on the parent ref, the PiP webcam
      // frame routes through `applyBackgroundReplacement` instead of
      // a raw drawImage. Both code paths run inside the same RAF loop
      // so the composite stream keeps a single tick.
      const draw = async () => {
        ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
        const replacement = bgReplacementRef.current;
        const camX = canvas.width - pipW - margin;
        const camY = canvas.height - pipH - margin;
        if (replacement && replacement.kind !== "none") {
          // Offscreen canvas for the masked PiP so the rest of the
          // composite stays linear.
          const pipCanvas = document.createElement("canvas");
          pipCanvas.width = pipW;
          pipCanvas.height = pipH;
          const pipCtx = pipCanvas.getContext("2d");
          if (pipCtx) {
            await applyBackgroundReplacement({
              ctx: pipCtx,
              source: camVideo,
              width: pipW,
              height: pipH,
              mode: replacement,
            });
            ctx.drawImage(pipCanvas, camX, camY);
          } else {
            ctx.drawImage(camVideo, camX, camY, pipW, pipH);
          }
        } else {
          ctx.drawImage(camVideo, camX, camY, pipW, pipH);
        }
        canvasAnimFrameRef.current = requestAnimationFrame(() => { void draw(); });
      };
      void draw();

      const canvasStream = canvas.captureStream(30);

      // Merge audio from both streams
      const audioTracks = [
        ...screenStream.getAudioTracks(),
        ...webcamStream.getAudioTracks(),
      ];
      audioTracks.forEach((t) => canvasStream.addTrack(t));

      compositeStreamRef.current = canvasStream;
      return canvasStream;
    },
    [],
  );

  // ---- Webcam-only background composite (#127 follow-up) ----
  // The PiP path (startCanvasComposite) was the ONLY place background
  // replacement was actually applied, so blur/colour silently did
  // nothing in plain `webcam` mode (e.g. Video Pitch Lab). This routes
  // the raw webcam frames through the same applyBackgroundReplacement
  // compositor and captures the canvas as the stream used for BOTH the
  // live preview and recording, so the chosen background shows on screen
  // and is baked into the clip. The draw loop reads bgReplacementRef each
  // frame, so switching blur↔colour needs no rebuild.
  const startWebcamComposite = useCallback(
    (webcamStream: MediaStream): MediaStream => {
      const canvas = document.createElement("canvas");
      canvasRef.current = canvas;

      const track = webcamStream.getVideoTracks()[0];
      const settings = track?.getSettings() ?? {};
      canvas.width = settings.width || 1280;
      canvas.height = settings.height || 720;

      const ctx = canvas.getContext("2d")!;

      const camVideo = document.createElement("video");
      camVideo.srcObject = webcamStream;
      camVideo.muted = true;
      camVideo.play();

      const draw = async () => {
        await applyBackgroundReplacement({
          ctx,
          source: camVideo,
          width: canvas.width,
          height: canvas.height,
          mode: bgReplacementRef.current,
        });
        canvasAnimFrameRef.current = requestAnimationFrame(() => {
          void draw();
        });
      };
      void draw();

      const canvasStream = canvas.captureStream(30);
      // Audio tracks are SHARED (addTrack copies the reference, it does
      // not move the track), so the raw webcam stream keeps its mic —
      // teardownCompositeKeepCam relies on that and must not stop these.
      webcamStream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));

      compositeStreamRef.current = canvasStream;
      return canvasStream;
    },
    [],
  );

  // Tear down a webcam composite while preserving the raw webcam stream.
  // Only the canvas-captured VIDEO track is ours to stop; the audio
  // tracks belong to webcamStreamRef and were merely shared in.
  const teardownCompositeKeepCam = useCallback(() => {
    stopCanvasComposite();
    compositeStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
    compositeStreamRef.current = null;
  }, [stopCanvasComposite]);

  // Attach a (re)acquired webcam stream to the live preview, rebuilding
  // the background composite when an effect is active so resolution /
  // camera flips keep the chosen background instead of dropping to raw.
  const attachWebcamToPreview = useCallback(
    (stream: MediaStream) => {
      const el = videoPreviewRef.current;
      if (bgReplacementRef.current.kind !== "none") {
        teardownCompositeKeepCam();
        const composite = startWebcamComposite(stream);
        if (el) {
          el.srcObject = composite;
          el.play().catch(() => {});
        }
      } else if (el) {
        el.srcObject = stream;
        el.play().catch(() => {});
      }
    },
    [teardownCompositeKeepCam, startWebcamComposite],
  );

  // ---- Start preview ----
  const startPreview = useCallback(async () => {
    setError(null);
    try {
      let previewStream: MediaStream;

      if (isScreenMode) {
        if (isPipMode) {
          // PiP — acquire the WEBCAM first so a busy/missing camera
          // fails before the user picks a screen. Picking a screen
          // only to discover the camera is in use by another tab/app
          // is a frustrating dead end. Webcam permission is remembered
          // per-origin in Chrome, so this isn't a "wasted" prompt on
          // success.
          const webcamStream = await acquireWebcam(resolution, facingMode);
          const screenStream = await acquireScreen();
          previewStream = startCanvasComposite(screenStream, webcamStream);
        } else {
          // Screen-only — mic for narration only, no camera prompt.
          const screenStream = await acquireScreen();
          const micStream = await acquireMicOnly();
          const combined = new MediaStream([
            ...screenStream.getVideoTracks(),
            ...micStream.getAudioTracks(),
          ]);
          compositeStreamRef.current = combined;
          previewStream = combined;
        }
      } else {
        previewStream = await acquireWebcam(resolution, facingMode);
      }

      // Attaching to videoPreviewRef happens in the
      // `recordingState`-keyed effect below — the <video> element
      // isn't mounted until state flips to "previewing", so setting
      // srcObject here would no-op on the first run.

      startAudioAnalysis(previewStream);
      setRecordingState("previewing");
    } catch (err) {
      setError(mapMediaAcquisitionError(err, mode, t));
      // Drop any half-acquired streams so a retry from idle starts
      // clean rather than sitting on a half-set composite ref.
      stopAllStreams();
    }
  }, [
    mode,
    t,
    isScreenMode,
    isPipMode,
    resolution,
    facingMode,
    acquireWebcam,
    acquireMicOnly,
    acquireScreen,
    startCanvasComposite,
    startAudioAnalysis,
    stopAllStreams,
  ]);

  // Attach the active streams to their <video> elements once they
  // exist in the DOM. Runs every time recordingState transitions
  // into a viewing state — guarantees the preview shows even though
  // the elements weren't mounted at startPreview() time.
  useEffect(() => {
    if (recordingState !== "previewing" && recordingState !== "recording") {
      return;
    }
    const main = compositeStreamRef.current ?? webcamStreamRef.current;
    const previewEl = videoPreviewRef.current;
    if (previewEl && main && previewEl.srcObject !== main) {
      previewEl.srcObject = main;
      previewEl.play().catch(() => {});
    }
    if (isPipMode) {
      const pipEl = pipVideoRef.current;
      const cam = webcamStreamRef.current;
      if (pipEl && cam && pipEl.srcObject !== cam) {
        pipEl.srcObject = cam;
        pipEl.play().catch(() => {});
      }
    }
  }, [recordingState, isPipMode]);

  // Webcam-only background replacement (#127). PiP composites already;
  // plain webcam mode has no canvas, so build one the moment a background
  // is picked during preview and tear it down when it's cleared. Blur↔
  // colour switches need no rebuild — the draw loop reads bgReplacementRef
  // each frame. Screen-only mode has no camera to segment, so it's skipped
  // here AND the picker is hidden from its settings panel.
  useEffect(() => {
    if (mode !== "webcam" || recordingState !== "previewing") return;
    const rawCam = webcamStreamRef.current;
    if (!rawCam) return;
    const wantsComposite = bgReplacement.kind !== "none";
    const hasComposite = !!compositeStreamRef.current;
    if (wantsComposite && !hasComposite) {
      const composite = startWebcamComposite(rawCam);
      const el = videoPreviewRef.current;
      if (el) {
        el.srcObject = composite;
        el.play().catch(() => {});
      }
    } else if (!wantsComposite && hasComposite) {
      teardownCompositeKeepCam();
      const el = videoPreviewRef.current;
      if (el) {
        el.srcObject = rawCam;
        el.play().catch(() => {});
      }
    }
  }, [
    mode,
    recordingState,
    bgReplacement.kind,
    startWebcamComposite,
    teardownCompositeKeepCam,
  ]);

  // Auto-arm on mount when caller asks (Tool Promo template,
  // extension `?capture=screen` handoff). Fires once — guarded by the
  // empty-dep array deliberately. Mode changes after mount still need
  // a remount via `key`.
  useEffect(() => {
    if (autoStart && recordingState === "idle") {
      startPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Recording ----
  const startRecording = useCallback(() => {
    const stream =
      compositeStreamRef.current ?? webcamStreamRef.current;
    if (!stream) return;

    chunksRef.current = [];
    const mimeType = getSupportedMimeType();

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      stopTimer();
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const durationMs = Date.now() - startTimeRef.current;

      setRecordedBlob(blob);
      setRecordedUrl(url);
      setRecordingState("recorded");

      // Stop streams after recording finishes
      stopCanvasComposite();
      stopAllStreams();
      stopAudioAnalysis();

      if (videoPlaybackRef.current) {
        videoPlaybackRef.current.src = url;
      }

      onRecordingComplete(blob, durationMs);
    };

    recorder.start(1000); // collect data every second
    startTimeRef.current = Date.now();
    setElapsedSec(0);
    setRecordingState("recording");

    // Timer
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSec(elapsed);

      if (maxDurationSec && elapsed >= maxDurationSec) {
        recorder.stop();
      }
    }, 1000);
  }, [
    maxDurationSec,
    onRecordingComplete,
    stopTimer,
    stopCanvasComposite,
    stopAllStreams,
    stopAudioAnalysis,
  ]);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Release the preview without recording — backs the explicit
  // "Stop sharing" / "Cancel" button in preview state. Without it
  // the only way to escape a screen-share preview was via the
  // browser's native tray (which left a stale frame on-screen) or
  // by unmounting the panel entirely.
  const stopSharing = useCallback(() => {
    stopAudioAnalysis();
    stopCanvasComposite();
    stopAllStreams();
    setError(null);
    setRecordingState("idle");
  }, [stopAudioAnalysis, stopCanvasComposite, stopAllStreams]);

  const retake = useCallback(() => {
    stopTimer();
    stopAudioAnalysis();
    stopCanvasComposite();
    stopAllStreams();

    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }

    setRecordedBlob(null);
    setRecordedUrl(null);
    setElapsedSec(0);
    setRecordingState("idle");
  }, [
    recordedUrl,
    stopTimer,
    stopAudioAnalysis,
    stopCanvasComposite,
    stopAllStreams,
  ]);

  // ---- Camera toggle ----
  const toggleCamera = useCallback(async () => {
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);

    if (recordingState === "previewing") {
      // Re-acquire webcam with new facing
      webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        const stream = await acquireWebcam(resolution, next);
        attachWebcamToPreview(stream);
        startAudioAnalysis(stream);
      } catch {
        setError(t("webcamRecorder.switchCameraFailed"));
      }
    }
  }, [
    t,
    facingMode,
    recordingState,
    resolution,
    acquireWebcam,
    attachWebcamToPreview,
    startAudioAnalysis,
  ]);

  // ---- Mute toggle ----
  // Mutes/unmutes audio across every active stream — webcam mic,
  // screen system audio, and the composite stream's merged tracks.
  // Why: previously this only touched webcamStreamRef, so in
  // screen+webcam pip mode the system audio captured by
  // getDisplayMedia kept recording even with the mic icon "off".
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      applyMuteToAllStreams(next);
      return next;
    });
  }, [applyMuteToAllStreams]);

  // ---- Resolution change (only in idle/previewing) ----
  // Resolution governs webcam capture only. Screen-only mode has no camera,
  // so re-acquiring one would drop the mic stream and fire a camera prompt
  // (#2237); the control is hidden there and this guards any other caller.
  const hasCamera = mode !== "screen";
  const changeResolution = useCallback(
    async (res: Resolution) => {
      if (!hasCamera) return;
      setResolution(res);
      if (recordingState === "previewing") {
        webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
        try {
          const stream = await acquireWebcam(res, facingMode);
          if (isScreenMode) {
            // Screen / PiP modes drive the main preview from the screen
            // composite — the webcam-only background compositor must not
            // touch it. Preserve the prior direct-attach behavior here.
            if (videoPreviewRef.current) {
              videoPreviewRef.current.srcObject = stream;
              videoPreviewRef.current.play().catch(() => {});
            }
          } else {
            attachWebcamToPreview(stream);
          }
          startAudioAnalysis(stream);
        } catch {
          setError(t("webcamRecorder.resolutionChangeFailed"));
        }
      }
    },
    [hasCamera, t, recordingState, isScreenMode, facingMode, acquireWebcam, attachWebcamToPreview, startAudioAnalysis],
  );

  // ---- Max duration remaining ----
  const remainingSec = useMemo(() => {
    if (!maxDurationSec) return null;
    return Math.max(0, maxDurationSec - elapsedSec);
  }, [maxDurationSec, elapsedSec]);

  // ---- Mode metadata ----
  // Single lookup against RECORDING_MODES so every mode-specific
  // label / hint / button verb stays co-located with the rest of the
  // mode table. Adding a fourth mode means editing one record, not
  // hunting ternaries across the render tree.
  const modeMeta = useMemo(
    () => RECORDING_MODES.find((m) => m.id === mode) ?? RECORDING_MODES[0],
    [mode],
  );
  // Header icon — Monitor for any screen-bearing mode, Camera for
  // webcam. Keeps the header tight; the separate iconName field on
  // RECORDING_MODES drives the chip-picker icon (Video / Monitor /
  // MonitorPlay) which is intentionally finer-grained.
  const ModeHeaderIcon = isScreenMode ? Monitor : Camera;

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="relative flex flex-col gap-4 rounded-lg border bg-card p-4">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ModeHeaderIcon className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium">{t(modeMeta.panelTitleKey)}</span>
          <Badge variant="secondary">{resolution}</Badge>
          {/* Sharing-screen indicator — without this the only sign
              that the screen capture was live was the browser's own
              tray, which is easy to miss on a multi-monitor setup.
              Visible in BOTH preview and recording so users see the
              share is hot even before they hit Record. */}
          {isScreenMode &&
            (recordingState === "previewing" || recordingState === "recording") && (
              <Badge className="gap-1.5 bg-red-500/90 text-white hover:bg-red-500/90">
                <span className="h-2 w-2 animate-pulse rounded-full bg-card" />
                {t("webcamRecorder.sharingScreen")}
              </Badge>
            )}
          {recordingState === "recording" && (
            <Badge variant="destructive" className="animate-pulse">
              {t("webcamRecorder.recBadge", { time: formatTime(elapsedSec) })}
            </Badge>
          )}
          {recordingState === "recording" && remainingSec !== null && (
            <Badge variant="outline" className="text-muted-foreground">
              {t("webcamRecorder.timeLeft", { time: formatTime(remainingSec) })}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Mute */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            aria-label={
              isMuted
                ? t("webcamRecorder.unmuteMicrophone")
                : t("webcamRecorder.muteMicrophone")
            }
          >
            {isMuted ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>

          {/* Camera flip (only webcam modes, and when not recording) */}
          {!isScreenMode && recordingState !== "recording" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCamera}
              aria-label={t("webcamRecorder.switchCamera")}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}

          {/* Settings */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings((s) => !s)}
            aria-label={t("headings.settings")}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ---- Source picker (mid-session swap) ---- */}
      {onModeChange &&
        (recordingState === "idle" || recordingState === "previewing") && (
          <div
            role="group"
            aria-label={t("webcamRecorder.sourcePicker")}
            className="flex flex-wrap items-center gap-1.5"
          >
            <RecordingModeButtons size="sm" current={mode} onPick={onModeChange} />
          </div>
        )}

      {/* ---- Settings panel ---- */}
      {showSettings && (
        <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/50 px-4 py-3">
          {hasCamera && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t("webcamRecorder.resolution")}
            </span>
            <div className="flex gap-1">
              {(["720p", "1080p"] as Resolution[]).map((r) => (
                <Button
                  key={r}
                  variant={resolution === r ? "default" : "outline"}
                  size="sm"
                  disabled={recordingState === "recording"}
                  onClick={() => changeResolution(r)}
                >
                  {r}
                </Button>
              ))}
            </div>
          </div>
          )}

          {maxDurationSec && (
            <div className="text-xs text-muted-foreground">
              {t("webcamRecorder.maxDuration", { time: formatTime(maxDurationSec) })}
            </div>
          )}

          {/* #127 — Background replacement picker. Segmentation needs a
              person, so it's only shown for camera-bearing modes (webcam +
              screen+webcam PiP), never screen-only. Selecting blur/colour/
              image routes frames through the canvas compositor (startWebcam-
              Composite for webcam, startCanvasComposite for PiP); MediaPipe
              segmentation loads lazily on the first non-none selection.
              Blur strength, custom colour and image upload: #1787. */}
          {mode !== "screen" && (
            <WebcamBackgroundControls
              value={bgReplacement}
              onChange={setBgReplacement}
              disabled={recordingState === "recording"}
            />
          )}
        </div>
      )}

      {/* ---- Error ---- */}
      {/* Retry button covers the cancelled-screen-picker case
          (gap #490): NotAllowedError comes from getDisplayMedia when
          the user dismisses the picker, which leaves the panel idle
          with no obvious way to re-arm without a second click on
          the section button. */}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          {recordingState === "idle" && (
            <Button
              variant="outline"
              size="sm"
              onClick={startPreview}
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              {t("actions.tryAgain")}
            </Button>
          )}
        </div>
      )}

      {/* ---- Video viewport ---- */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        {/* Live preview */}
        {(recordingState === "previewing" || recordingState === "recording") && (
          <>
            <video
              ref={videoPreviewRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "absolute inset-0 h-full w-full object-cover",
                !isScreenMode && facingMode === "user" && "-scale-x-100",
              )}
            />

            {/* PiP webcam overlay (screen+webcam mode) */}
            {isPipMode && (
              <video
                ref={pipVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-3 right-3 h-1/4 w-1/4 rounded-lg border-2 border-white/50 object-cover shadow-lg"
              />
            )}

            {/* Teleprompter text overlay */}
            {teleprompterText && (
              <div className="absolute inset-x-0 bottom-0 bg-black/60 px-4 py-3">
                <p className="text-center text-sm leading-relaxed text-white/90">
                  {teleprompterText}
                </p>
              </div>
            )}
          </>
        )}

        {/* Playback after recording */}
        {recordingState === "recorded" && recordedUrl && (
          <video
            ref={videoPlaybackRef}
            src={recordedUrl}
            controls
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}

        {/* Idle state */}
        {recordingState === "idle" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <ModeHeaderIcon className="h-12 w-12" />
            <span className="text-sm">{t(modeMeta.idleHintKey)}</span>
          </div>
        )}

        {/* Audio level meter */}
        {(recordingState === "previewing" || recordingState === "recording") && (
          <div className="absolute bottom-3 left-3 flex h-24 items-end gap-0.5">
            {Array.from({ length: 10 }).map((_, i) => {
              const threshold = (i + 1) / 10;
              const active = audioLevel >= threshold;
              return (
                <div
                  key={i}
                  className={cn(
                    "w-1.5 rounded-full transition-all duration-75",
                    active
                      ? i >= 8
                        ? "bg-red-500"
                        : i >= 6
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      : "bg-white/20",
                  )}
                  style={{ height: `${(i + 1) * 10}%` }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ---- Controls ---- */}
      <div className="flex items-center justify-center gap-3">
        {recordingState === "idle" && (
          <Button onClick={startPreview} className="gap-2">
            <ModeHeaderIcon className="h-4 w-4" />
            {t(modeMeta.startVerbKey)}
          </Button>
        )}

        {recordingState === "previewing" && (
          <>
            {/* Cancel out of preview without recording. For screen
                modes this label is "Stop sharing" — the same words
                the browser tray uses, so users know exactly what
                they're releasing. */}
            <Button
              onClick={stopSharing}
              variant="outline"
              className="gap-2"
              aria-label={t(modeMeta.cancelPreviewLabelKey)}
            >
              {isScreenMode ? (
                <StopCircle className="h-4 w-4" />
              ) : (
                <X className="h-4 w-4" />
              )}
              {t(modeMeta.cancelPreviewLabelKey)}
            </Button>
            <Button
              onClick={startRecording}
              variant="destructive"
              className="gap-2"
            >
              <Video className="h-4 w-4" />
              {t("actions.record")}
            </Button>
          </>
        )}

        {recordingState === "recording" && (
          <Button
            onClick={stopRecording}
            variant="destructive"
            className="gap-2"
          >
            <StopCircle className="h-4 w-4" />
            {t("actions.stopRecording")}
          </Button>
        )}

        {recordingState === "recorded" && (
          <Button onClick={retake} variant="outline" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            {t("actions.retake")}
          </Button>
        )}
      </div>
    </div>
  );
}
