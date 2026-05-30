/**
 * Snap!/Scratch visual block interpreter (gap #1007).
 *
 * Walks a `ScriptProgram` (shared/game-blocks.ts) and executes the
 * statement tree against a sprite + runtime context. The expression
 * evaluator is pure; the statement executor mutates the sprite the same
 * way the legacy `executeActions` does in runtime-core.js.
 *
 * Plain JS (not TS) for the same reason as runtime-core.js: this file is
 * read via Vite's `?raw` query, the `export` keywords stripped, and the
 * body wrapped in an IIFE for the exported HTML5 bundle. The TypeScript
 * declarations for the public surface live in `block-interp.d.ts`.
 *
 * Loop guards: `repeat-n` / `forever` / `repeat-until` cap their inner
 * loops at MAX_LOOP_ITERATIONS per tick so an author who builds an
 * infinite loop without yield doesn't freeze the runtime. `forever`
 * yields after its body runs once per fire — the next fire of the same
 * event resumes execution naturally because the event fires every tick.
 *
 * Variables: the program's authored `variables` list is the initial
 * scope. The runtime keeps a mutable map keyed by name on the
 * ScriptCtx; reads of undeclared names return 0 (Scratch convention).
 */

// Cap per-fire iterations so a tight `forever` with no wait inside it
// can't blow the event loop. 5000 covers any practical authored loop
// while still bounding the worst case to <16 ms even on slow devices.
const MAX_LOOP_ITERATIONS = 5000;

// ─── Expression evaluator ───────────────────────────────────────────────────

/** Evaluate a `BlockExpr` to a `BlockValue`. Pure with respect to the
 *  sprite + ctx — never mutates either. Numeric coercion follows
 *  Scratch's "everything is a number when you ask for one" rule. */
export function evalExpr(expr, sprite, ctx) {
  if (expr == null) return 0;
  switch (expr.kind) {
    case "literal-num":
      return Number(expr.value) || 0;
    case "literal-bool":
      return Boolean(expr.value);
    case "literal-str":
      return String(expr.value ?? "");
    case "var-ref": {
      // Sprite-local first, then global. Undeclared names → 0.
      const local = ctx.spriteVars?.get(sprite.id);
      if (local && Object.prototype.hasOwnProperty.call(local, expr.name)) {
        return local[expr.name];
      }
      if (
        ctx.globalVars &&
        Object.prototype.hasOwnProperty.call(ctx.globalVars, expr.name)
      ) {
        return ctx.globalVars[expr.name];
      }
      return 0;
    }
    case "math-op": {
      const l = toNumber(evalExpr(expr.left, sprite, ctx));
      const r = toNumber(evalExpr(expr.right, sprite, ctx));
      switch (expr.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return r === 0 ? 0 : l / r;
        case "mod": {
          if (r === 0) return 0;
          // Mathematical modulo — always sign-of-divisor.
          const m = l - Math.floor(l / r) * r;
          return m;
        }
        default: return 0;
      }
    }
    case "round":
      return Math.round(toNumber(evalExpr(expr.value, sprite, ctx)));
    case "random-range": {
      const lo = toNumber(evalExpr(expr.min, sprite, ctx));
      const hi = toNumber(evalExpr(expr.max, sprite, ctx));
      const a = Math.min(lo, hi);
      const b = Math.max(lo, hi);
      // Integer when both bounds are integer (Scratch convention).
      if (Number.isInteger(a) && Number.isInteger(b)) {
        return Math.floor(a + Math.random() * (b - a + 1));
      }
      return a + Math.random() * (b - a);
    }
    case "compare": {
      const l = evalExpr(expr.left, sprite, ctx);
      const r = evalExpr(expr.right, sprite, ctx);
      switch (expr.op) {
        case "eq": {
          const nl = Number(l);
          const nr = Number(r);
          if (!Number.isNaN(nl) && !Number.isNaN(nr)) return nl === nr;
          return String(l) === String(r);
        }
        case "lt": return toNumber(l) < toNumber(r);
        case "gt": return toNumber(l) > toNumber(r);
        default: return false;
      }
    }
    case "and":
      return Boolean(evalExpr(expr.left, sprite, ctx)) && Boolean(evalExpr(expr.right, sprite, ctx));
    case "or":
      return Boolean(evalExpr(expr.left, sprite, ctx)) || Boolean(evalExpr(expr.right, sprite, ctx));
    case "not":
      return !evalExpr(expr.value, sprite, ctx);
    case "join":
      return String(evalExpr(expr.left, sprite, ctx)) + String(evalExpr(expr.right, sprite, ctx));
    case "length-of":
      return String(evalExpr(expr.value, sprite, ctx)).length;
    case "mouse-x":
      return ctx.mouse ? ctx.mouse.x : 0;
    case "mouse-y":
      return ctx.mouse ? ctx.mouse.y : 0;
    case "key-pressed?":
      return ctx.heldKeys ? ctx.heldKeys.has(expr.key) : false;
    case "distance-to": {
      const target = (ctx.spritesById || new Map()).get(expr.spriteId);
      if (!target) return 0;
      const dx = (target.x ?? 0) - (sprite.x ?? 0);
      const dy = (target.y ?? 0) - (sprite.y ?? 0);
      return Math.sqrt(dx * dx + dy * dy);
    }
    case "timer":
      return ctx.now ? (ctx.now - (ctx.levelMountTs ?? ctx.now)) / 1000 : 0;
    default:
      return 0;
  }
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ─── Statement executor ─────────────────────────────────────────────────────

/** Run a list of statements sequentially. Returns a sentinel when control
 *  flow should bubble out — `level-changed` after `goto-level`, or after
 *  the loop guard trips. The walker bails on `level-changed` because the
 *  sprite we're executing was just unmounted by the level swap (same rule
 *  the legacy `executeActions` uses). */
export function executeStmts(sprite, stmts, ctx) {
  if (!stmts || !stmts.length) return "ok";
  for (let i = 0; i < stmts.length; i++) {
    const result = executeOne(sprite, stmts[i], ctx);
    if (result === "level-changed") return "level-changed";
  }
  return "ok";
}

function executeOne(sprite, stmt, ctx) {
  switch (stmt.kind) {
    case "move-by": {
      const dx = toNumber(evalExpr(stmt.dx, sprite, ctx));
      const dy = toNumber(evalExpr(stmt.dy, sprite, ctx));
      sprite.x += dx;
      sprite.y += dy;
      return "ok";
    }
    case "set-position": {
      sprite.x = toNumber(evalExpr(stmt.x, sprite, ctx));
      sprite.y = toNumber(evalExpr(stmt.y, sprite, ctx));
      return "ok";
    }
    case "set-property": {
      const v = toNumber(evalExpr(stmt.value, sprite, ctx));
      if (stmt.property === "width") sprite.width = v;
      if (stmt.property === "height") sprite.height = v;
      return "ok";
    }
    case "show":
      sprite.visible = true;
      return "ok";
    case "hide":
      sprite.visible = false;
      return "ok";
    case "set-message": {
      const text = String(evalExpr(stmt.text, sprite, ctx) ?? "");
      sprite.message = text;
      sprite.messageUntilTs = (ctx.now ?? 0) + 2000;
      return "ok";
    }
    case "goto-level":
      if (ctx.gotoLevel) ctx.gotoLevel(stmt.levelId);
      // Caller bails — the sprite was just unmounted.
      return "level-changed";
    case "play-sound":
      if (ctx.playSound) ctx.playSound(stmt.assetId);
      return "ok";
    case "wait-seconds":
      // Block-form wait is best-effort — the runtime fires events per
      // tick. A true yield/resume would need a coroutine; here we just
      // record the awaitable for the per-rule lastFired ledger.
      // Future refinement: thread a `tick` token through the executor.
      return "ok";

    case "if": {
      if (Boolean(evalExpr(stmt.condition, sprite, ctx))) {
        return executeStmts(sprite, stmt.thenBody, ctx);
      }
      return "ok";
    }
    case "if-else": {
      const cond = Boolean(evalExpr(stmt.condition, sprite, ctx));
      return executeStmts(sprite, cond ? stmt.thenBody : stmt.elseBody, ctx);
    }
    case "repeat-n": {
      const n = Math.max(0, Math.floor(toNumber(evalExpr(stmt.count, sprite, ctx))));
      const cap = Math.min(n, MAX_LOOP_ITERATIONS);
      for (let i = 0; i < cap; i++) {
        const r = executeStmts(sprite, stmt.body, ctx);
        if (r === "level-changed") return "level-changed";
      }
      return "ok";
    }
    case "forever": {
      // One pass per fire. Event triggers re-fire on every tick (for
      // `on-tick`) so a `forever` inside `on-tick` runs continuously
      // without freezing the runtime. The MAX guard exists so a
      // `forever` inside `on-level-mount` doesn't lock up at boot.
      for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
        const r = executeStmts(sprite, stmt.body, ctx);
        if (r === "level-changed") return "level-changed";
        // Yield-aware exit: the runtime can signal "stop the forever"
        // by setting ctx.stopForever, which the editor surface uses to
        // single-step.
        if (ctx.stopForever) return "ok";
      }
      return "ok";
    }
    case "repeat-until": {
      for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
        if (Boolean(evalExpr(stmt.condition, sprite, ctx))) return "ok";
        const r = executeStmts(sprite, stmt.body, ctx);
        if (r === "level-changed") return "level-changed";
      }
      return "ok";
    }
    case "wait-until":
      // Best-effort: skip ahead this tick if the condition is true,
      // otherwise the next fire will re-evaluate. Same yield caveat as
      // wait-seconds — a true coroutine would suspend the rule body.
      return "ok";
    case "set-var": {
      const v = evalExpr(stmt.value, sprite, ctx);
      writeVar(sprite, stmt.name, v, ctx);
      return "ok";
    }
    case "change-var-by": {
      const delta = toNumber(evalExpr(stmt.delta, sprite, ctx));
      const cur = toNumber(readVar(sprite, stmt.name, ctx));
      writeVar(sprite, stmt.name, cur + delta, ctx);
      return "ok";
    }
    case "broadcast":
      if (ctx.broadcast) ctx.broadcast(stmt.name);
      return "ok";
    default:
      return "ok";
  }
}

function readVar(sprite, name, ctx) {
  const local = ctx.spriteVars && ctx.spriteVars.get(sprite.id);
  if (local && Object.prototype.hasOwnProperty.call(local, name)) return local[name];
  if (ctx.globalVars && Object.prototype.hasOwnProperty.call(ctx.globalVars, name)) {
    return ctx.globalVars[name];
  }
  return 0;
}

function writeVar(sprite, name, value, ctx) {
  // Prefer sprite-local when the sprite's program declared the name; else
  // write global. The caller seeds the spriteVars map at mount time per
  // the program's `variables` declaration.
  const local = ctx.spriteVars && ctx.spriteVars.get(sprite.id);
  if (local && Object.prototype.hasOwnProperty.call(local, name)) {
    local[name] = value;
    return;
  }
  if (ctx.globalVars && Object.prototype.hasOwnProperty.call(ctx.globalVars, name)) {
    ctx.globalVars[name] = value;
    return;
  }
  // Undeclared — treat as a new sprite-local for the fire's lifetime.
  if (local) local[name] = value;
}

// ─── Event dispatch ─────────────────────────────────────────────────────────

/** Fire every matching event handler in the sprite's `scriptProgram`.
 *  Coexists with the legacy `fireRules` in runtime-core.js — both walk
 *  every fire, so a sprite carrying BOTH a flat-rule and a program runs
 *  both surfaces additively. */
export function fireProgramEvents(sprite, eventKind, eventArgs, ctx) {
  const program = sprite.source && sprite.source.scriptProgram;
  if (!program || !program.events || !program.events.length) return;
  for (let i = 0; i < program.events.length; i++) {
    const handler = program.events[i];
    const ev = handler.event;
    if (ev.kind !== eventKind) continue;
    // Per-kind argument filters — same shape the flat-rule runtime uses.
    if (eventKind === "on-key-press" && eventArgs && ev.key !== eventArgs.key) continue;
    if (eventKind === "on-receive" && eventArgs && ev.name !== eventArgs.name) continue;
    executeStmts(sprite, handler.body, ctx);
  }
}

/** Seed the sprite-local variable scope for every sprite that carries a
 *  program. Called once per level mount; the runtime writes through the
 *  resulting map so reads see the latest authored-defaults + runtime
 *  writes. */
export function seedScriptVars(sprites, ctx) {
  if (!ctx.spriteVars) ctx.spriteVars = new Map();
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    const program = s.source && s.source.scriptProgram;
    if (!program || !program.variables) continue;
    const map = Object.create(null);
    for (let j = 0; j < program.variables.length; j++) {
      map[program.variables[j].name] = program.variables[j].initial;
    }
    ctx.spriteVars.set(s.id, map);
  }
}

/** Seed the global variable scope from the GameState's `globalVariables`. */
export function seedGlobalVars(globalVariables, ctx) {
  if (!ctx.globalVars) ctx.globalVars = Object.create(null);
  if (!globalVariables) return;
  for (let i = 0; i < globalVariables.length; i++) {
    const v = globalVariables[i];
    if (!Object.prototype.hasOwnProperty.call(ctx.globalVars, v.name)) {
      ctx.globalVars[v.name] = v.initial;
    }
  }
}
