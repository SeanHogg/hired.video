/**
 * Scene-flavoured wrapper around the shared `<UnitActionButtons>`. Kept
 * as a thin adapter so the PropertiesPanel header (and any other
 * scene-specific call site) keeps its scene-named API while the actual
 * Duplicate/Delete chrome lives in ONE place per the DRY rule
 * (`feedback_extract_on_duplication`). The left-rail cards no longer use
 * this — they go through `<UnitsRail>` directly — but the header still
 * speaks "scene".
 */
import UnitActionButtons from "./UnitActionButtons";

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
  return (
    <UnitActionButtons
      unitId={sceneId}
      unitLabel={sceneLabel}
      unitNoun="scene"
      count={sceneCount}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      size={size}
      className={className}
    />
  );
}
