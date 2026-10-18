import { useCallback, useEffect, useReducer, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { RecordingMode } from "@/lib/studio/recording-modes";
import { attachStream, getSupportedMimeType, mapMediaAcquisitionError } from "./helpers";
import { initialRecorderState, recorderReducer } from "./recorderMachine";
import type { RecordingState, Resolution } from "./types";
import { useAudioLevelMeter } from "./useAudioLevelMeter";
import { useMediaDevices } from "./useMediaDevices";

interface UseRecorderOptions {
  mode: RecordingMode;
  maxDurationSec?: number;
  autoStart: boolean;
  onRecordingComplete: (blob: Blob, durationMs: number) => void;
}

/**
 * WebcamRecorder session: the `recorderReducer` state machine plus the
 * MediaRecorder / stream lifecycle around it. Teardown ordering
 * (timer → audio → canvas → streams) matches the pre-split component.
 */
export function useRecorder({
  mode,
  maxDurationSec,
  autoStart,
  onRecordingComplete,
}: UseRecorderOptions) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(recorderReducer, initialRecorderState);
  const recordingState = state.status;

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const videoPlaybackRef = useRef<HTMLVideoElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Mirror of recordingState readable from the screen-track 'ended'
  // listener, which is attached at acquire-time and outlives every
  // state transition (closure state would always read "idle").
  const recordingStateRef = useRef<RecordingState>("idle");

  const { audioLevel, startAudioAnalysis, stopAudioAnalysis } = useAudioLevelMeter();

  const devices = useMediaDevices({
    videoPreviewRef,
    onScreenTrackEnded: handleScreenTrackEnded,
  });
  const {
    resolution, setResolution, facingMode, setFacingMode, bgReplacement,
    webcamStreamRef, compositeStreamRef, acquireWebcam, acquireMicOnly, acquireScreen,
    startCanvasComposite, startWebcamComposite, setCombinedStream, teardownCompositeKeepCam,
    attachWebcamToPreview, stopWebcamTracks, stopCanvasComposite, stopAllStreams,
  } = devices;

  // Browser-tray "Stop sharing". Hoisted declaration (called only from
  // the track listener, after every binding below exists).
  function handleScreenTrackEnded(): void {
    const live = recordingStateRef.current;
    if (live === "recording" && mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      return;
    }
    if (live === "previewing") {
      // Preview is now a dead frame — release everything (the mic /
      // webcam streams paired with the screen capture are useless
      // without it) and surface a notice so the user knows why
      // they're back at idle and how to re-arm.
      stopAudioAnalysis();
      stopCanvasComposite();
      stopAllStreams();
      dispatch({
        type: "SCREEN_SHARE_ENDED",
        error: t("webcamRecorder.screenSharingEnded", {
          startVerb: t("webcamRecorder.shareScreen"),
        }),
      });
    }
  }

  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  const isScreenMode = mode === "screen" || mode === "screen+webcam";
  const isPipMode = mode === "screen+webcam";
  // Resolution governs webcam capture only (#2237).
  const hasCamera = mode !== "screen";

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

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

  // ---- Start preview ----
  const startPreview = useCallback(async () => {
    dispatch({ type: "PREVIEW_REQUESTED" });
    try {
      let previewStream: MediaStream;
      if (isScreenMode) {
        if (isPipMode) {
          // PiP — acquire the WEBCAM first so a busy/missing camera
          // fails before the user picks a screen.
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
          setCombinedStream(combined);
          previewStream = combined;
        }
      } else {
        previewStream = await acquireWebcam(resolution, facingMode);
      }
      // The <video> attach happens in the status-keyed effect below —
      // the element isn't mounted until state flips to "previewing".
      startAudioAnalysis(previewStream);
      dispatch({ type: "PREVIEW_READY" });
    } catch (err) {
      dispatch({ type: "ERROR", error: mapMediaAcquisitionError(err, mode, t) });
      // Drop any half-acquired streams so a retry from idle starts clean.
      stopAllStreams();
    }
  }, [
    mode, t, isScreenMode, isPipMode, resolution, facingMode, acquireWebcam,
    acquireMicOnly, acquireScreen, startCanvasComposite, setCombinedStream,
    startAudioAnalysis, stopAllStreams,
  ]);

  // Attach the active streams to their <video> elements once they
  // exist in the DOM (every transition into a viewing state).
  useEffect(() => {
    if (recordingState !== "previewing" && recordingState !== "recording") {
      return;
    }
    const main = compositeStreamRef.current ?? webcamStreamRef.current;
    const previewEl = videoPreviewRef.current;
    if (previewEl && main && previewEl.srcObject !== main) {
      attachStream(previewEl, main);
    }
    if (isPipMode) {
      const pipEl = pipVideoRef.current;
      const cam = webcamStreamRef.current;
      if (pipEl && cam && pipEl.srcObject !== cam) {
        attachStream(pipEl, cam);
      }
    }
  }, [recordingState, isPipMode, compositeStreamRef, webcamStreamRef]);

  // Webcam-only background replacement (#127): build the canvas the
  // moment a background is picked during preview, tear it down when
  // cleared. Screen-only mode has no camera to segment.
  useEffect(() => {
    if (mode !== "webcam" || recordingState !== "previewing") return;
    const rawCam = webcamStreamRef.current;
    if (!rawCam) return;
    const wantsComposite = bgReplacement.kind !== "none";
    const hasComposite = !!compositeStreamRef.current;
    if (wantsComposite && !hasComposite) {
      const composite = startWebcamComposite(rawCam);
      const el = videoPreviewRef.current;
      if (el) attachStream(el, composite);
    } else if (!wantsComposite && hasComposite) {
      teardownCompositeKeepCam();
      const el = videoPreviewRef.current;
      if (el) attachStream(el, rawCam);
    }
  }, [
    mode, recordingState, bgReplacement.kind, startWebcamComposite,
    teardownCompositeKeepCam, compositeStreamRef, webcamStreamRef,
  ]);

  // Auto-arm on mount when caller asks. Fires once — mode changes
  // after mount still need a remount via `key`.
  useEffect(() => {
    if (autoStart && recordingState === "idle") {
      startPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Recording ----
  const startRecording = useCallback(() => {
    const stream = compositeStreamRef.current ?? webcamStreamRef.current;
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

      dispatch({ type: "RECORDING_FINISHED", blob, url });

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
    dispatch({ type: "RECORDING_STARTED" });

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      dispatch({ type: "TICK", elapsedSec: elapsed });
      if (maxDurationSec && elapsed >= maxDurationSec) {
        recorder.stop();
      }
    }, 1000);
  }, [
    maxDurationSec, onRecordingComplete, stopTimer, stopCanvasComposite,
    stopAllStreams, stopAudioAnalysis, compositeStreamRef, webcamStreamRef,
  ]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Release the preview without recording — backs the explicit
  // "Stop sharing" / "Cancel" button in preview state.
  const stopSharing = useCallback(() => {
    stopAudioAnalysis();
    stopCanvasComposite();
    stopAllStreams();
    dispatch({ type: "PREVIEW_CANCELLED" });
  }, [stopAudioAnalysis, stopCanvasComposite, stopAllStreams]);

  const { recordedUrl } = state;
  const retake = useCallback(() => {
    stopTimer();
    stopAudioAnalysis();
    stopCanvasComposite();
    stopAllStreams();
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    dispatch({ type: "RETAKE" });
  }, [recordedUrl, stopTimer, stopAudioAnalysis, stopCanvasComposite, stopAllStreams]);

  // ---- Camera toggle ----
  const toggleCamera = useCallback(async () => {
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    if (recordingState === "previewing") {
      stopWebcamTracks();
      try {
        const stream = await acquireWebcam(resolution, next);
        attachWebcamToPreview(stream);
        startAudioAnalysis(stream);
      } catch {
        dispatch({ type: "ERROR", error: t("webcamRecorder.switchCameraFailed") });
      }
    }
  }, [
    t, facingMode, setFacingMode, recordingState, resolution, stopWebcamTracks,
    acquireWebcam, attachWebcamToPreview, startAudioAnalysis,
  ]);

  // ---- Resolution change (only in idle/previewing; never screen-only) ----
  const changeResolution = useCallback(
    async (res: Resolution) => {
      if (!hasCamera) return;
      setResolution(res);
      if (recordingState === "previewing") {
        stopWebcamTracks();
        try {
          const stream = await acquireWebcam(res, facingMode);
          if (isScreenMode) {
            // Screen / PiP modes drive the main preview from the screen
            // composite — keep the direct-attach behavior here.
            if (videoPreviewRef.current) {
              attachStream(videoPreviewRef.current, stream);
            }
          } else {
            attachWebcamToPreview(stream);
          }
          startAudioAnalysis(stream);
        } catch {
          dispatch({ type: "ERROR", error: t("webcamRecorder.resolutionChangeFailed") });
        }
      }
    },
    [
      hasCamera, t, setResolution, recordingState, stopWebcamTracks, isScreenMode,
      facingMode, acquireWebcam, attachWebcamToPreview, startAudioAnalysis,
    ],
  );

  return {
    state,
    devices,
    audioLevel,
    isScreenMode,
    isPipMode,
    hasCamera,
    videoPreviewRef,
    videoPlaybackRef,
    pipVideoRef,
    startPreview,
    startRecording,
    stopRecording,
    stopSharing,
    retake,
    toggleCamera,
    changeResolution,
  };
}
