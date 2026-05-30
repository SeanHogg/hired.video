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
 * EDITOR-PATH import: block-interp.js (gap #1007 — Snap!/Scratch
 * visual-block interpreter) is imported normally for the editor playtest
 * path. The exported bundle path concatenates block-interp.js source
 * BEFORE this file inside one IIFE (see game-export.ts) and strips this
 * import line — both files' exports then share the same closure scope.
 */
import {
  executeStmts,
  fireProgramEvents,
  seedScriptVars,
  seedGlobalVars,
} from "./block-interp.js";

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
//
// Behaviors are the FAST PATH — 5 baked patterns (platformer-player,
// scroll-left, static, quiz-answer, memory-card) that cover the most
// common sprite roles. Block scripts (interpreted by `runBlockScripts`
// below) are the GENERAL PATH — visual rules a non-coder author can
// compose to build arbitrary behavior. Both run side-by-side per
// frame; behaviors handle the canonical mechanics while scripts add
// custom event-driven logic on top.

/** Per-sprite per-frame update. Behaviors fall through unknown values as
 *  no-ops — tolerant of future behavior additions. Mutates the sprite's
 *  instance fields in place (x / y / vy); the source GameSprite is never
 *  touched so "exit play mode" returns the canvas to authored positions.
 *
 *  When the sprite opts into physics (#1009 — `sprite.source.physics`
 *  is set), the baked behavior cedes gravity + ground clamping to the
 *  physics solver in `stepPhysics`. The behavior still handles INPUT
 *  (left/right/jump) — input drives velocity, the solver integrates it. */
export function updateSprite(sprite, dt, keys, worldWidth) {
  const behavior = sprite.source.behavior;
  if (!behavior) return;
  const hasPhysics = !!sprite.source.physics && sprite.source.physics.kind === "dynamic";

  if (behavior === "platformer-player") {
    const params = sprite.source.params || {};
    const runSpeed = typeof params.runSpeed === "number" ? params.runSpeed : 200;
    const jumpPower = typeof params.jumpPower === "number" ? params.jumpPower : 500;
    const groundY = sprite.source.y;
    if (hasPhysics) {
      // Physics-on path: input drives vx + jump-impulse; the solver
      // handles gravity, ground collision, and rest. Treat ground
      // contact as "vy near 0 after collision-resolve" — close enough
      // for jump gating in the MVP.
      sprite.vx = 0;
      if (keys.has("ArrowLeft") || keys.has("a")) sprite.vx = -runSpeed;
      if (keys.has("ArrowRight") || keys.has("d")) sprite.vx = runSpeed;
      const onGround = sprite.onGround === true;
      if ((keys.has("ArrowUp") || keys.has(" ") || keys.has("w")) && onGround) {
        sprite.vy = -jumpPower;
        sprite.onGround = false;
      }
      return;
    }
    // Legacy hand-rolled physics path — kept identical to pre-#1009
    // so existing projects continue to work without opting into the
    // global physics system.
    const gravity = 1400;
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

// ─── Physics solver (#1009) ───────────────────────────────────────────────
//
// Hand-rolled AABB physics — gravity integration + axis-aligned bounding-
// box collision response. Three body kinds (per `GameSpritePhysics.kind`):
//   - static    — immovable, infinite mass (platforms, walls)
//   - kinematic — moved by behaviors / scripts, not by physics; dynamic
//                 bodies still collide against them
//   - dynamic   — affected by gravity + collisions
//
// Only the dynamic-vs-(static|kinematic) case is implemented in the MVP;
// dynamic-vs-dynamic collisions (boxes pushing each other) are logged as
// a follow-on. Same SoT pattern as block scripts: editor + exported
// HTML5 bundle run identical code.

export function stepPhysics(sprites, projectPhysics, dt) {
  if (!projectPhysics) return;
  const gravity = typeof projectPhysics.gravity === "number" ? projectPhysics.gravity : 0;
  const friction = typeof projectPhysics.friction === "number" ? projectPhysics.friction : 0.1;

  // Phase A — integrate velocity onto dynamic bodies.
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    const p = s.source.physics;
    if (!p || p.kind !== "dynamic") continue;
    if (typeof s.vx !== "number") s.vx = 0;
    if (typeof s.vy !== "number") s.vy = 0;
    if (gravity !== 0) s.vy += gravity * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    // Reset onGround each tick; collision phase below re-sets it when
    // the body lands.
    s.onGround = false;
  }

  // Phase B — collision resolve. For each dynamic body, sweep against
  // every other sprite; if their AABBs overlap, push apart along the
  // shallowest penetration axis. Mirror the velocity component along
  // the contact normal scaled by restitution (bouncy bodies bounce).
  for (let i = 0; i < sprites.length; i++) {
    const a = sprites[i];
    const pa = a.source.physics;
    if (!pa || pa.kind !== "dynamic") continue;
    for (let j = 0; j < sprites.length; j++) {
      if (i === j) continue;
      const b = sprites[j];
      const pb = b.source.physics;
      // Dynamic-vs-dynamic collision is a follow-on; the MVP only
      // handles dynamic-vs-(static|kinematic).
      if (!pb || pb.kind === "dynamic") continue;
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (overlapX <= 0 || overlapY <= 0) continue;
      const restitution = typeof pa.restitution === "number" ? pa.restitution : 0;
      if (overlapX < overlapY) {
        // Resolve horizontally — smaller overlap on X.
        if (a.x + a.width / 2 < b.x + b.width / 2) {
          a.x -= overlapX;
        } else {
          a.x += overlapX;
        }
        a.vx = -a.vx * restitution;
      } else {
        // Resolve vertically.
        if (a.y + a.height / 2 < b.y + b.height / 2) {
          // a landed on top of b — apply friction to horizontal vel
          // (the surface drags the body) + mark onGround for the
          // platformer-player's jump gate.
          a.y -= overlapY;
          a.onGround = true;
          a.vx *= (1 - friction);
          a.vy = a.vy > 0 ? -a.vy * restitution : a.vy;
          if (Math.abs(a.vy) < 0.5) a.vy = 0; // rest threshold
        } else {
          a.y += overlapY;
          a.vy = -a.vy * restitution;
        }
      }
    }
  }
}

// ─── Block-script interpreter ─────────────────────────────────────────────

/** Fire any rules on this sprite whose trigger matches the event kind.
 *  Executes the rule's actions in order against the runtime sprite +
 *  level context. Mutates `sprite` (and optionally swaps the current
 *  level via `ctx.gotoLevel`).
 *
 *  `ctx` carries the side-effecting handlers the actions need:
 *   - gotoLevel(levelId): swap to another level (re-mount sprites)
 *   - now: current performance.now() for `set-message` expiry
 *
 *  `eventArgs` is the trigger-specific payload (key for on-key-press,
 *  none for on-click / on-level-mount / on-tick / every-seconds).  */
export function fireRules(sprite, eventKind, eventArgs, ctx) {
  const scripts = sprite.source.scripts;
  if (!scripts || scripts.length === 0) return;
  for (let i = 0; i < scripts.length; i++) {
    const rule = scripts[i];
    if (rule.trigger.kind !== eventKind) continue;
    if (eventKind === "on-key-press" && rule.trigger.key !== eventArgs.key) continue;
    executeActions(sprite, rule.actions, ctx);
  }
}

function executeActions(sprite, actions, ctx) {
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    switch (a.kind) {
      case "move-by":
        sprite.x += a.dx;
        sprite.y += a.dy;
        break;
      case "set-position":
        sprite.x = a.x;
        sprite.y = a.y;
        break;
      case "set-property":
        // Mutates the instance copy — the editor reads `source` for
        // display, so width / height changes only affect runtime
        // rendering, not the authored data.
        if (a.property === "width") sprite.width = a.value;
        if (a.property === "height") sprite.height = a.value;
        break;
      case "show":
        sprite.visible = true;
        break;
      case "hide":
        sprite.visible = false;
        break;
      case "goto-level":
        ctx.gotoLevel(a.levelId);
        // Subsequent actions on this rule are dropped — the sprite
        // we're scripting was just unmounted by the level swap.
        return;
      case "set-message":
        sprite.message = a.text;
        sprite.messageUntilTs = ctx.now + 2000;
        break;
      // `play-sound` / `wait-seconds` / `on-collide-with` deferred
      // until the audio system + collision detector ship.
      default:
        break;
    }
  }
}

// ─── Animation interpreter ────────────────────────────────────────────────

/** Apply the sprite's `onMount` animation spec to its render-time
 *  multipliers (alpha / offsetX / offsetY / scale). Mutates the
 *  runtime sprite in place. Returns once the animation has elapsed
 *  past `durationMs`, after which the multipliers are reset to
 *  identity so the sprite renders normally. */
export function applyAnimation(sprite, ts) {
  const spec = sprite.source.onMount;
  if (!spec || spec.kind === "none") {
    sprite.alpha = 1;
    sprite.offsetX = 0;
    sprite.offsetY = 0;
    sprite.scale = 1;
    return;
  }
  const elapsed = ts - sprite.mountTs;
  if (elapsed >= spec.durationMs) {
    sprite.alpha = 1;
    sprite.offsetX = 0;
    sprite.offsetY = 0;
    sprite.scale = 1;
    return;
  }
  const t = ease(elapsed / spec.durationMs, spec.easing);
  // Defaults — every spec touches a subset of these; the unset ones
  // stay at identity.
  sprite.alpha = 1;
  sprite.offsetX = 0;
  sprite.offsetY = 0;
  sprite.scale = 1;
  switch (spec.kind) {
    case "fade-in":
      sprite.alpha = t;
      break;
    case "slide-in-left":
      sprite.offsetX = -200 * (1 - t);
      break;
    case "slide-in-right":
      sprite.offsetX = 200 * (1 - t);
      break;
    case "slide-in-up":
      sprite.offsetY = -200 * (1 - t);
      break;
    case "slide-in-down":
      sprite.offsetY = 200 * (1 - t);
      break;
    case "scale-up":
      sprite.scale = t;
      break;
    default:
      break;
  }
}

function ease(t, kind) {
  switch (kind) {
    case "ease-in":     return t * t;
    case "ease-out":    return t * (2 - t);
    case "ease-in-out": return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case "linear":
    default:            return t;
  }
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

  const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

  for (let i = 0; i < sprites.length; i++) {
    const sprite = sprites[i];

    // `hide` action / show toggles `visible`; skip drawing entirely
    // when hidden so the sprite reappears cleanly on `show`.
    if (sprite.visible === false) continue;

    const behavior = sprite.source.behavior;

    // Gameplay-state overlays take precedence over the asset image
    // because they're the visual feedback the runtime is trying to
    // surface (correct/incorrect tint, hidden-card back).
    const memoryHidden = behavior === "memory-card" && !sprite.flipped;
    const quizPicked = behavior === "quiz-answer" && sprite.picked;
    const showImage = !memoryHidden && !quizPicked;

    const img = showImage ? assetCache.get(sprite.source.assetId) : null;

    // Render-time geometry — animation + script mutations layered
    // on top of the authored bbox. Width/height read from runtime
    // instance (set-property) with fall-through to source.
    const renderW = (sprite.width != null ? sprite.width : sprite.source.width) * (sprite.scale != null ? sprite.scale : 1);
    const renderH = (sprite.height != null ? sprite.height : sprite.source.height) * (sprite.scale != null ? sprite.scale : 1);
    const renderX = sprite.x + (sprite.offsetX || 0);
    const renderY = sprite.y + (sprite.offsetY || 0);

    const prevAlpha = ctx.globalAlpha;
    if (sprite.alpha != null && sprite.alpha < 1) ctx.globalAlpha = prevAlpha * sprite.alpha;

    if (img) {
      ctx.drawImage(img, renderX, renderY, renderW, renderH);
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
      ctx.fillRect(renderX, renderY, renderW, renderH);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      ctx.strokeRect(renderX, renderY, renderW, renderH);
    }

    ctx.globalAlpha = prevAlpha;

    // Labels only in edit mode — play mode runs clean. Sprites with
    // an image rendered get no labels (the image IS the label).
    if (showLabels && !img) {
      const tint = tintForBehavior(behavior);
      ctx.fillStyle = tint.text;
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(sprite.source.id, renderX + 8, renderY + 6);
      if (behavior) {
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillText(behavior, renderX + 8, renderY + 22);
      }
    }

    // `set-message` action overlay — small pill near the sprite for
    // 2s. Expires when messageUntilTs is in the past.
    if (sprite.message && sprite.messageUntilTs && sprite.messageUntilTs > now) {
      const text = String(sprite.message);
      ctx.font = "bold 14px system-ui, sans-serif";
      const m = ctx.measureText(text);
      const padX = 10;
      const padY = 6;
      const boxW = m.width + padX * 2;
      const boxH = 22;
      const boxX = renderX + renderW / 2 - boxW / 2;
      const boxY = renderY - boxH - 6;
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.fillStyle = "#f8fafc";
      ctx.textBaseline = "top";
      ctx.fillText(text, boxX + padX, boxY + padY);
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
        renderX - 2,
        renderY - 2,
        renderW + 4,
        renderH + 4,
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
  function resolveLevel(initial) {
    const editorLevel = opts && opts.activeLevelId
      ? state.levels.find(function (l) { return l.id === opts.activeLevelId; })
      : null;
    return editorLevel || findStartLevel(state);
  }

  let level = resolveLevel(true);
  if (!level) return { cleanup: function () {} };

  // Match canvas internal resolution to the game's design resolution; CSS
  // scales it via the wrapper. The runtime always thinks in design pixels.
  canvas.width = state.width;
  canvas.height = state.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return { cleanup: function () {} };

  // Per-instance asset cache so each `runGame` mount loads images
  // exactly once — survives across level swaps so common assets
  // don't re-decode on every gotoLevel().
  const assetCache = createAssetCache(state.assets || []);

  let sprites = mountLevel(level);
  // Initial seed of the visual-block variable scopes (#1007).
  seedGlobalVars(state.globalVariables, blockVars);
  seedScriptVars(sprites, blockVars);

  function mountLevel(lvl) {
    const ts = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    return lvl.sprites.map(function (source) {
      return {
        source: source,
        x: source.x,
        y: source.y,
        width: source.width,
        height: source.height,
        vy: 0,
        flipped: false,
        picked: false,
        visible: true,
        alpha: 1,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        mountTs: ts,
        message: null,
        messageUntilTs: 0,
        hasFiredOnMount: false,
        everySecondsLastFiredTs: {},
      };
    });
  }

  function gotoLevel(levelId) {
    const next = state.levels.find(function (l) { return l.id === levelId; });
    if (!next) return;
    level = next;
    sprites = mountLevel(level);
    // Reset the block interpreter's `timer` sensing baseline + re-seed
    // sprite-local variables for the new level's sprites. Globals
    // survive level changes (Scratch convention).
    levelMountTs = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    blockVars.spriteVars = new Map();
    seedScriptVars(sprites, blockVars);
  }

  // Per-frame input state.
  const keys = new Set();
  const keyPressed = new Set();      // keys that transitioned up→down this frame
  const clickedSpriteIds = new Set(); // sprites clicked this frame
  // Pointer position in canvas-relative coordinates — fed to the block
  // interpreter's `mouse-x` / `mouse-y` sensing blocks (#1007). Initialised
  // to canvas centre so a sensing-read before the first pointer event
  // returns a sensible value.
  const mouse = { x: state.width / 2, y: state.height / 2 };
  // Broadcast queue — `broadcast X` statements push here during a tick;
  // we drain it at the end of the tick by firing on-receive handlers on
  // every sprite. Drained per-tick so a chained broadcast doesn't recurse.
  const pendingBroadcasts = [];
  // Sprite-local + global variable scopes for the visual-block interpreter
  // (#1007). Seeded on mount; mutated through the interp's writeVar.
  const blockVars = { spriteVars: new Map(), globalVars: Object.create(null) };
  // Level mount timestamp — feeds the `timer` sensing expression so it
  // resets on every gotoLevel.
  let levelMountTs = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

  const onKeyDown = function (e) {
    if (!keys.has(e.key)) keyPressed.add(e.key);
    keys.add(e.key);
  };
  const onKeyUp = function (e) { keys.delete(e.key); };
  const onClick = function (e) {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
    // Topmost hit wins (sprites array order = paint order).
    for (let i = sprites.length - 1; i >= 0; i--) {
      const s = sprites[i];
      if (sx >= s.x && sx <= s.x + s.width && sy >= s.y && sy <= s.y + s.height) {
        // Baked behaviors fire BEFORE block scripts so a memory-card /
        // quiz-answer with extra on-click rules still gets its
        // canonical flip / pick first, then runs the user's actions.
        if (s.source.behavior === "memory-card") s.flipped = !s.flipped;
        if (s.source.behavior === "quiz-answer") s.picked = true;
        clickedSpriteIds.add(s.source.id);
        break;
      }
    }
  };

  // Pointer-move tracking feeds the block interpreter's mouse-x/y sensors
  // (#1007). Bound on canvas so coords are canvas-relative.
  const onPointerMove = function (e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  };

  if (opts.mode === "play") {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("pointermove", onPointerMove);
  }

  let rafId = 0;
  let lastTs = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  const tick = function (ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    if (opts.mode === "play") {
      // 1. Block-script triggers — fire in this order so on-mount
      //    actions land before the first tick's on-tick / every-N.
      // The block interpreter (gap #1007) gets a richer ctx than the
      // flat-rule runtime — mouse, heldKeys, sprite-id map, variable
      // scopes, and a broadcast queue. The flat-rule runtime ignores
      // these extra fields safely so the same object serves both.
      const spritesById = new Map();
      for (let i = 0; i < sprites.length; i++) spritesById.set(sprites[i].source.id, sprites[i]);
      const scriptCtx = {
        gotoLevel: gotoLevel,
        now: ts,
        levelMountTs: levelMountTs,
        mouse: mouse,
        heldKeys: keys,
        spritesById: spritesById,
        spriteVars: blockVars.spriteVars,
        globalVars: blockVars.globalVars,
        broadcast: function (name) { pendingBroadcasts.push(name); },
      };
      for (let i = 0; i < sprites.length; i++) {
        const s = sprites[i];
        // on-level-mount: once per sprite per mount.
        if (!s.hasFiredOnMount) {
          fireRules(s, "on-level-mount", null, scriptCtx);
          fireProgramEvents(s, "on-level-mount", null, scriptCtx);
          s.hasFiredOnMount = true;
        }
        // on-tick: every frame.
        fireRules(s, "on-tick", null, scriptCtx);
        fireProgramEvents(s, "on-tick", null, scriptCtx);
        // on-key-press: any keys that transitioned this frame.
        if (keyPressed.size > 0) {
          const keysArr = Array.from(keyPressed);
          for (let k = 0; k < keysArr.length; k++) {
            fireRules(s, "on-key-press", { key: keysArr[k] }, scriptCtx);
            fireProgramEvents(s, "on-key-press", { key: keysArr[k] }, scriptCtx);
          }
        }
        // on-click: sprite was clicked this frame.
        if (clickedSpriteIds.has(s.source.id)) {
          fireRules(s, "on-click", null, scriptCtx);
          fireProgramEvents(s, "on-click", null, scriptCtx);
        }
        // every-seconds: per-rule interval timer.
        const scripts = s.source.scripts;
        if (scripts) {
          for (let r = 0; r < scripts.length; r++) {
            const rule = scripts[r];
            if (rule.trigger.kind !== "every-seconds") continue;
            const last = s.everySecondsLastFiredTs[rule.id] != null
              ? s.everySecondsLastFiredTs[rule.id]
              : s.mountTs;
            if ((ts - last) / 1000 >= rule.trigger.interval) {
              executeActions(s, rule.actions, scriptCtx);
              s.everySecondsLastFiredTs[rule.id] = ts;
            }
          }
        }
        // Program-side every-seconds — interval handler. Track lastFiredTs
        // on the sprite keyed by event-handler id so each handler ticks
        // independently.
        const program = s.source.scriptProgram;
        if (program && program.events) {
          for (let h = 0; h < program.events.length; h++) {
            const handler = program.events[h];
            if (handler.event.kind !== "every-seconds") continue;
            if (!s.programEverySecondsLastFiredTs) s.programEverySecondsLastFiredTs = {};
            const last = s.programEverySecondsLastFiredTs[handler.id] != null
              ? s.programEverySecondsLastFiredTs[handler.id]
              : s.mountTs;
            if ((ts - last) / 1000 >= handler.event.interval) {
              executeStmts(s, handler.body, scriptCtx);
              s.programEverySecondsLastFiredTs[handler.id] = ts;
            }
          }
        }
      }
      // Drain broadcasts collected during this tick → fire on-receive
      // handlers across every sprite. Reset the queue immediately so a
      // broadcast from an on-receive handler doesn't recurse-loop within
      // the same tick (next tick picks it up).
      if (pendingBroadcasts.length > 0) {
        const drained = pendingBroadcasts.splice(0, pendingBroadcasts.length);
        for (let b = 0; b < drained.length; b++) {
          for (let i = 0; i < sprites.length; i++) {
            fireProgramEvents(sprites[i], "on-receive", { name: drained[b] }, scriptCtx);
          }
        }
      }
      // 2. Baked behaviors — the fast-path dispatch (player gravity,
      //    scroll-left wrap, etc.). Runs AFTER scripts so script
      //    set-position lands first and behaviors can override (e.g.
      //    platformer-player clamps Y to groundY each frame).
      for (let i = 0; i < sprites.length; i++) {
        updateSprite(sprites[i], dt, keys, canvas.width);
      }
      // 2b. Physics solver (#1009) — integrate gravity onto dynamic
      //    bodies + resolve collisions against static / kinematic
      //    bodies. Runs AFTER baked behaviors so the platformer-
      //    player's input-driven vx update has landed; the solver
      //    integrates the resulting velocity against the world.
      if (state.physics) {
        stepPhysics(sprites, state.physics, dt);
      }
    }

    // 3. Animations — per-sprite alpha / offset / scale based on
    //    onMount spec. Runs in both edit + play so the editor sees the
    //    same motion the player will.
    for (let i = 0; i < sprites.length; i++) {
      applyAnimation(sprites[i], ts);
    }

    // 4. Draw.
    drawFrame(ctx, level, sprites, state.assets || [], {
      mode: opts.mode,
      assetCache: assetCache,
      selectedSpriteId: opts && opts.selectedSpriteId,
    });

    // 5. Clear per-frame transient input state.
    keyPressed.clear();
    clickedSpriteIds.clear();

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
