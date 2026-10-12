// Self-gating "Watch Demo" CTA used on marketing surfaces (Resumes hero,
// future landings). Hits the SA-curated featured feed and opens the
// most-recently-promoted video in a Dialog. The set can be N>=0 since
// the 0088 singleton was dropped in 0090; this button picks the lead
// row so a single CTA doesn't try to multiplex.
//
// Per DRY: the data fetch, the selection rule, the modal chrome, and
// the empty-state gate all live in here — callers just drop
// <WatchFeaturedVideoButton /> in and pass Button styling props.
// If no featured video is set, the button renders nothing.

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import StudioVideoSurface, {
  type FlatVideoSource,
} from "@/components/studio/StudioVideoSurface";
import { studioService, type PublicVideo } from "@/lib/services/studio-service";

interface Props {
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}

export default function WatchFeaturedVideoButton({
  label = "Watch Demo",
  size = "lg",
  variant = "outline",
  className,
}: Props) {
  const [video, setVideo] = useState<PublicVideo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    studioService
      .getFeaturedVideos()
      .then((res) => {
        if (cancelled) return;
        setVideo((res.data ?? [])[0] ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const source = video ? toPlayerSource(video) : null;
  if (!source) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Play className="mr-2 h-5 w-5" />
        {label}
      </Button>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{video!.title}</DialogTitle>
        </DialogHeader>
        <StudioVideoSurface
          mode="flat"
          source={source}
          title={video!.title}
          controls
          autoPlay
        />
      </DialogContent>
    </Dialog>
  );
}

// Prefer YouTube iframe over a native <video> tag pointed at a YouTube URL —
// the API sets videoUrl = youtubeUrl when youtubeUrl is present, but only
// the iframe branch can actually play that.
function toPlayerSource(v: PublicVideo): FlatVideoSource | null {
  if (v.youtubeVideoId) return { kind: "youtube", videoId: v.youtubeVideoId };
  if (v.videoUrl) return { kind: "url", url: v.videoUrl, poster: v.thumbnailUrl ?? null };
  return null;
}
