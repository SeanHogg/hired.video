/**
 * Game runtime — SINGLE-SOURCE behavior interpreter + canvas shell.
 *
 * One module, two consumers:
 *   1. `runtime.ts` (TS shim) imports these functions normally — used by
 *      `<GameStage mode="play">` in the editor playtest path and by
 *      `<ProjectPlayer>` on entity cards / public pages.
 *   2. `game-export.ts` reads this file's source via Vite's `?raw` query,
 *      strips the `export` keywords, wraps the body in an IIFE, and ships
 *      it as `runtime.js` inside the exported HTML5 ZIP bundle so the
 *      same code drives the standalone export.
 *
 * Per the DRY rule: ZERO duplication of behavior dispatch between the
 * in-app runtime and the exported bundle. If a behavior (platformer-player,
 * scroll-left, quiz-answer, memory-card, static, future entries) changes,
 * editor playtest and downloaded ZIP both update in lockstep.
 *
 * WRITTEN AS PLAIN JS (not TS) because the `?raw` import returns the file
 * as-is — the browser running the exported ZIP can't parse TS syntax.
 * TypeScript signatures are declared in the companion `runtime-core.d.ts`
 * so TS consumers (runtime.ts, GameStage.tsx, ProjectPlayer.tsx) still get
 * full type-checking when they import this module.
 *
 * No top-level imports — `?raw` would inline them as broken `import` lines
 * inside the IIFE. The module is self-contained.
 */

// ─── Pure helpers ─────────────────────────────────────────────────────────

/** Resolve the level the runtime should mount first. Defensive: falls back
 *  to levels[0] when startLevelId points at a missing id. */
export function findStartLevel(state) {
  if (!state.levels.length) return null;
  return state.levels.find((l) => l.id === state.startLevelId) || state.levels[0];
}

/** Tint table for the placeholder sprite renderer. Each behavior gets a
 *  distinct fill so playtest reads as a real game layout even before
 *  asset loading lands (#939). Unknown behaviors get a neutral grey. */
export function tintForBehavior(behavior) {
  switch (behavior) {
    case "platformer-player": return { fill: "#fbbf24", text: "#78350f" };
    case "scroll-left":       return { fill: "#ef4444", text: "#fff" };
    case "static":            return { fill: "#475569", text: "#e2e8f0" };
    case "quiz-answer":       return { fill: "#6366f1", text: "#e0e7ff" };
    case "memory-card":       return { fill: "#10b981", text: "#fff" };
    default:                  return { fill: "#64748b", text: "#fff" };
  }
}

// ─── Behavior dispatcher ──────────────────────────────────────────────────

/** Per-sprite per-frame update. Behaviors fall through unknown values as
 *  no-ops — tolerant of future behavior additions. Mutates the sprite's
 *  instance fields in place (x / y / vy); the source GameSprite is never
 *  touched so "exit play mode" returns the canvas to authored positions. */
export function updateSprite(sprite, dt, keys, worldWidth) {
  const behavior = sprite.source.behavior;
  if (!behavior) return;

  if (behavior === "platformer-player") {
    const params = sprite.source.params || {};
    const runSpeed = typeof params.runSpeed === "number" ? params.runSpeed : 200;
    const jumpPower = typeof params.jumpPower === "number" ? params.jumpPower : 500;
    const gravity = 1400;
    const groundY = sprite.source.y;
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
    const params = sprite.source.params || {};
    const speed = typeof params.speed === "number" ? params.speed : 200;
    sprite.x -= speed * dt;
    if (sprite.x + sprite.source.width < 0) sprite.x = worldWidth;
    return;
  }

  // static / quiz-answer / memory-card / unknown — no per-frame update.
}

// ─── Renderer ─────────────────────────────────────────────────────────────

/** Paint one frame — backdrop + every sprite. Sprites render as colored
 *  rectangles labelled with their id + behavior name (placeholder until
 *  the asset loader lands #939). */
export function drawFrame(ctx, level, sprites) {
  ctx.fillStyle = level.backgroundColor;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (let i = 0; i < sprites.length; i++) {
    const sprite = sprites[i];
    const tint = tintForBehavior(sprite.source.behavior);
    let fill = tint.fill;
    if (sprite.source.behavior === "memory-card" && !sprite.flipped) {
      fill = "#1e293b";
    }
    if (sprite.source.behavior === "quiz-answer" && sprite.picked) {
      const correct = !!(sprite.source.params && sprite.source.params.correct);
      fill = correct ? "#10b981" : "#ef4444";
    }
    ctx.fillStyle = fill;
    ctx.fillRect(sprite.x, sprite.y, sprite.source.width, sprite.source.height);
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(sprite.x, sprite.y, sprite.source.width, sprite.source.height);
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

// ─── Canvas + rAF shell ───────────────────────────────────────────────────

/** Mount the runtime against a Canvas 2D context. Returns a cleanup handle
 *  the caller invokes on unmount — cancels the rAF loop + removes event
 *  listeners. Idempotent.
 *
 *  `opts.mode`: "edit" → static layout render, no input. "play" → game
 *  loop + input wired. */
export function runGame(canvas, state, opts) {
  const level = findStartLevel(state);
  if (!level) return { cleanup: function () {} };

  // Match canvas internal resolution to the game's design resolution; CSS
  // scales it via the wrapper. The runtime always thinks in design pixels.
  canvas.width = state.width;
  canvas.height = state.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return { cleanup: function () {} };

  // Instance state — start at the authored positions.
  const sprites = level.sprites.map(function (source) {
    return { source: source, x: source.x, y: source.y, vy: 0, flipped: false, picked: false };
  });

  const keys = new Set();
  const onKeyDown = function (e) { keys.add(e.key); };
  const onKeyUp = function (e) { keys.delete(e.key); };
  const onClick = function (e) {
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

  let rafId = 0;
  let lastTs = performance.now();
  const tick = function (ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    if (opts.mode === "play") {
      for (let i = 0; i < sprites.length; i++) {
        updateSprite(sprites[i], dt, keys, canvas.width);
      }
    }
    drawFrame(ctx, level, sprites);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return {
    cleanup: function () {
      cancelAnimationFrame(rafId);
      if (opts.mode === "play") {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        canvas.removeEventListener("click", onClick);
      }
    },
  };
}
