/**
 * Self-gating "Publish edits" button surfaced in the studio editor
 * header next to the Save menu.
 *
 * Visible only when:
 *   1. There's a persisted project to publish against AND
 *   2. The project has authoring state (`timelineSpec`) AND
 *   3. The baked artifact is missing or stale —
 *      `isProjectBakedFresh(project) === false`.
 *
 * Returns null in every other case — callers mount
 * `<PublishEditsButton />` unconditionally and the component decides
 * whether to render. Shares the exact freshness primitive used by
 * `<UnpublishedEditsBadge/>` so the badge that owners see on their
 * project tiles and the action they need to clear it can never disagree
 * about "is there something to publish?".
 *
 * The button doesn't own the render pipeline — it forwards to `onPublish`
 * which in `StudioEditorV2` calls `ensureRendered()` (render + upload +
 * stamp bakedHash). Once that resolves, `isProjectBakedFresh` flips true
 * and both the badge AND this button disappear automatically.
 */
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isProjectBakedFresh } from "@/lib/studio/baked-freshness";
import type { StudioProject } from "@/lib/services/studio-service";
import { cn } from "@/lib/utils";

export interface PublishEditsButtonProps {
  project: StudioProject | null;
  /** Render + upload trigger. Receives no args; the parent's handler
   *  owns the destination (currently `ensureRendered` — pushes the
   *  fresh MP4 + stamps `_meta.bakedHash` on the project row). */
  onPublish: () => void;
  /** True while the parent's render pipeline is in flight. Disables the
   *  button + swaps the icon for a spinner. */
  busy?: boolean;
  className?: string;
}

export default function PublishEditsButton({
  project,
  onPublish,
  busy = false,
  className,
}: PublishEditsButtonProps) {
  if (!project) return null;
  if (!project.timelineSpec) return null;
  if (isProjectBakedFresh(project)) return null;

  // Project has already been rendered once but the user has new edits =>
  // "Republish". Never rendered yet => "Publish". One button, two labels,
  // no consumer branching.
  const label = project.videoUrl ? "Republish" : "Publish";
  const title = project.videoUrl
    ? "Re-render with your latest edits so the public version updates."
    : "Render this video and make it available on your project's surfaces.";

  return (
    <Button
      size="sm"
      variant="secondary"
      className={cn(
        "h-7 gap-1.5 text-xs px-3 bg-amber-500 hover:bg-amber-600 text-white",
        className,
      )}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onPublish();
      }}
      title={title}
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Upload className="w-3.5 h-3.5" />
      )}
      <span className="truncate">{busy ? "Publishing…" : label}</span>
    </Button>
  );
}
