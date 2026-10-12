/**
 * Visual theme picker — the 5-preset grid (Hook-Led, Story-Led, etc.)
 * shared between the v1 classic sidebar and the v2 canvas editor's
 * Design panel.
 *
 * Per the standing DRY rule: both editors mount THIS component instead
 * of re-rolling their own theme grid. The picker reads the catalog from
 * `lib/studio/visual-themes.ts` (single source of truth) and emits the
 * selected theme id via `onSelect`. Application logic (how the theme
 * mutates the editor's state) is owned by the parent — the picker has
 * no opinion on whether you're updating a Timeline JSON, a CanvasState,
 * or a legacy storyboard.
 */
import { VISUAL_THEMES, type VisualTheme } from "@/lib/studio/visual-themes";
import { cn } from "@/lib/utils";
import { writeDragPayload } from "@/lib/studio/editor-v2/drag-protocol";

export interface VisualThemePickerProps {
  /** Currently-applied theme id (matches `VisualTheme.id`). Optional —
   *  callers that don't track a "current" theme can omit it. */
  activeThemeId?: string | null;
  onSelect: (theme: VisualTheme) => void;
  className?: string;
}

export default function VisualThemePicker({
  activeThemeId,
  onSelect,
  className,
}: VisualThemePickerProps) {
  return (
    <div className={cn("grid grid-cols-1 gap-2", className)}>
      {VISUAL_THEMES.map((theme) => {
        const active = theme.id === activeThemeId;
        return (
          <button
            key={theme.id}
            type="button"
            draggable
            onDragStart={(e) =>
              writeDragPayload(e.dataTransfer, {
                kind: "theme",
                data: theme.id,
              })
            }
            onClick={() => onSelect(theme)}
            className={cn(
              "group rounded-lg border bg-card p-2.5 text-left transition hover:border-brand-primary",
              active
                ? "border-brand-primary ring-2 ring-brand-primary/30"
                : "border-border",
            )}
          >
            <div className="mb-2 flex h-4 overflow-hidden rounded">
              {theme.colors.map((color, idx) => (
                <div
                  key={`${theme.id}-${idx}`}
                  className="flex-1"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <p className="text-xs font-medium">{theme.label}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
              {theme.desc}
            </p>
          </button>
        );
      })}
    </div>
  );
}
