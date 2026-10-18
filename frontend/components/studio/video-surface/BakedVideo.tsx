import { useEffect, useRef, useState } from "react";

import CtaHotzonesOverlay from "@/components/video/CtaHotzonesOverlay";
import { VideoTracker } from "@/lib/analytics/video-tracker";

// ─── Baked branch ────────────────────────────────────────────────────────────
// Native <video controls> + CTA-hotzones overlay. Used when a published
// render exists; the URL is the canonical artifact so we don't try to
// recompile the script for it.

export default function BakedVideo({
  url,
  title,
  poster,
  hotzones,
  autoplay,
  controls,
  loop,
  muted,
  analyticsProjectId,
}: {
  url: string;
  title: string;
  poster: string | undefined;
  hotzones: { startSec: number; endSec: number; x: number; y: number; w: number; h: number; url: string }[];
  autoplay?: boolean;
  /** Explicit overrides. When omitted the autoplay flag drives all
   *  three (hero-spotlight "live thumbnail" feel: muted-autoplay-loop,
   *  no controls). Flat callers pass these directly. */
  controls?: boolean;
  loop?: boolean;
  muted?: boolean;
  analyticsProjectId?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState<number | undefined>(undefined);

  // Self-attach the per-second engagement tracker when a project id is
  // supplied. Owned by the surface so consumers can't accidentally
  // attach to the wrong element (or forget to detach on unmount).
  useEffect(() => {
    if (!analyticsProjectId || !videoRef.current) return;
    const tracker = new VideoTracker(analyticsProjectId);
    return tracker.attach(videoRef.current);
  }, [analyticsProjectId]);

  return (
    <>
      <video
        ref={videoRef}
        src={url}
        poster={poster}
        controls={controls ?? !autoplay}
        autoPlay={autoplay}
        muted={muted ?? autoplay}
        loop={loop ?? autoplay}
        playsInline
        preload="metadata"
        title={title}
        className="absolute inset-0 w-full h-full object-contain"
        onTimeUpdate={(e) => setCurrentTimeSec(e.currentTarget.currentTime)}
      />
      <CtaHotzonesOverlay
        hotzones={hotzones}
        currentTimeSec={currentTimeSec}
        onActivate={() => videoRef.current?.pause()}
        analyticsProjectId={analyticsProjectId}
      />
    </>
  );
}
