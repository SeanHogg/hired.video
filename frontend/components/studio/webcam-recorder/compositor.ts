/**
 * Canvas compositing for WebcamRecorder — plain (non-React) code.
 *
 * Each builder creates an offscreen canvas, runs a RAF draw loop whose
 * frame id is written into the caller's `frame` handle (so the caller
 * can cancel it with `stopCompositeLoop`), and returns the canvas plus
 * its captured stream. Background replacement (#127) is read through
 * `getReplacement()` every frame, so switching blur↔colour needs no
 * rebuild.
 */
import {
  applyBackgroundReplacement,
  type BackgroundReplacement,
} from "@/lib/studio/webcam/background-removal";
import type { FrameHandle } from "./types";

export interface Composite {
  canvas: HTMLCanvasElement;
  stream: MediaStream;
}

function mutedPlayingVideo(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.play();
  return video;
}

export function stopCompositeLoop(frame: FrameHandle): void {
  if (frame.current !== null) {
    cancelAnimationFrame(frame.current);
    frame.current = null;
  }
}

/** Screen + webcam picture-in-picture composite (bottom-right PiP). */
export function startPipComposite(
  screenStream: MediaStream,
  webcamStream: MediaStream,
  getReplacement: () => BackgroundReplacement,
  frame: FrameHandle,
): Composite {
  const canvas = document.createElement("canvas");

  const screenTrack = screenStream.getVideoTracks()[0];
  const settings = screenTrack.getSettings();
  canvas.width = settings.width || 1920;
  canvas.height = settings.height || 1080;

  const ctx = canvas.getContext("2d")!;

  const screenVideo = mutedPlayingVideo(screenStream);
  const camVideo = mutedPlayingVideo(webcamStream);

  // The visible PiP overlay (pipVideoRef) is attached by the
  // `recordingState`-keyed effect in useRecorder — at this point the
  // <video> element isn't mounted yet because state is still "idle".

  const pipW = Math.round(canvas.width * 0.25);
  const pipH = Math.round(canvas.height * 0.25);
  const margin = 16;

  // #127 — Person-segment + background-replacement composition.
  // When a replacement is set, the PiP webcam frame routes through
  // `applyBackgroundReplacement` instead of a raw drawImage. Both code
  // paths run inside the same RAF loop so the composite stream keeps a
  // single tick.
  const draw = async () => {
    ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
    const replacement = getReplacement();
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
    frame.current = requestAnimationFrame(() => { void draw(); });
  };
  void draw();

  const canvasStream = canvas.captureStream(30);

  // Merge audio from both streams
  const audioTracks = [
    ...screenStream.getAudioTracks(),
    ...webcamStream.getAudioTracks(),
  ];
  audioTracks.forEach((t) => canvasStream.addTrack(t));

  return { canvas, stream: canvasStream };
}

/**
 * Webcam-only background composite (#127 follow-up). Routes the raw
 * webcam frames through applyBackgroundReplacement and captures the
 * canvas as the stream used for BOTH the live preview and recording, so
 * the chosen background shows on screen and is baked into the clip.
 */
export function startWebcamComposite(
  webcamStream: MediaStream,
  getReplacement: () => BackgroundReplacement,
  frame: FrameHandle,
): Composite {
  const canvas = document.createElement("canvas");

  const track = webcamStream.getVideoTracks()[0];
  const settings = track?.getSettings() ?? {};
  canvas.width = settings.width || 1280;
  canvas.height = settings.height || 720;

  const ctx = canvas.getContext("2d")!;

  const camVideo = mutedPlayingVideo(webcamStream);

  const draw = async () => {
    await applyBackgroundReplacement({
      ctx,
      source: camVideo,
      width: canvas.width,
      height: canvas.height,
      mode: getReplacement(),
    });
    frame.current = requestAnimationFrame(() => {
      void draw();
    });
  };
  void draw();

  const canvasStream = canvas.captureStream(30);
  // Audio tracks are SHARED (addTrack copies the reference, it does
  // not move the track), so the raw webcam stream keeps its mic —
  // teardownCompositeKeepCam relies on that and must not stop these.
  webcamStream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));

  return { canvas, stream: canvasStream };
}
