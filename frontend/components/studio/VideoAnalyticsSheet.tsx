// Slide-out shell around <VideoAnalyticsDashboard>. Hosted as a Sheet so the
// editor pages can mount it from the Share dropdown without giving up canvas
// real estate. Self-gates on `videoId` — renders an empty-state body when no
// video has been published yet rather than calling the analytics endpoint.

import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const VideoAnalyticsDashboard = lazy(
  () => import("@/components/studio/VideoAnalyticsDashboard"),
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: string | null;
  videoTitle?: string;
  videoDurationSec?: number;
}

export default function VideoAnalyticsSheet({
  open,
  onOpenChange,
  videoId,
  videoTitle,
  videoDurationSec,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>
            {videoTitle ? `Analytics — ${videoTitle}` : "Video analytics"}
          </SheetTitle>
          <SheetDescription>
            Views, CTA clicks, watch time, drop-off heatmap, and viewer
            breakdown for this video.
          </SheetDescription>
        </SheetHeader>

        {videoId ? (
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading analytics…
              </div>
            }
          >
            <VideoAnalyticsDashboard
              videoId={videoId}
              videoDurationSec={videoDurationSec}
            />
          </Suspense>
        ) : (
          <p className="text-sm text-muted-foreground py-10 text-center">
            Render and publish this video first to start collecting analytics.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
