/**
 * GameStage — the canvas runtime for `mediaKind: "game"` studio
 * projects. Parallel to `<CanvasStage>` (the Timeline runtime's stage)
 * per the canvas-runtime extensibility model in PRD §1.2.
 *
 * Phase 1 (this file) ships a PLACEHOLDER that renders the game's
 * current state visually without executing any game logic:
 *   - Level backdrop painted as the canvas background
 *   - Each sprite drawn as a labelled rectangle at its design-time
 *     position, sized to the sprite's width × height
 *   - A "Phaser engine — coming soon" overlay so the user knows the
 *     authoring surface is here but the engine isn't wired yet
 *
 * Phase 2 (Consolidated Gap Register #927 follow-up) swaps the
 * placeholder for an actual Phaser 3 canvas that boots from the game
 * state + supports sprite placement, behavior editing, and playtest.
 *
 * Per the DRY rule: this component SELF-DERIVES from `project.gameState`
 * — caller passes the StudioProject envelope and the stage reads the
 * runtime-specific state column it owns. Mirrors how `<CanvasStage>`
 * reads from `state.scenes`.
 */
import { Gamepad2, Sparkles } from "lucide-react";
import { findStartLevel, type GameState } from "@shared/game-state";
import { cn } from "@/lib/utils";

interface GameStageProps {
  /** GameState pulled from `studioProject.gameState`. Null when the
   *  project hasn't been seeded yet (legacy rows without the column,
   *  or a brand-new draft that hasn't written yet). The stage renders
   *  a "no game yet" empty state in that case. */
  gameState: GameState | null;
  /** Zoom multiplier — same contract as `<CanvasStage>` so the
   *  surrounding chrome (zoom control, fit-to-stage button) keeps
   *  working without per-runtime branches. */
  zoom: number;
  className?: string;
}

export default function GameStage({
  gameState,
  zoom,
  className,
}: GameStageProps) {
  // No game state yet — brand-new draft or legacy row without the
  // column. Render a friendly empty state pointing the user at the
  // template chooser. Self-gates the "this is a game" affordance.
  if (!gameState) {
    return (
      <div
        className={cn(
          "flex aspect-video w-[640px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground",
          className,
        )}
      >
        <Gamepad2 className="h-10 w-10 text-fuchsia-500" />
        <p className="mt-2 text-sm font-medium">Game canvas</p>
        <p className="mt-1 text-xs">Pick a game template to seed your first level.</p>
      </div>
    );
  }

  const level = findStartLevel(gameState);
  if (!level) {
    return (
      <div
        className={cn(
          "flex aspect-video w-[640px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground",
          className,
        )}
      >
        <Sparkles className="h-8 w-8" />
        <p className="mt-2 text-xs">This game has no levels yet.</p>
      </div>
    );
  }

  // Scale design-time pixels by the zoom multiplier so sprite positions
  // + sizes stay correct relative to the level's design dimensions.
  // Sprite positions stored in GameState are absolute pixels at the
  // design resolution; the runtime + this preview both scale uniformly.
  const stageStyle: React.CSSProperties = {
    width: `${gameState.width * zoom}px`,
    height: `${gameState.height * zoom}px`,
    backgroundColor: level.backgroundColor,
  };

  return (
    <div className={cn("relative", className)}>
      <div
        className="relative overflow-hidden rounded-md shadow-lg"
        style={stageStyle}
        aria-label={`Game preview — ${level.label}`}
      >
        {/* Sprites painted as labelled rectangles at their design
            positions. The runtime (Phase 2) replaces these with actual
            Phaser sprites pulled from the asset manifest. */}
        {level.sprites.map((sprite) => (
          <div
            key={sprite.id}
            className="absolute flex items-center justify-center rounded-sm bg-white/15 ring-1 ring-white/40 backdrop-blur-sm"
            style={{
              left: `${sprite.x * zoom}px`,
              top: `${sprite.y * zoom}px`,
              width: `${sprite.width * zoom}px`,
              height: `${sprite.height * zoom}px`,
            }}
            title={`${sprite.id}${sprite.behavior ? ` · ${sprite.behavior}` : ""}`}
          >
            <span className="truncate px-1 text-[10px] font-semibold text-white drop-shadow">
              {sprite.id}
            </span>
          </div>
        ))}

        {/* "Coming soon" overlay — self-evident affordance that this
            canvas isn't fully wired yet. Removed by the Phase 2 Phaser
            integration pass. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 py-2">
          <Gamepad2 className="h-4 w-4 text-fuchsia-300" />
          <span className="text-[11px] font-semibold text-white">
            Phaser engine — coming soon (level layout shown)
          </span>
        </div>
      </div>
    </div>
  );
}
