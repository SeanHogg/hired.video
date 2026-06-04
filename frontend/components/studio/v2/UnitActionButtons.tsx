/**
 * Shared Duplicate + Delete buttons for ONE authorable unit in a left
 * rail — a scene (video / podcast / voice / comic), a level (game), or a
 * frame (animation). The unit name differs per kind but the affordance
 * is identical, so per the DRY rule (`feedback_extract_on_duplication`)
 * every rail and the PropertiesPanel header share this one component
 * instead of re-implementing the dup/delete pair.
 *
 * Consumers DON'T pass a `canDelete` boolean — they hand over the unit
 * count and this component self-gates whether Delete is allowed (refuses
 * to delete the last unit, which would break the "always one thing to
 * author on" editor invariant). Duplicate is OPTIONAL: rails whose unit
 * model has no copy semantics simply omit `onDuplicate` and the button
 * drops out.
 */
import { Copy, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UnitActionButtonsProps {
  unitId: string;
  /** Human label for aria / titles, e.g. the scene label or "Frame 3". */
  unitLabel: string;
  /** Lower-case noun for tooltips, e.g. "scene" / "level" / "frame". */
  unitNoun?: string;
  /** Total number of units — when 1 the Delete button self-disables. */
  count: number;
  /** Omit to hide the Duplicate button for rails without copy semantics. */
  onDuplicate?: (unitId: string) => void;
  onDelete: (unitId: string) => void;
  /** Compact (icon-only, 24px) for cards; `"normal"` (icon + label, 28px)
   *  for the PropertiesPanel header. */
  size?: "compact" | "normal";
  className?: string;
}

export default function UnitActionButtons({
  unitId,
  unitLabel,
  unitNoun = "item",
  count,
  onDuplicate,
  onDelete,
  size = "compact",
  className,
}: UnitActionButtonsProps) {
  const canDelete = count > 1;
  const isCompact = size === "compact";
  const iconClass = isCompact ? "h-3.5 w-3.5" : "h-4 w-4";
  const buttonClass = cn(
    isCompact
      ? "flex h-6 w-6 items-center justify-center rounded text-muted-foreground"
      : "flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground",
  );
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {onDuplicate && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(unitId);
          }}
          aria-label={`Duplicate ${unitLabel}`}
          title={`Duplicate ${unitNoun}`}
          className={cn(buttonClass, "hover:bg-muted hover:text-foreground")}
        >
          <Copy className={iconClass} />
          {!isCompact && <span>Duplicate</span>}
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!canDelete) return;
          onDelete(unitId);
        }}
        aria-label={`Delete ${unitLabel}`}
        title={canDelete ? `Delete ${unitNoun}` : `Can't delete the last ${unitNoun}`}
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
