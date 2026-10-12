/**
 * useVideoShape — the frame size and length of a hosted MP4, read from its
 * metadata only (no download of the video itself). The Distribution Hub
 * checks the master against each network's preset with it (useChannelFit),
 * since outside the editor there is no canvas to read the shape from.
 */
import { useEffect, useState } from "react";
import type { VideoFrame } from "@/components/studio/v2/focus/useChannelFit";

export interface VideoShapeState {
  frame: VideoFrame | null;
  durationSec: number | null;
}

const UNKNOWN: VideoShapeState = { frame: null, durationSec: null };

export function useVideoShape(url: string | null | undefined): VideoShapeState {
  const [shape, setShape] = useState<VideoShapeState>(UNKNOWN);
  useEffect(() => {
    setShape(UNKNOWN);
    if (!url) return;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    // Credentialless, so it loads under the studio's cross-origin isolation.
    video.crossOrigin = "anonymous";
    const onMeta = () =>
      setShape({
        frame: video.videoWidth > 0 && video.videoHeight > 0 ? { width: video.videoWidth, height: video.videoHeight } : null,
        durationSec: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null,
      });
    video.addEventListener("loadedmetadata", onMeta);
    video.src = url;
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeAttribute("src");
      video.load();
    };
  }, [url]);
  return shape;
}
