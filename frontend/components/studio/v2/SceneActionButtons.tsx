/**
 * Shared Delete + Duplicate buttons for a scene. Used by the ScenesRail
 * thumbnail hover-strip AND by the PropertiesPanel header when a scene
 * is selected — the consumers don't pass a `canX` boolean (DRY rule);
 * they hand over the scene id + the count of scenes so this component
 * self-gates whether Delete is allowed (refuses to delete the last
 * scene, which would break the "always one scene to draw on" editor
 * invariant).
 */
import { Copy, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SceneActionButtonsProps {
  sceneId: string;
  sceneLabel: string;
  /** Number of scenes total — when 1 the delete button self-disables. */
  sceneCount: number;
  onDuplicate: (sceneId: string) => void;
  onDelete: (sceneId: string) => void;
  /** Compact (icon-only, 24px) for scene cards; `"normal"` (icon + label,
   *  28px) for the header. */
  size?: "compact" | "normal";
  className?: string;
}

export default function SceneActionButtons({
  sceneId,
  sceneLabel,
  sceneCount,
  onDuplicate,
  onDelete,
  size = "compact",
  className,
}: SceneActionButtonsProps) {
  const canDelete = sceneCount > 1;
  const isCompact = size === "compact";
  const iconClass = isCompact ? "h-3.5 w-3.5" : "h-4 w-4";
  const buttonClass = cn(
    isCompact
      ? "flex h-6 w-6 items-center justify-center rounded text-muted-foreground"
      : "flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground",
  );
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate(sceneId);
        }}
        aria-label={`Duplicate ${sceneLabel}`}
        title="Duplicate scene"
        className={cn(buttonClass, "hover:bg-muted hover:text-foreground")}
      >
        <Copy className={iconClass} />
        {!isCompact && <span>Duplicate</span>}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!canDelete) return;
          onDelete(sceneId);
        }}
        aria-label={`Delete ${sceneLabel}`}
        title={canDelete ? "Delete scene" : "Can't delete the last scene"}
        disabled={!canDelete}
        className={cn(
          buttonClass,
          canDelete
            ? "hover:bg-destructive/10 hover:text-destructive"
            : "cursor-not-allowed opacity-40",
        )}
      >
        <Trash2 className={iconClass} />
        {!isCompact && <span>Delete</span>}
      </button>
    </div>
  );
}
