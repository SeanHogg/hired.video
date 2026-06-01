/**
 * GameStage — the canvas runtime surface for `mediaKind: "game"` studio
 * projects. Parallel to `<CanvasStage>` (the Timeline runtime's stage)
 * per the canvas-runtime extensibility model in PRD §1.2.
 *
 * Two modes — same component, same runtime under the hood. Mirrors
 * `<CanvasStage mode="edit" | "playback">`:
 *
 *   - `mode="edit"` — static layout render. Sprites paint with their
 *     authored positions; selection / click-to-select chrome runs in
 *     this component (the runtime stays editor-agnostic so the export
 *     bundle isn't carrying editor code). Mounted by StudioEditorV2.
 *
 *   - `mode="play"` — game loop runs the runtime. Arrow keys drive
 *     `platformer-player`, clicks drive `quiz-answer` / `memory-card`.
 *     Selection chrome is suppressed (the player is playing, not
 *     authoring). Mounted by the editor's Playtest toggle + by
 *     `<ProjectPlayer>` on entity cards + the public `/v/:slug` page.
 *
 * The exported HTML5 bundle uses the SAME runtime module bundled
 * standalone. Three surfaces, one runtime — DRY commitment from PRD §1.2.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Gamepad2, Sparkles } from "lucide-react";
import type { GameLevel, GameState } from "@shared/game-state";
import { runGame, findStartLevel } from "@/lib/studio/game/runtime";
import { cn } from "@/lib/utils";

// 3D runtime — lazy because Three.js + R3F + Rapier add ~600KB gzipped
// that 2D-mini-game projects shouldn't pay for. Loaded only when the
// project's `engine` discriminator demands the 3D path.
const GameStage3D = lazy(() => import("./GameStage3D"));

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
  /** Editor-side level the user is currently focused on. The runtime
   *  renders THIS level in edit mode (so the user sees the level they
   *  picked from the rail). Unset = falls back to the GameState's
   *  startLevelId. ProjectPlayer doesn't pass this so playback always
   *  starts at the authored start level. */
  activeLevelId?: string | null;
  /** Editor-side selected sprite. Drawn with a dashed outline in edit
   *  mode; ignored in play mode. */
  selectedSpriteId?: string | null;
  /** Click-to-select handler. Fires in edit mode when the user clicks
   *  on the canvas: receives the topmost-hit sprite id, or null when
   *  the click landed on empty canvas (deselect). ProjectPlayer
   *  doesn't pass this so play mode keeps its own click semantics
   *  (memory-card flip / quiz-answer pick). */
  onSelectSprite?: (spriteId: string | null) => void;
  /** Drag-to-move handler. Fires in edit mode while the user drags a
   *  sprite on the canvas: receives the new x/y in design-time
   *  pixels. Caller threads through `updateSprite`. ProjectPlayer
   *  doesn't pass this so the player can't accidentally drag the
   *  game out of shape. */
  onMoveSprite?: (spriteId: string, x: number, y: number) => void;
  /** Hide the runtime-status annotation strip. ProjectPlayer surfaces
   *  (entity cards + public pages) don't want the annotation
   *  bleeding into the playback view; the editor preview does. */
  hideRuntimeBanner?: boolean;
  /** Whole-GameState writer — required for `engine === "world-3d"`
   *  projects (3D editor mutates the world graph in many shapes;
   *  threading per-field handlers would bloat the prop surface). The
   *  2D path keeps the fine-grained `onSelectSprite` / `onMoveSprite`
   *  handlers because their interactions are simpler. ProjectPlayer
   *  doesn't pass this so the public-page play surface stays
   *  read-only. */
  onChange?: (next: GameState) => void;
  /** Persisted project id — passed through to the 3D runtime so the
   *  AI agent + invite endpoints can address the row. Null = unsaved
   *  draft; the affected panels gracefully degrade. */
  projectId?: string | null;
  /** 3D entity selection bus — shared with the studio's right-rail
   *  Game3DPropertiesPanel. Forwarded to `<GameStage3D>` when the
   *  engine demands 3D; ignored on the 2D path (which has its own
   *  fine-grained sprite-selection handlers). */
  selectedEntityId?: string | null;
  onSelectEntity?: (entityId: string | null) => void;
  className?: string;
}

export default function GameStage({
  gameState,
  zoom,
  mode = "edit",
  activeLevelId = null,
  selectedSpriteId = null,
  onSelectSprite,
  onMoveSprite,
  hideRuntimeBanner = false,
  onChange,
  projectId = null,
  selectedEntityId = null,
  onSelectEntity,
  className,
}: GameStageProps) {
  // 3D-runtime dispatch lives AFTER the 2D hooks below (#1870): React
  // hooks must run unconditionally, so we can't early-return for the
  // world-3d engine before them. See the dispatch just before the 2D
  // render guards. (Single dispatch point per the canvas-runtime
  // extensibility model, PRD §1.2.)

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Drag state — set on pointer-down on a sprite; cleared on
  // pointer-up. `offsetX/Y` records the click offset within the
  // sprite's bbox so dragging doesn't snap the cursor to the
  // top-left corner.
  const dragRef = useRef<{ spriteId: string; offsetX: number; offsetY: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  // Mount / unmount the runtime when gameState, mode, activeLevelId,
  // or selection changes. The runtime owns its own rAF loop + listener
  // lifecycle; the cleanup it returns is the only thing this component
  // touches on unmount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState) return;
    const handle = runGame(canvas, gameState, {
      mode,
      activeLevelId: activeLevelId ?? undefined,
      selectedSpriteId: selectedSpriteId ?? null,
    });
    return handle.cleanup;
  }, [gameState, mode, activeLevelId, selectedSpriteId]);

  // Resolve the level the editor is viewing — needed for the
  // click-to-select hit-test below. Mirrors the runtime's fallback so
  // selection works even when activeLevelId is stale.
  const level: GameLevel | null = gameState
    ? (activeLevelId
        ? gameState.levels.find((l) => l.id === activeLevelId) ?? findStartLevel(gameState)
        : findStartLevel(gameState))
    : null;

  // Convert a pointer event's clientX/Y into design-time canvas
  // coordinates. Used by both the select-on-click and the drag-to-move
  // handlers — extracted so the two share one coordinate mapping
  // (DRY: no two ways for the editor to think about the canvas).
  const toCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height),
      };
    },
    [],
  );

  // Hit-test sprites in paint-order (topmost wins). Shared by the
  // click-to-select + drag-to-move handlers.
  const hitTestSprite = useCallback(
    (cx: number, cy: number) => {
      if (!level) return null;
      for (let i = level.sprites.length - 1; i >= 0; i--) {
        const s = level.sprites[i];
        if (cx >= s.x && cx <= s.x + s.width && cy >= s.y && cy <= s.y + s.height) {
          return s;
        }
      }
      return null;
    },
    [level],
  );

  // Edit-mode pointer-down — starts a drag if the click lands on a
  // sprite AND the caller wired `onMoveSprite`; otherwise treated as a
  // selection click on pointer-up (handled below). Play mode has its
  // own click semantics inside the runtime so we don't intercept then.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (mode !== "edit" || !gameState || !level) return;
      const coords = toCanvasCoords(e.clientX, e.clientY);
      if (!coords) return;
      const hit = hitTestSprite(coords.x, coords.y);
      if (!hit) {
        // Empty-canvas click — deselect (passes null to caller).
        onSelectSprite?.(null);
        return;
      }
      // Pointer landed on a sprite → select + optionally start a drag.
      onSelectSprite?.(hit.id);
      if (onMoveSprite) {
        dragRef.current = {
          spriteId: hit.id,
          offsetX: coords.x - hit.x,
          offsetY: coords.y - hit.y,
        };
        setDragging(hit.id);
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    },
    [mode, gameState, level, toCanvasCoords, hitTestSprite, onSelectSprite, onMoveSprite],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag || !onMoveSprite) return;
      const coords = toCanvasCoords(e.clientX, e.clientY);
      if (!coords) return;
      onMoveSprite(drag.spriteId, Math.round(coords.x - drag.offsetX), Math.round(coords.y - drag.offsetY));
    },
    [toCanvasCoords, onMoveSprite],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (dragRef.current) {
        dragRef.current = null;
        setDragging(null);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // Some test harnesses (jsdom) don't implement
          // releasePointerCapture; swallow the throw so non-test
          // code paths stay clean.
        }
      }
    },
    [],
  );

  // 3D-runtime dispatch — projects authored with `engine === "world-3d"`
  // mount the R3F + Rapier stage instead of the 2D Canvas loop. Placed
  // AFTER the 2D hooks (which no-op without a mounted canvas) so React
  // sees a stable hook order regardless of engine (#1870). The host
  // (`StudioEditorV2`) wires both paths through the same setter.
  if (gameState?.engine === "world-3d") {
    return (
      <Suspense
        fallback={
          <div
            className={cn(
              "flex aspect-video w-[640px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground",
              className,
            )}
          >
            <Gamepad2 className="h-10 w-10 text-fuchsia-500 animate-pulse" />
            <p className="mt-2 text-xs">Loading 3D runtime…</p>
          </div>
        }
      >
        <GameStage3D
          gameState={gameState}
          mode={mode}
          onChange={onChange ?? (() => {})}
          projectId={projectId}
          zoom={zoom}
          selectedEntityId={selectedEntityId}
          onSelectEntity={onSelectEntity}
          hideRuntimeBanner={hideRuntimeBanner}
          className={className}
        />
      </Suspense>
    );
  }

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
        tabIndex={mode === "play" ? 0 : -1}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={cn(
            "block h-full w-full",
            mode === "edit" && onSelectSprite && (dragging ? "cursor-grabbing" : "cursor-pointer"),
          )}
        />

        {/* Status annotation — editor preview shows the current level
            label so the user can verify the rail selection drove the
            canvas. Playtest mode shows input affordances. */}
        {!hideRuntimeBanner && mode === "edit" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 py-2">
            <Gamepad2 className="h-4 w-4 text-fuchsia-300" />
            <span className="text-[11px] font-semibold text-white">
              {level.label} · click a sprite to edit, click empty canvas to deselect
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
