/**
 * LevelsRail — left-side list of game levels. Parallel to
 * `<ScenesRail>` for Timeline-runtime kinds: same shell slot, same
 * "click to focus the canvas / click + to add new / star to mark as
 * start" interaction model. Mounted by `<StudioEditorV2>` for
 * `mediaKind: "game"` projects.
 *
 * The shell-level decision ("game → LevelsRail, video → ScenesRail")
 * lives in `StudioEditorV2`'s left-panel branch. Each rail is
 * runtime-shaped and owns its own data model (Scene vs GameLevel).
 *
 * Per the DRY rule: every mutation flows through pure helpers in
 * `lib/studio/game/game-state-edit.ts`. This component is the chrome
 * around those helpers, not a parallel data-model.
 */
import { Plus, Star, StarOff, Trash2 } from "lucide-react";
import type { GameLevel, GameState } from "@shared/game-state";
import {
  addLevel,
  deleteLevel,
  setStartLevel,
  updateLevel,
} from "@/lib/studio/game/game-state-edit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

  function handleDelete(levelId: string) {
    onChange(deleteLevel(gameState, levelId));
    if (levelId === activeLevelId) {
      const fallback = gameState.levels.find((l) => l.id !== levelId);
      if (fallback) onSelect(fallback.id);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Levels
        </h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleAdd}
          className="h-7 gap-1 px-2 text-xs"
          aria-label="Add level"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      <ol
        className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 py-2"
        style={{ scrollbarGutter: "stable" }}
      >
        {gameState.levels.map((level, idx) => (
          <LevelCard
            key={level.id}
            level={level}
            index={idx}
            isActive={level.id === activeLevelId}
            isStart={level.id === gameState.startLevelId}
            canDelete={gameState.levels.length > 1}
            onSelect={() => onSelect(level.id)}
            onRename={(label) => onChange(updateLevel(gameState, level.id, { label }))}
            onRecolor={(backgroundColor) =>
              onChange(updateLevel(gameState, level.id, { backgroundColor }))
            }
            onSetStart={() => onChange(setStartLevel(gameState, level.id))}
            onDelete={() => handleDelete(level.id)}
          />
        ))}
      </ol>
    </div>
  );
}

function LevelCard({
  level,
  index,
  isActive,
  isStart,
  canDelete,
  onSelect,
  onRename,
  onRecolor,
  onSetStart,
  onDelete,
}: {
  level: GameLevel;
  index: number;
  isActive: boolean;
  isStart: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onRename: (next: string) => void;
  onRecolor: (next: string) => void;
  onSetStart: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={cn(
        "group rounded-md border bg-card text-left transition-colors",
        isActive ? "border-fuchsia-500 ring-2 ring-fuchsia-500/30" : "border-border hover:border-fuchsia-300",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="block w-full"
        aria-pressed={isActive}
      >
        {/* Color preview strip — quick visual marker of the level's
            background colour. */}
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
            onChange={(e) => onRename(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none focus:ring-1 focus:ring-fuchsia-500"
            aria-label={`Level ${index + 1} label`}
          />
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {level.sprites.length}
          </span>
        </div>
      </button>
      <div className="flex items-center justify-between border-t border-border px-2 py-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSetStart();
          }}
          title={isStart ? "Start level" : "Set as start level"}
          className={cn(
            "shrink-0 rounded p-0.5",
            isStart ? "text-amber-500" : "text-muted-foreground hover:text-amber-500",
          )}
        >
          {isStart ? <Star className="h-3.5 w-3.5 fill-current" /> : <StarOff className="h-3.5 w-3.5" />}
        </button>
        <input
          type="color"
          value={level.backgroundColor}
          onChange={(e) => onRecolor(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="h-5 w-5 shrink-0 cursor-pointer rounded border border-border"
          title="Background color"
          aria-label="Background color"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={!canDelete}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-rose-600 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
          title={canDelete ? "Delete level" : "Need at least one level"}
          aria-label="Delete level"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}
