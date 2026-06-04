/**
 * LevelsRail — the game kind's left-side list of levels. A thin wrapper
 * over the generic `<UnitsRail>` (the same rail Scenes and Frames use):
 * it supplies the level-shaped card body (colour strip + rename input +
 * start-level star + background-colour picker + sprite count) and
 * forwards the mutation callbacks. Add / Duplicate / Delete / reorder +
 * the active ring + drag handle all come from `<UnitsRail>` so every
 * kind's rail stays consistent (DRY: `feedback_extract_on_duplication`).
 *
 * Every mutation flows through the pure helpers in
 * `lib/studio/game/game-state-edit.ts`; this component is chrome around
 * those helpers, not a parallel data-model.
 */
import { Star, StarOff } from "lucide-react";
import type { GameState } from "@shared/game-state";
import {
  addLevel,
  deleteLevel,
  duplicateLevel,
  reorderLevels,
  setStartLevel,
  updateLevel,
} from "@/lib/studio/game/game-state-edit";
import { cn } from "@/lib/utils";
import UnitsRail from "@/components/studio/v2/UnitsRail";

export interface LevelsRailProps {
  gameState: GameState;
  onChange: (next: GameState) => void;
  activeLevelId: string | null;
  onSelect: (levelId: string) => void;
}

export default function LevelsRail({
  gameState,
  onChange,
  activeLevelId,
  onSelect,
}: LevelsRailProps) {
  function handleAdd() {
    const { state, level } = addLevel(gameState);
    onChange(state);
    onSelect(level.id);
  }

  function handleDuplicate(levelId: string) {
    const { state, level } = duplicateLevel(gameState, levelId);
    onChange(state);
    onSelect(level.id);
  }

  function handleDelete(levelId: string) {
    onChange(deleteLevel(gameState, levelId));
    if (levelId === activeLevelId) {
      const fallback = gameState.levels.find((l) => l.id !== levelId);
      if (fallback) onSelect(fallback.id);
    }
  }

  return (
    <UnitsRail
      title="Levels"
      unitNoun="level"
      units={gameState.levels}
      getId={(l) => l.id}
      getLabel={(l) => l.label}
      activeId={activeLevelId}
      onSelect={onSelect}
      onAdd={handleAdd}
      onDuplicate={handleDuplicate}
      onDelete={handleDelete}
      onReorder={(ids) => onChange(reorderLevels(gameState, ids))}
      renderBody={({ unit: level, index, onSelect: selectLevel }) => {
        const isStart = level.id === gameState.startLevelId;
        return (
          <div className="block w-full">
            <button
              type="button"
              onClick={selectLevel}
              className="block w-full"
              aria-pressed={level.id === activeLevelId}
            >
              {/* Colour preview strip — quick visual marker of the
                  level's background colour. */}
              <div
                className="h-12 w-full rounded-t-md"
                style={{ backgroundColor: level.backgroundColor }}
              />
              <div className="flex items-center gap-1 px-2 py-1.5">
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <input
                  value={level.label}
                  onChange={(e) =>
                    onChange(updateLevel(gameState, level.id, { label: e.target.value }))
                  }
                  onClick={(e) => e.stopPropagation()}
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none focus:ring-1 focus:ring-brand-purple"
                  aria-label={`Level ${index + 1} label`}
                />
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {level.sprites.length}
                </span>
              </div>
            </button>
            <div className="flex items-center gap-2 border-t border-border px-2 py-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(setStartLevel(gameState, level.id));
                }}
                title={isStart ? "Start level" : "Set as start level"}
                className={cn(
                  "shrink-0 rounded p-0.5",
                  isStart
                    ? "text-amber-500"
                    : "text-muted-foreground hover:text-amber-500",
                )}
              >
                {isStart ? (
                  <Star className="h-3.5 w-3.5 fill-current" />
                ) : (
                  <StarOff className="h-3.5 w-3.5" />
                )}
              </button>
              <input
                type="color"
                value={level.backgroundColor}
                onChange={(e) =>
                  onChange(updateLevel(gameState, level.id, { backgroundColor: e.target.value }))
                }
                onClick={(e) => e.stopPropagation()}
                className="h-5 w-5 shrink-0 cursor-pointer rounded border border-border"
                title="Background color"
                aria-label="Background color"
              />
            </div>
          </div>
        );
      }}
    />
  );
}
