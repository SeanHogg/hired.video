"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Camera,
  Video,
  StopCircle,
  RotateCcw,
  Monitor,
  Mic,
  MicOff,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Recording source the WebcamRecorder mounts in. Used as the source
 *  of truth for every recording-mode chooser in Studio (the Recording
 *  & Audio section's quick-launch buttons, the in-panel mode picker,
 *  template `defaultRecordingMode`, the extension `?capture=` URL
 *  param). Don't write a second copy of these strings — import this. */
export type RecordingMode = "webcam" | "screen" | "screen+webcam";

/** Display metadata for each recording mode. Single source — every
 *  surface that lets the user pick a recording mode reads from this
 *  list so labels + ordering can never drift. Icons are looked up by
 *  consumer (we don't import lucide here to keep this file tree-
 *  shakable from the Async Interview / Code Walkthrough surfaces that
 *  don't render the picker themselves). */
export const RECORDING_MODES: ReadonlyArray<{
  id: RecordingMode;
  /** Short label for chip / button. */
  label: string;
  /** Long label used in the open-panel header ("Webcam Recording"). */
  panelTitle: string;
  /** Icon name from lucide-react — consumers do their own
   *  `import { Video, Monitor, MonitorPlay } from 'lucide-react'`
   *  and switch on this id. Keeps this module dep-free. */
  iconName: "video" | "monitor" | "monitor-play";
  /** Tooltip / aria description. */
  description: string;
  /** Idle-state hint shown inside the recorder viewport before the
   *  user has acquired any media. */
  idleHint: string;
  /** Verb on the primary "start" button in idle state ("Start
   *  Camera" vs "Share Screen"). Keeps every label-vs-mode coupling
   *  in this single table. */
  startVerb: string;
}> = [
  { id: "webcam",         label: "Webcam",   panelTitle: "Webcam Recording",          iconName: "video",        description: "Record from camera + microphone",            idleHint: "Click “Start Camera” to begin",                                  startVerb: "Start Camera" },
  { id: "screen",         label: "Screen",   panelTitle: "Screen Recording",          iconName: "monitor",      description: "Record screen + system audio",               idleHint: "Click “Share Screen” to begin",                                   startVerb: "Share Screen" },
  { id: "screen+webcam",  label: "Screen + PiP", panelTitle: "Screen + Webcam Recording", iconName: "monitor-play", description: "Record screen with webcam picture-in-picture", idleHint: "Click “Share Screen” to choose a screen and start your webcam", startVerb: "Share Screen" },
];

interface WebcamRecorderProps {
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
}: WebcamRecorderProps) {
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
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioAnimFrameRef = useRef<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasAnimFrameRef = useRef<number | null>(null);

  // Mirror of isMuted readable from non-reactive callbacks (acquire*).
  // Lets newly-acquired streams come up already-muted when the user
  // pre-mutes before clicking Start.
  const isMutedRef = useRef(false);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

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
      audioContextRef.current.close().catch(() => {});
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
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        audioContextRef.current = ctx;
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

    // If user stops sharing via browser UI, handle gracefully
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (
        recordingState === "recording" &&
        mediaRecorderRef.current?.state === "recording"
      ) {
        mediaRecorderRef.current.stop();
      }
    });

    return stream;
  }, [recordingState]);

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

      const draw = () => {
        ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
        // PiP webcam in bottom-right
        ctx.drawImage(
          camVideo,
          canvas.width - pipW - margin,
          canvas.height - pipH - margin,
          pipW,
          pipH,
        );
        canvasAnimFrameRef.current = requestAnimationFrame(draw);
      };
      draw();

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

  // ---- Start preview ----
  const startPreview = useCallback(async () => {
    setError(null);
    try {
      let previewStream: MediaStream;

      if (isScreenMode) {
        const screenStream = await acquireScreen();
        if (isPipMode) {
          const webcamStream = await acquireWebcam(resolution, facingMode);
          previewStream = startCanvasComposite(screenStream, webcamStream);
        } else {
          // Screen-only — mic for narration only, no camera prompt.
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
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera/microphone permission denied. Please allow access and try again."
          : err instanceof DOMException && err.name === "NotFoundError"
            ? "No camera or microphone found. Please connect a device and try again."
            : `Failed to access media devices: ${err instanceof Error ? err.message : String(err)}`;
      setError(msg);
      // Drop any half-acquired streams so a retry from idle starts
      // clean rather than sitting on a half-set composite ref.
      stopAllStreams();
    }
  }, [
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
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
          videoPreviewRef.current.play().catch(() => {});
        }
        startAudioAnalysis(stream);
      } catch {
        setError("Failed to switch camera.");
      }
    }
  }, [
    facingMode,
    recordingState,
    resolution,
    acquireWebcam,
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
  const changeResolution = useCallback(
    async (res: Resolution) => {
      setResolution(res);
      if (recordingState === "previewing") {
        webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
        try {
          const stream = await acquireWebcam(res, facingMode);
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = stream;
            videoPreviewRef.current.play().catch(() => {});
          }
          startAudioAnalysis(stream);
        } catch {
          setError("Failed to change resolution.");
        }
      }
    },
    [recordingState, facingMode, acquireWebcam, startAudioAnalysis],
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
          <span className="text-sm font-medium">{modeMeta.panelTitle}</span>
          <Badge variant="secondary">{resolution}</Badge>
          {recordingState === "recording" && (
            <Badge variant="destructive" className="animate-pulse">
              REC {formatTime(elapsedSec)}
            </Badge>
          )}
          {recordingState === "recording" && remainingSec !== null && (
            <Badge variant="outline" className="text-muted-foreground">
              {formatTime(remainingSec)} left
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Mute */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
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
              aria-label="Switch camera"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}

          {/* Settings */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings((s) => !s)}
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ---- Settings panel ---- */}
      {showSettings && (
        <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Resolution
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

          {maxDurationSec && (
            <div className="text-xs text-muted-foreground">
              Max duration: {formatTime(maxDurationSec)}
            </div>
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
              Try again
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
            <span className="text-sm">{modeMeta.idleHint}</span>
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
            {modeMeta.startVerb}
          </Button>
        )}

        {recordingState === "previewing" && (
          <Button
            onClick={startRecording}
            variant="destructive"
            className="gap-2"
          >
            <Video className="h-4 w-4" />
            Record
          </Button>
        )}

        {recordingState === "recording" && (
          <Button
            onClick={stopRecording}
            variant="destructive"
            className="gap-2"
          >
            <StopCircle className="h-4 w-4" />
            Stop Recording
          </Button>
        )}

        {recordingState === "recorded" && (
          <Button onClick={retake} variant="outline" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Retake
          </Button>
        )}
      </div>
    </div>
  );
}
