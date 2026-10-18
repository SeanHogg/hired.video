import { useEffect, useRef, useState } from "react";

import CtaHotzonesOverlay from "@/components/video/CtaHotzonesOverlay";
import { VideoTracker } from "@/lib/analytics/video-tracker";

// ─── Raw <video> branch with analytics ───────────────────────────────────────
// Legacy direct uploads that never went through the studio editor — no
// canvas-state, no script. Use a native <video controls> and attach the
// same VideoTracker the canvas branch drives via attachPlayhead().

export default function RawVideoPlayback({
  url,
  analyticsProjectId,
  hotzones,
  className,
}: {
  url: string;
  analyticsProjectId?: string;
  hotzones?: { startSec: number; endSec: number; x: number; y: number; w: number; h: number; url: string }[];
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!analyticsProjectId || !videoRef.current) return;
    const tracker = new VideoTracker(analyticsProjectId);
    return tracker.attach(videoRef.current);
  }, [analyticsProjectId]);
  return (
    <div
      className={`relative w-full aspect-video overflow-hidden rounded-xl bg-black shadow-lg ${className ?? ""}`}
    >
      <video
        ref={videoRef}
        src={url}
        controls
        playsInline
        preload="metadata"
        className="absolute inset-0 h-full w-full object-contain"
        onTimeUpdate={(e) => setCurrentTimeSec(e.currentTarget.currentTime)}
      />
      <CtaHotzonesOverlay
        hotzones={hotzones ?? []}
        currentTimeSec={currentTimeSec}
        onActivate={() => videoRef.current?.pause()}
        analyticsProjectId={analyticsProjectId}
      />
    </div>
  );
}
