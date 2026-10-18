import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { BackgroundReplacement } from "@/lib/studio/webcam/background-removal";
import {
  startPipComposite,
  startWebcamComposite as buildWebcamComposite,
  stopCompositeLoop,
} from "./compositor";
import { attachStream } from "./helpers";
import {
  RESOLUTION_CONSTRAINTS,
  type FacingMode,
  type Resolution,
} from "./types";

/** Newly-acquired streams come up already-muted when the user pre-muted. */
function honorPreMute(stream: MediaStream, muted: boolean): void {
  if (muted) {
    stream.getAudioTracks().forEach((t) => { t.enabled = false; });
  }
}

interface UseMediaDevicesOptions {
  /** Live <video> preview the webcam stream (or its composite) attaches to. */
  videoPreviewRef: RefObject<HTMLVideoElement | null>;
  /** Fired when the user ends the screen share from the browser's tray. */
  onScreenTrackEnded: () => void;
}

/**
 * Stream acquisition + ownership for WebcamRecorder: webcam / mic /
 * screen permissions, the composite stream, mute state, capture
 * resolution and camera facing, and the background-replacement value
 * the compositor reads each frame. Has no unmount effect of its own —
 * the recorder's single cleanup runs the teardown in its fixed order.
 */
export function useMediaDevices({
  videoPreviewRef,
  onScreenTrackEnded,
}: UseMediaDevicesOptions) {
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [facingMode, setFacingMode] = useState<FacingMode>("user");
  const [isMuted, setIsMuted] = useState(false);

  const webcamStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const compositeStreamRef = useRef<MediaStream | null>(null);
  const canvasAnimFrameRef = useRef<number | null>(null);

  // #127 — Background-replacement state. Stored in a ref so the RAF
  // draw loop sees updates without re-running the effect that owns
  // the composite stream.
  const [bgReplacement, setBgReplacement] = useState<BackgroundReplacement>({ kind: "none" });
  const bgReplacementRef = useRef<BackgroundReplacement>(bgReplacement);
  bgReplacementRef.current = bgReplacement;
  const getReplacement = useCallback(() => bgReplacementRef.current, []);

  // Latest screen-ended handler, read by the listener attached at
  // acquire-time (which outlives every render).
  const onScreenTrackEndedRef = useRef(onScreenTrackEnded);
  onScreenTrackEndedRef.current = onScreenTrackEnded;

  // Mirror of isMuted readable from non-reactive callbacks (acquire*).
  // Lets newly-acquired streams come up already-muted when the user
  // pre-mutes before clicking Start.
  const isMutedRef = useRef(false);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const stopCanvasComposite = useCallback(() => {
    stopCompositeLoop(canvasAnimFrameRef);
  }, []);

  const stopAllStreams = useCallback(() => {
    [webcamStreamRef, screenStreamRef, compositeStreamRef].forEach((ref) => {
      ref.current?.getTracks().forEach((t) => t.stop());
      ref.current = null;
    });
  }, []);

  // Disable / re-enable every audio track across whichever streams
  // currently exist. Setting `enabled = false` makes MediaRecorder
  // encode silent frames — the recorded file still has an audio track,
  // just silent, which is what the mute toggle promises.
  const applyMuteToAllStreams = useCallback((muted: boolean) => {
    [webcamStreamRef, screenStreamRef, compositeStreamRef].forEach((ref) => {
      ref.current?.getAudioTracks().forEach((t) => {
        t.enabled = !muted;
      });
    });
  }, []);

  // ---- Camera acquisition ----
  const acquireWebcam = useCallback(
    async (res: Resolution, facing: FacingMode) => {
      const { width, height } = RESOLUTION_CONSTRAINTS[res];
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: true,
      });
      honorPreMute(stream, isMutedRef.current);
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
    honorPreMute(stream, isMutedRef.current);
    webcamStreamRef.current = stream;
    return stream;
  }, []);

  const acquireScreen = useCallback(async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    honorPreMute(stream, isMutedRef.current);
    screenStreamRef.current = stream;

    // User clicked the browser's native "Stop sharing" tray. The
    // handler reads live recorder state from refs (closure state would
    // be stale — acquisition runs before the "previewing" transition).
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      onScreenTrackEndedRef.current();
    });

    return stream;
  }, []);

  // ---- Composites ----
  const startCanvasComposite = useCallback(
    (screenStream: MediaStream, webcamStream: MediaStream): MediaStream => {
      const { stream } = startPipComposite(
        screenStream,
        webcamStream,
        getReplacement,
        canvasAnimFrameRef,
      );
      compositeStreamRef.current = stream;
      return stream;
    },
    [getReplacement],
  );

  const startWebcamComposite = useCallback(
    (webcamStream: MediaStream): MediaStream => {
      const { stream } = buildWebcamComposite(
        webcamStream,
        getReplacement,
        canvasAnimFrameRef,
      );
      compositeStreamRef.current = stream;
      return stream;
    },
    [getReplacement],
  );

  /** Screen-only preview: screen video + mic audio, no canvas. */
  const setCombinedStream = useCallback((stream: MediaStream) => {
    compositeStreamRef.current = stream;
  }, []);

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
        if (el) attachStream(el, composite);
      } else if (el) {
        attachStream(el, stream);
      }
    },
    [videoPreviewRef, teardownCompositeKeepCam, startWebcamComposite],
  );

  /** Stops the current webcam tracks ahead of a re-acquire. */
  const stopWebcamTracks = useCallback(() => {
    webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // Mutes/unmutes audio across every active stream — webcam mic,
  // screen system audio, and the composite stream's merged tracks.
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      applyMuteToAllStreams(next);
      return next;
    });
  }, [applyMuteToAllStreams]);

  return {
    resolution,
    setResolution,
    facingMode,
    setFacingMode,
    isMuted,
    toggleMute,
    bgReplacement,
    setBgReplacement,
    webcamStreamRef,
    compositeStreamRef,
    acquireWebcam,
    acquireMicOnly,
    acquireScreen,
    startCanvasComposite,
    startWebcamComposite,
    setCombinedStream,
    teardownCompositeKeepCam,
    attachWebcamToPreview,
    stopWebcamTracks,
    stopCanvasComposite,
    stopAllStreams,
  };
}
