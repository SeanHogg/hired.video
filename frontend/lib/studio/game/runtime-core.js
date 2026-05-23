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

// ─── Asset loader ─────────────────────────────────────────────────────────

/** Build an image cache scoped to one `runGame` instance. Lazy-loads
 *  assets the first time a sprite that references them is drawn —
 *  there's no preload phase, so the first frame paints placeholders
 *  while images decode and seamlessly swaps in the bitmap on the
 *  frame after `Image.onload` fires.
 *
 *  Asset resolution is unified: built-in sprites (`builtin:*` ids) ride
 *  the same `state.assets` array as user-uploaded R2 assets — the
 *  editor copies built-ins into `assets` at pick time. The runtime
 *  doesn't special-case "built-in" anywhere.
 *
 *  Returns `{ get(assetId) }`. `get` returns `null` if the asset id
 *  doesn't resolve OR the image is still loading / errored. Callers
 *  fall back to a colored rectangle in that case so the layout stays
 *  visible at all times. */
export function createAssetCache(assets) {
  const cache = new Map(); // assetId → { status: "loading"|"ready"|"error", img? }
  return {
    get: function (assetId) {
      if (!assetId) return null;
      const cached = cache.get(assetId);
      if (cached) return cached.status === "ready" ? cached.img : null;
      const asset = assets.find(function (a) { return a.id === assetId; });
      if (!asset || !asset.url) {
        cache.set(assetId, { status: "error" });
        return null;
      }
      const entry = { status: "loading", img: null };
      cache.set(assetId, entry);
      const img = new Image();
      img.onload = function () { entry.status = "ready"; entry.img = img; };
      img.onerror = function () { entry.status = "error"; };
      img.src = asset.url;
      return null;
    },
  };
}

// ─── Renderer ─────────────────────────────────────────────────────────────

/** Paint one frame — backdrop + every sprite. Resolves each sprite's
 *  asset via the cache and draws the image when available, falling
 *  back to a colored placeholder rectangle (with id / behavior labels
 *  in edit mode) otherwise. Quiz-answer / memory-card state overlays
 *  (right-vs-wrong tint, card-flip back) take precedence over the
 *  asset image because they're transient gameplay state. */
export function drawFrame(ctx, level, sprites, assets, opts) {
  const assetCache = opts && opts.assetCache ? opts.assetCache : createAssetCache(assets || []);
  const showLabels = opts && opts.mode === "edit";
  const selectedSpriteId = opts && opts.selectedSpriteId ? opts.selectedSpriteId : null;

  ctx.fillStyle = level.backgroundColor;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (let i = 0; i < sprites.length; i++) {
    const sprite = sprites[i];
    const behavior = sprite.source.behavior;

    // Gameplay-state overlays take precedence over the asset image
    // because they're the visual feedback the runtime is trying to
    // surface (correct/incorrect tint, hidden-card back).
    const memoryHidden = behavior === "memory-card" && !sprite.flipped;
    const quizPicked = behavior === "quiz-answer" && sprite.picked;
    const showImage = !memoryHidden && !quizPicked;

    const img = showImage ? assetCache.get(sprite.source.assetId) : null;

    if (img) {
      ctx.drawImage(img, sprite.x, sprite.y, sprite.source.width, sprite.source.height);
    } else {
      // Placeholder rectangle — same palette as before so a project
      // that hasn't picked sprites yet still reads as a real layout.
      const tint = tintForBehavior(behavior);
      let fill = tint.fill;
      if (memoryHidden) fill = "#1e293b";
      if (quizPicked) {
        const correct = !!(sprite.source.params && sprite.source.params.correct);
        fill = correct ? "#10b981" : "#ef4444";
      }
      ctx.fillStyle = fill;
      ctx.fillRect(sprite.x, sprite.y, sprite.source.width, sprite.source.height);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      ctx.strokeRect(sprite.x, sprite.y, sprite.source.width, sprite.source.height);
    }

    // Labels only in edit mode — play mode runs clean. Sprites with
    // an image rendered get no labels (the image IS the label).
    if (showLabels && !img) {
      const tint = tintForBehavior(behavior);
      ctx.fillStyle = tint.text;
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(sprite.source.id, sprite.x + 8, sprite.y + 6);
      if (behavior) {
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillText(behavior, sprite.x + 8, sprite.y + 22);
      }
    }

    // Selection outline — only when this sprite is the editor's
    // selection. Drawn LAST per-sprite so it sits on top of the
    // image. Fuchsia matches the editor's game-kind accent so the
    // outline reads as a deliberate UI element, not a debug overlay.
    if (selectedSpriteId && sprite.source.id === selectedSpriteId) {
      ctx.strokeStyle = "#d946ef";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(
        sprite.x - 2,
        sprite.y - 2,
        sprite.source.width + 4,
        sprite.source.height + 4,
      );
      ctx.setLineDash([]);
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
  // Editor preview overrides — `opts.activeLevelId` lets the editor
  // show the level the user just selected from the rail (which may
  // differ from the start level). Falls back to the runtime default
  // when not set or doesn't resolve. The export bundle never passes
  // this so the live game still mounts startLevelId as authored.
  const editorLevel = opts && opts.activeLevelId
    ? state.levels.find(function (l) { return l.id === opts.activeLevelId; })
    : null;
  const level = editorLevel || findStartLevel(state);
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

  // Per-instance asset cache so each `runGame` mount loads images
  // exactly once — repeated frame draws are constant-time lookups.
  // The cache is captured by the tick closure so it survives across
  // every frame.
  const assetCache = createAssetCache(state.assets || []);

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
    drawFrame(ctx, level, sprites, state.assets || [], {
      mode: opts.mode,
      assetCache: assetCache,
      selectedSpriteId: opts && opts.selectedSpriteId,
    });
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
