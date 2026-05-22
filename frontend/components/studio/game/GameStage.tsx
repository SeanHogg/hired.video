/**
 * GameStage — the canvas runtime surface for `mediaKind: "game"` studio
 * projects. Parallel to `<CanvasStage>` (the Timeline runtime's stage)
 * per the canvas-runtime extensibility model in PRD §1.2.
 *
 * Two modes — same component, same Phaser-replacement runtime under
 * the hood. Mirrors `<CanvasStage mode="edit" | "playback">`:
 *
 *   - `mode="edit"` — static layout render of `gameState`. Sprites
 *     show their authored positions + behavior label as colored
 *     rectangles. No game loop runs; the user sees what they laid
 *     out. Mounted by StudioEditorV2.
 *
 *   - `mode="play"` — game loop runs the runtime against `gameState`.
 *     Arrow keys drive `platformer-player`, clicks drive
 *     `quiz-answer` / `memory-card`. Behaviors interpreted via
 *     `lib/studio/game/runtime.ts`. Mounted by the editor's playtest
 *     button AND by `<ProjectPlayer>` on entity cards + the public
 *     `/v/:slug` page.
 *
 * The exported HTML5 bundle (#935 game-export) uses the SAME runtime
 * module, just bundled standalone. Three surfaces, one runtime — that's
 * the DRY commitment from PRD §1.2.
 */
import { useEffect, useRef } from "react";
import { Gamepad2, Sparkles } from "lucide-react";
import { findStartLevel, type GameState } from "@shared/game-state";
import { runGame } from "@/lib/studio/game/runtime";
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
  /** Edit-vs-play mode. Defaults to "edit" for the editor's mount;
   *  `<ProjectPlayer>` + the editor's playtest toggle pass "play". */
  mode?: "edit" | "play";
  /** Hide the "Phaser engine coming soon" annotation. ProjectPlayer
   *  surfaces (entity cards + public pages) don't want the annotation
   *  bleeding into the playback view; the editor preview does. */
  hideRuntimeBanner?: boolean;
  className?: string;
}

export default function GameStage({
  gameState,
  zoom,
  mode = "edit",
  hideRuntimeBanner = false,
  className,
}: GameStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Mount / unmount the runtime when gameState or mode changes. The
  // runtime owns its own rAF loop + listener lifecycle; the cleanup
  // it returns is the only thing this component touches on unmount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState) return;
    const handle = runGame(canvas, gameState, { mode });
    return handle.cleanup;
  }, [gameState, mode]);

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

  // Scale design-time pixels by zoom via CSS dimensions — the runtime
  // always thinks in design pixels (canvas.width = state.width). The
  // wrapper applies the zoom transform so the editor's existing
  // zoom-control + fit-to-stage chrome keeps working unchanged.
  const wrapperStyle: React.CSSProperties = {
    width: `${gameState.width * zoom}px`,
    height: `${gameState.height * zoom}px`,
  };

  return (
    <div className={cn("relative", className)}>
      <div
        className="relative overflow-hidden rounded-md shadow-lg"
        style={wrapperStyle}
        aria-label={`Game ${mode === "play" ? "playback" : "preview"} — ${level.label}`}
        // Keyboard input requires focus when the runtime is in play
        // mode. tabIndex=0 makes the wrapper focusable; the cursor on
        // hover signals it's interactive.
        tabIndex={mode === "play" ? 0 : -1}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          // The canvas's internal resolution is set by the runtime to
          // gameState.width × gameState.height. The block / w-full /
          // h-full above scales it to the wrapper via CSS so the
          // editor zoom multiplier flows through naturally.
        />

        {/* Runtime-status annotation — only on the editor preview
            (`hideRuntimeBanner=false`). Hidden on ProjectPlayer
            surfaces so entity-card playback reads as actual gameplay,
            not "coming soon" copy. Will be removed entirely once the
            Phaser 3 mount swaps in for #935's continuation. */}
        {!hideRuntimeBanner && mode === "edit" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 py-2">
            <Gamepad2 className="h-4 w-4 text-fuchsia-300" />
            <span className="text-[11px] font-semibold text-white">
              Layout preview · click Playtest to run
            </span>
          </div>
        )}
        {!hideRuntimeBanner && mode === "play" && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center gap-2 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-3 py-2">
            <Gamepad2 className="h-4 w-4 text-fuchsia-300" />
            <span className="text-[11px] font-semibold text-white">
              Playtest · arrows / WASD / space · click to interact
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
