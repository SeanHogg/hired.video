// Slide-out shell around <VideoAnalyticsDashboard>. Hosted as a Sheet so the
// editor pages can mount it from the Share dropdown without giving up canvas
// real estate. Self-gates on `projectId` — renders an empty-state body when
// no project has been persisted yet rather than calling the analytics
// endpoint. Analytics are project-keyed post-#665 (migration 0085).

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
  projectId: string | null;
  videoTitle?: string;
  videoDurationSec?: number;
}

export default function VideoAnalyticsSheet({
  open,
  onOpenChange,
  projectId,
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

        {projectId ? (
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading analytics…
              </div>
            }
          >
            <VideoAnalyticsDashboard
              projectId={projectId}
              videoDurationSec={videoDurationSec}
            />
          </Suspense>
        ) : (
          <p className="text-sm text-muted-foreground py-10 text-center">
            Save this project first to start collecting analytics.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
