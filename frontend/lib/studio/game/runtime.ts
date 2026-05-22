/**
 * Minimal game runtime — interprets a `GameState` (per
 * `shared/game-state.ts`) against a Canvas 2D context. The same runtime
 * is reused across three surfaces (PRD §1.2 canvas-runtime extensibility):
 *
 *   - `<GameStage mode="play">` in the editor's playtest button
 *   - `<ProjectPlayer>` on entity cards + the public `/v/:slug` page
 *   - The exported HTML5 bundle (#935 game-export) — same module bundled
 *     standalone so the exported game runs without re-implementing
 *
 * Phase 1 ships a deliberately minimal interpreter (~150 lines):
 *   - Canvas 2D, no WebGL / WebGPU
 *   - Per-behavior tickers: `static`, `scroll-left`, `platformer-player`,
 *     `quiz-answer`, `memory-card`, plus a no-op fallback for unknown
 *     behaviors so the runtime tolerates future additions
 *   - Sprites render as colored rectangles labelled with their id +
 *     behavior name (placeholder until asset loading lands)
 *   - Arrow-key input drives `platformer-player` (left / right / jump)
 *   - Click input drives `quiz-answer` + `memory-card`
 *
 * The full Phaser 3 mount is #935's continuation — drop-in replacement
 * for this module that keeps the same `runGame(canvas, state, opts)`
 * signature so consumers don't change.
 *
 * Returns a `cleanup` function the caller invokes on unmount (cancels
 * the rAF loop + removes event listeners) — no globals, no leaks.
 */

import type { GameState, GameLevel, GameSprite } from "@shared/game-state";
import { findStartLevel } from "@shared/game-state";

export interface RunGameOptions {
  /** "edit" → no game loop, static render of the level + sprites with
   *  selection chrome (caller-rendered overlay). "play" → game loop
   *  running, behaviors interpreted, input wired. */
  mode: "edit" | "play";
}

export interface RunGameHandle {
  /** Cleanup — cancels the loop + removes listeners. Idempotent. */
  cleanup: () => void;
}

interface RuntimeSprite {
  /** The source GameSprite — runtime mutations stay on `instance`
   *  fields so the original state is untouched (so an "exit play mode"
   *  swap-back to edit mode shows the user's authored positions, not
   *  whatever the player ran to). */
  source: GameSprite;
  x: number;
  y: number;
  vy: number;
  /** For memory-card behavior: whether the user has flipped this card. */
  flipped: boolean;
  /** For quiz-answer behavior: whether this answer has been picked. */
  picked: boolean;
}

/** Mount the runtime against a Canvas 2D context. */
export function runGame(
  canvas: HTMLCanvasElement,
  state: GameState,
  opts: RunGameOptions,
): RunGameHandle {
  const level = findStartLevel(state);
  if (!level) return { cleanup: () => {} };

  // Match the canvas internal resolution to the game's design resolution
  // so behaviour positions line up 1:1. CSS scales the canvas via the
  // wrapper element's width/height; the runtime always thinks in design
  // pixels.
  canvas.width = state.width;
  canvas.height = state.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return { cleanup: () => {} };

  // Instance state — start at the authored positions.
  const sprites: RuntimeSprite[] = level.sprites.map((source) => ({
    source,
    x: source.x,
    y: source.y,
    vy: 0,
    flipped: false,
    picked: false,
  }));

  // Input state — listeners updated continuously, behaviors read on tick.
  const keys = new Set<string>();
  const onKeyDown = (e: KeyboardEvent) => { keys.add(e.key); };
  const onKeyUp = (e: KeyboardEvent) => { keys.delete(e.key); };
  const onClick = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
    // Topmost hit wins (sprites array order = paint order).
    for (let i = sprites.length - 1; i >= 0; i--) {
      const s = sprites[i];
      if (sx >= s.x && sx <= s.x + s.source.width && sy >= s.y && sy <= s.y + s.source.height) {
        if (s.source.behavior === "memory-card") s.flipped = !s.flipped;
        if (s.source.behavior === "quiz-answer") s.picked = true;
        break;
      }
    }
  };

  if (opts.mode === "play") {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("click", onClick);
  }

  // Game loop.
  let rafId = 0;
  let lastTs = performance.now();
  const tick = (ts: number) => {
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    if (opts.mode === "play") {
      for (const sprite of sprites) updateSprite(sprite, dt, keys, level, canvas.width);
    }
    drawFrame(ctx, level, sprites);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return {
    cleanup: () => {
      cancelAnimationFrame(rafId);
      if (opts.mode === "play") {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        canvas.removeEventListener("click", onClick);
      }
    },
  };
}

/** Per-sprite per-frame update. Behaviors fall through unknown values
 *  as no-ops — tolerant of future behavior additions. */
function updateSprite(
  sprite: RuntimeSprite,
  dt: number,
  keys: Set<string>,
  level: GameLevel,
  worldWidth: number,
): void {
  const behavior = sprite.source.behavior;
  if (!behavior) return;

  if (behavior === "platformer-player") {
    const runSpeed = (sprite.source.params?.runSpeed as number) ?? 200;
    const jumpPower = (sprite.source.params?.jumpPower as number) ?? 500;
    const gravity = 1400;
    const groundY = sprite.source.y; // authored Y is the ground line
    if (keys.has("ArrowLeft") || keys.has("a")) sprite.x -= runSpeed * dt;
    if (keys.has("ArrowRight") || keys.has("d")) sprite.x += runSpeed * dt;
    const onGround = sprite.y >= groundY - 0.01;
    if ((keys.has("ArrowUp") || keys.has(" ") || keys.has("w")) && onGround) {
      sprite.vy = -jumpPower;
    }
    sprite.vy += gravity * dt;
    sprite.y += sprite.vy * dt;
    if (sprite.y > groundY) {
      sprite.y = groundY;
      sprite.vy = 0;
    }
    return;
  }

  if (behavior === "scroll-left") {
    const speed = (sprite.source.params?.speed as number) ?? 200;
    sprite.x -= speed * dt;
    // Wrap when off-screen left so the demo loops continuously.
    if (sprite.x + sprite.source.width < 0) sprite.x = worldWidth;
    return;
  }

  // static / quiz-answer / memory-card / unknown — no per-frame update.
}

/** Paint one frame — backdrop + every sprite. */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  level: GameLevel,
  sprites: RuntimeSprite[],
): void {
  // Backdrop
  ctx.fillStyle = level.backgroundColor;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Sprites — colored rectangles labelled with id + behavior. Real
  // asset rendering lands when the asset loader does (#935 continuation).
  for (const sprite of sprites) {
    const tint = tintForBehavior(sprite.source.behavior);
    ctx.fillStyle = tint.fill;
    if (sprite.source.behavior === "memory-card" && !sprite.flipped) {
      ctx.fillStyle = "#1e293b"; // card back
    }
    if (sprite.source.behavior === "quiz-answer" && sprite.picked) {
      ctx.fillStyle = (sprite.source.params?.correct as boolean) ? "#10b981" : "#ef4444";
    }
    ctx.fillRect(sprite.x, sprite.y, sprite.source.width, sprite.source.height);
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(sprite.x, sprite.y, sprite.source.width, sprite.source.height);

    // Label — id (sm) + behavior (xs) so the rectangle reads as a real
    // sprite slot during playtest.
    ctx.fillStyle = tint.text;
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(sprite.source.id, sprite.x + 8, sprite.y + 6);
    if (sprite.source.behavior) {
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(sprite.source.behavior, sprite.x + 8, sprite.y + 22);
    }
  }
}

function tintForBehavior(behavior: string | null): { fill: string; text: string } {
  switch (behavior) {
    case "platformer-player": return { fill: "#fbbf24", text: "#78350f" };
    case "scroll-left":       return { fill: "#ef4444", text: "#fff" };
    case "static":            return { fill: "#475569", text: "#e2e8f0" };
    case "quiz-answer":       return { fill: "#6366f1", text: "#e0e7ff" };
    case "memory-card":       return { fill: "#10b981", text: "#fff" };
    default:                  return { fill: "#64748b", text: "#fff" };
  }
}
