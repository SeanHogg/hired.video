/**
 * Self-gating "Unpublished edits" badge for project tiles + cards.
 *
 * Visible only when:
 *   1. The auth'd viewer is the project owner (otherwise non-owners
 *      would see a meaningless "unpublished" label on someone else's
 *      content).
 *   2. The project has authoring state (`timelineSpec`) but no fresh
 *      baked artifact — either never rendered, or rendered an older
 *      version. Delegates the freshness decision to the shared
 *      `isProjectBakedFresh()` so no consumer re-derives staleness.
 *
 * Returns null in every other case — callers mount `<UnpublishedEditsBadge />`
 * unconditionally and the component decides whether to render.
 *
 * Surfaces: project chooser tiles, EntityVideos rail (resume page),
 * any future "My videos" widget. One component, one rule.
 */
import { Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isProjectBakedFresh } from "@/lib/studio/baked-freshness";
import type { StudioProject } from "@/lib/services/studio-service";
import { cn } from "@/lib/utils";

export interface UnpublishedEditsBadgeProps {
  project: StudioProject;
  className?: string;
}

export default function UnpublishedEditsBadge({
  project,
  className,
}: UnpublishedEditsBadgeProps) {
  const { user } = useAuth();
  if (!user || project.userId !== user.id) return null;
  if (!project.timelineSpec) return null;
  if (isProjectBakedFresh(project)) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur",
        className,
      )}
      title="You have edits that haven't been published yet. Open the project and click Publish to update the public version."
    >
      <Pencil className="h-2.5 w-2.5" />
      Unpublished edits
    </span>
  );
}
