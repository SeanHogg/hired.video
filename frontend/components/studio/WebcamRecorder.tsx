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

interface WebcamRecorderProps {
  onRecordingComplete: (blob: Blob, durationMs: number) => void;
  teleprompterText?: string;
  mode?: "webcam" | "screen" | "screen+webcam";
  maxDurationSec?: number;
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
      webcamStreamRef.current = stream;
      return stream;
    },
    [],
  );

  const acquireScreen = useCallback(async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
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

      // Show pip in corner of preview
      if (pipVideoRef.current) {
        pipVideoRef.current.srcObject = webcamStream;
        pipVideoRef.current.play().catch(() => {});
      }

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
          // Screen-only — still need mic
          const webcamStream = await acquireWebcam(resolution, facingMode);
          // Use screen video + webcam audio
          const combined = new MediaStream([
            ...screenStream.getVideoTracks(),
            ...webcamStream.getAudioTracks(),
          ]);
          compositeStreamRef.current = combined;
          previewStream = combined;
        }
      } else {
        previewStream = await acquireWebcam(resolution, facingMode);
      }

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = previewStream;
        videoPreviewRef.current.play().catch(() => {});
      }

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
    }
  }, [
    isScreenMode,
    isPipMode,
    resolution,
    facingMode,
    acquireWebcam,
    acquireScreen,
    startCanvasComposite,
    startAudioAnalysis,
  ]);

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
  const toggleMute = useCallback(() => {
    const stream = webcamStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((t) => {
        t.enabled = isMuted; // toggle: if currently muted, enable
      });
    }
    setIsMuted((m) => !m);
  }, [isMuted]);

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

  // ---- Mode icon / label ----
  const modeLabel = useMemo(() => {
    switch (mode) {
      case "screen":
        return "Screen Recording";
      case "screen+webcam":
        return "Screen + Webcam";
      default:
        return "Webcam";
    }
  }, [mode]);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="relative flex flex-col gap-4 rounded-lg border bg-card p-4">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isScreenMode ? (
            <Monitor className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Camera className="h-5 w-5 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">{modeLabel}</span>
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
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
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
            <Camera className="h-12 w-12" />
            <span className="text-sm">
              Click &quot;Start Camera&quot; to begin
            </span>
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
            <Camera className="h-4 w-4" />
            Start Camera
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
