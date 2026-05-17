// Self-gating "Watch Demo" CTA used on marketing surfaces (Resumes hero,
// future landings). Resolves the SuperAdmin-curated featured public video
// (singleton enforced by migration 0088's partial unique index on
// videos.is_featured) and opens it in a Dialog with <VideoPlayer>.
//
// Per DRY: the data fetch, the selection rule (only is_featured=true),
// the modal chrome, and the empty-state gate all live in here — callers
// just drop <WatchFeaturedVideoButton /> in and pass Button styling props.
// If no featured video is set, the button renders nothing instead of
// being a dead CTA.

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import VideoPlayer, { type VideoPlayerSource } from "@/components/VideoPlayer";
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
      .getPublicVideos()
      .then((res) => {
        if (cancelled) return;
        const featured = (res.data ?? []).find((v) => v.isFeatured) ?? null;
        setVideo(featured);
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
        <VideoPlayer
          source={source}
          title={video!.title}
          poster={video!.thumbnailUrl ?? undefined}
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
function toPlayerSource(v: PublicVideo): VideoPlayerSource | null {
  if (v.youtubeVideoId) return { kind: "youtube", videoId: v.youtubeVideoId };
  if (v.videoUrl) return { kind: "url", url: v.videoUrl };
  return null;
}
