/**
 * WebcamStillCapture — single-frame webcam grab.
 *
 * Distinct from `WebcamRecorder` (which produces a Blob video for the
 * studio's record flow). This one shows a live preview, lets the user
 * click "Capture," and emits a single PNG Blob. Used by the AI
 * Headshot Generator's reference-image step.
 *
 * Self-gates: when the browser doesn't expose getUserMedia, this
 * component renders a clearly-labelled fallback so the parent doesn't
 * have to gate visibility. Per the standing DRY rule, gating lives in
 * the component itself.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** Fired when the user captures a still. The Blob is a PNG. */
  onCapture: (blob: Blob) => void;
  /** Capture resolution. Defaults to 1024×1024 (square crop) so it
   *  feeds SDXL-Turbo natively without re-scaling. */
  width?: number;
  height?: number;
}

export default function WebcamStillCapture({ onCapture, width = 1024, height = 1024 }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof navigator !== "undefined"
    && typeof navigator.mediaDevices?.getUserMedia === "function";

  const start = useCallback(async () => {
    if (!supported) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: width }, height: { ideal: height }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
      }
      setStreaming(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Webcam access failed");
    }
  }, [supported, width, height]);

  const stop = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreaming(false);
  }, []);

  // Always tear down the stream on unmount so the camera light goes
  // off promptly. Without this, navigating away leaves the LED on.
  useEffect(() => {
    return () => {
      const stream = streamRef.current;
      if (stream) for (const t of stream.getTracks()) t.stop();
    };
  }, []);

  const capture = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !streaming) return;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Centre-crop the video frame to a square, then scale into the
    // target dimensions. Avoids the squished-face look you get from a
    // straight non-uniform scale of a 16:9 webcam frame.
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    ctx.drawImage(v, sx, sy, side, side, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (blob) onCapture(blob);
  }, [streaming, width, height, onCapture]);

  if (!supported) {
    return (
      <div className="rounded border bg-muted/30 p-4 text-xs text-muted-foreground">
        Webcam isn't available in this browser. Upload a reference photo instead.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative aspect-square overflow-hidden rounded border bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        {!streaming && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-white">
            Click <span className="mx-1 font-semibold">Start camera</span> to begin
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!streaming ? (
          <Button size="sm" onClick={start}>
            <Camera className="mr-1.5 h-3.5 w-3.5" />
            Start camera
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={capture}>
              <Camera className="mr-1.5 h-3.5 w-3.5" />
              Capture
            </Button>
            <Button size="sm" variant="ghost" onClick={stop}>
              <Square className="mr-1.5 h-3.5 w-3.5" />
              Stop
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { stop(); start(); }}>
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
              Restart
            </Button>
          </>
        )}
      </div>
      {error && <div className="text-xs text-destructive">{error}</div>}
    </div>
  );
}
