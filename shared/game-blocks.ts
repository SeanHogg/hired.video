/**
 * Extended visual-programming AST for the Snap!/Scratch-style block editor
 * (gap #1007).
 *
 * Two execution paths share this file:
 *   1. The block editor (frontend/components/studio/game/blocks/) edits the
 *      tree directly — every change writes back through the same setState
 *      path the existing flat-rule editor uses.
 *   2. The runtime (frontend/lib/studio/game/runtime-core.js) interprets
 *      the tree via `executeStmts` in `block-interp` — same single-source
 *      rule the existing fast-path keeps so editor playtest + exported
 *      HTML5 bundle agree byte-for-byte.
 *
 * Coexistence with `BlockRule[]` (gap #973): a sprite may carry EITHER the
 * flat-rule shape (existing dropdown form) OR the visual `scriptProgram`
 * (new). The runtime fires both — the flat rules satisfy back-compat with
 * existing authored content, the visual program is the additive surface.
 *
 * The structural-share rule: every mutator returns a fresh object/array,
 * so React reference-equality stays meaningful through deep edits.
 */

// ─── Expressions ────────────────────────────────────────────────────────────
// Expressions are pure values — math, comparisons, sensing, variable reads.
// Every expression evaluates to a `BlockValue` (number / boolean / string).
// Discriminated union by `kind` so the interpreter dispatches without
// instanceof checks.

export type BlockValue = number | boolean | string;

export type BlockExpr =
  // Literals — the editor inlines these via small text inputs inside the
  // slot. The default for a fresh expression slot is `literal` with the
  // empty string so authors can type without first picking a kind.
  | { kind: "literal-num"; value: number }
  | { kind: "literal-bool"; value: boolean }
  | { kind: "literal-str"; value: string }
  // Variable read — `name` is matched against the program's `variables`
  // table at evaluation time; missing variables read as 0/""/false per
  // the inferred type from context (Scratch convention).
  | { kind: "var-ref"; name: string }
  // Arithmetic — left + right are both expressions so they nest. `mod` is
  // mathematical modulo (always non-negative for positive divisor).
  | { kind: "math-op"; op: "+" | "-" | "*" | "/" | "mod"; left: BlockExpr; right: BlockExpr }
  | { kind: "round"; value: BlockExpr }
  | { kind: "random-range"; min: BlockExpr; max: BlockExpr }
  // Comparison — `eq` does loose-equal (number/string coercion matches
  // Scratch's pick-by-shape behaviour).
  | { kind: "compare"; op: "eq" | "lt" | "gt"; left: BlockExpr; right: BlockExpr }
  // Boolean logic.
  | { kind: "and"; left: BlockExpr; right: BlockExpr }
  | { kind: "or"; left: BlockExpr; right: BlockExpr }
  | { kind: "not"; value: BlockExpr }
  // String operations — Scratch has join + length + letter-of. Letter-of
  // is 1-indexed per Scratch convention.
  | { kind: "join"; left: BlockExpr; right: BlockExpr }
  | { kind: "length-of"; value: BlockExpr }
  // Sensing — read from the runtime's per-tick state. `mouse-x`/`mouse-y`
  // come from the canvas-2D pointer; `key-pressed?` returns boolean from
  // the runtime's held-key map; `distance-to-sprite` is Euclidean from
  // this sprite's centre to the named sprite's centre.
  | { kind: "mouse-x" }
  | { kind: "mouse-y" }
  | { kind: "key-pressed?"; key: string }
  | { kind: "distance-to"; spriteId: string }
  // `timer` is seconds since the level mounted (Scratch's `timer`). Reset
  // on level change.
  | { kind: "timer" };

// ─── Statements ─────────────────────────────────────────────────────────────
// Statements mutate sprite/runtime state. Every statement carries a stable
// `id` so React keys stay stable across edits + the SVG renderer can map
// DOM nodes to AST nodes for drag/drop. Statement bodies are arrays of
// statements (Scratch's "C-block" shape).

export interface BlockStmtBase {
  id: string;
}

// Direct-mutation actions — these mirror the existing `BlockAction` set
// from `game-state.ts` so the interpreter shares one switch. The visual
// editor renders them as horizontal "puzzle piece" blocks.
export type BlockMotionStmt = BlockStmtBase &
  (
    | { kind: "move-by"; dx: BlockExpr; dy: BlockExpr }
    | { kind: "set-position"; x: BlockExpr; y: BlockExpr }
    | { kind: "set-property"; property: "width" | "height"; value: BlockExpr }
  );

export type BlockLooksStmt = BlockStmtBase &
  (
    | { kind: "show" }
    | { kind: "hide" }
    | { kind: "set-message"; text: BlockExpr }
  );

export type BlockLevelStmt = BlockStmtBase &
  (
    | { kind: "goto-level"; levelId: string }
    | { kind: "play-sound"; assetId: string }
    | { kind: "wait-seconds"; seconds: BlockExpr }
  );

// Control flow — Scratch's defining feature. `body` is an array of nested
// statements; the renderer draws a "C-shape" around them.
export type BlockControlStmt = BlockStmtBase &
  (
    | { kind: "if"; condition: BlockExpr; thenBody: BlockStmt[] }
    | { kind: "if-else"; condition: BlockExpr; thenBody: BlockStmt[]; elseBody: BlockStmt[] }
    | { kind: "repeat-n"; count: BlockExpr; body: BlockStmt[] }
    | { kind: "forever"; body: BlockStmt[] }
    | { kind: "repeat-until"; condition: BlockExpr; body: BlockStmt[] }
    | { kind: "wait-until"; condition: BlockExpr }
  );

// Variable mutators — `set` overwrites, `change-by` adds (numeric only).
export type BlockVarStmt = BlockStmtBase &
  (
    | { kind: "set-var"; name: string; value: BlockExpr }
    | { kind: "change-var-by"; name: string; delta: BlockExpr }
  );

// Broadcasts — fan messages between sprites. `broadcast` fires the
// `on-receive` handlers of every sprite carrying one. Synchronous in this
// MVP (Scratch's `broadcast and wait` variant is a follow-on).
export type BlockBroadcastStmt = BlockStmtBase & { kind: "broadcast"; name: string };

export type BlockStmt =
  | BlockMotionStmt
  | BlockLooksStmt
  | BlockLevelStmt
  | BlockControlStmt
  | BlockVarStmt
  | BlockBroadcastStmt;

// ─── Event handlers ─────────────────────────────────────────────────────────
// Hat blocks (Scratch's term) — every program is a collection of these.
// The runtime indexes them by `kind` at fire time.

export interface BlockEventHandler {
  id: string;
  event:
    | { kind: "on-level-mount" }
    | { kind: "on-tick" }
    | { kind: "on-key-press"; key: string }
    | { kind: "on-click" }
    | { kind: "on-receive"; name: string }
    | { kind: "every-seconds"; interval: number };
  body: BlockStmt[];
}

// ─── Variables ──────────────────────────────────────────────────────────────
// Sprite-local variables are stored on the sprite's `scriptProgram.variables`
// table; global variables live at `GameState.globalVariables` (declared in
// game-state.ts). The block editor surfaces "show monitor" via a runtime
// overlay HUD; not authored on the program itself.

export interface BlockVariable {
  name: string;
  initial: BlockValue;
}

// ─── Program ────────────────────────────────────────────────────────────────
// Top-level container. `events` are independent execution roots; `variables`
// declares the sprite-local scope.

export interface ScriptProgram {
  schemaVersion: 1;
  events: BlockEventHandler[];
  variables: BlockVariable[];
}

export const SCRIPT_PROGRAM_SCHEMA_VERSION = 1 as const;

export function emptyScriptProgram(): ScriptProgram {
  return {
    schemaVersion: SCRIPT_PROGRAM_SCHEMA_VERSION,
    events: [],
    variables: [],
  };
}

// ─── Pure mutators ──────────────────────────────────────────────────────────
// All exported as discrete functions so the editor + AI agent + (eventually)
// the Snap! XML importer call into one API. Per the DRY rule, no caller
// reaches into the program by index.

let _nextBlockId = 0;
export function newBlockId(prefix = "blk"): string {
  _nextBlockId += 1;
  // Insertion-deterministic ids — high enough entropy for collision-free
  // session-local ids; the editor doesn't need crypto-grade uniqueness here.
  return `${prefix}-${Date.now().toString(36)}-${_nextBlockId.toString(36)}`;
}

/** Make an empty expression slot — the editor's default for a fresh slot. */
export function emptyExpr(): BlockExpr {
  return { kind: "literal-num", value: 0 };
}

/** Add an event handler. The body is empty — caller drops blocks into it
 *  from the palette. */
export function addEventHandler(
  program: ScriptProgram,
  event: BlockEventHandler["event"],
): ScriptProgram {
  return {
    ...program,
    events: [
      ...program.events,
      { id: newBlockId("evt"), event, body: [] },
    ],
  };
}

/** Append a statement to an event's body (top-level), the if/else branches,
 *  the repeat body, or the forever body. `path` is the trail of indices
 *  from the event to the parent statement, then the bucket key. */
export interface BodyPath {
  /** Event id holding the root body. */
  eventId: string;
  /** Statement-id chain from the event body down to the target parent
   *  statement. Empty when appending to the event's own body. */
  parents: string[];
  /** Which body within the parent statement — "body" for repeat/forever,
   *  "thenBody"/"elseBody" for if/if-else. Ignored when `parents` is empty. */
  bucket?: "body" | "thenBody" | "elseBody";
}

export function appendStmt(
  program: ScriptProgram,
  path: BodyPath,
  stmt: BlockStmt,
): ScriptProgram {
  return mapProgram(program, path, (body) => [...body, stmt]);
}

export function insertStmtAt(
  program: ScriptProgram,
  path: BodyPath,
  index: number,
  stmt: BlockStmt,
): ScriptProgram {
  return mapProgram(program, path, (body) => {
    const next = [...body];
    const i = Math.max(0, Math.min(index, next.length));
    next.splice(i, 0, stmt);
    return next;
  });
}

export function removeStmt(program: ScriptProgram, path: BodyPath, stmtId: string): ScriptProgram {
  return mapProgram(program, path, (body) => body.filter((s) => s.id !== stmtId));
}

export function moveStmt(
  program: ScriptProgram,
  path: BodyPath,
  fromIndex: number,
  toIndex: number,
): ScriptProgram {
  return mapProgram(program, path, (body) => {
    if (fromIndex < 0 || fromIndex >= body.length) return body;
    const next = [...body];
    const [moved] = next.splice(fromIndex, 1);
    const dest = Math.max(0, Math.min(toIndex, next.length));
    next.splice(dest, 0, moved);
    return next;
  });
}

/** Patch a statement in place — replaces by id, optionally inside a
 *  nested control body. Walks the tree once. */
export function updateStmt(
  program: ScriptProgram,
  stmtId: string,
  patch: (stmt: BlockStmt) => BlockStmt,
): ScriptProgram {
  return {
    ...program,
    events: program.events.map((evt) => ({
      ...evt,
      body: walkAndPatch(evt.body, stmtId, patch),
    })),
  };
}

/** Patch an event handler's event-kind in place. */
export function updateEventHandler(
  program: ScriptProgram,
  eventId: string,
  patch: (evt: BlockEventHandler) => BlockEventHandler,
): ScriptProgram {
  return {
    ...program,
    events: program.events.map((evt) => (evt.id === eventId ? patch(evt) : evt)),
  };
}

export function removeEventHandler(program: ScriptProgram, eventId: string): ScriptProgram {
  return {
    ...program,
    events: program.events.filter((evt) => evt.id !== eventId),
  };
}

/** Add a sprite-local variable. `initial` defaults to 0. */
export function addVariable(
  program: ScriptProgram,
  name: string,
  initial: BlockValue = 0,
): ScriptProgram {
  if (program.variables.some((v) => v.name === name)) return program;
  return { ...program, variables: [...program.variables, { name, initial }] };
}

export function removeVariable(program: ScriptProgram, name: string): ScriptProgram {
  return { ...program, variables: program.variables.filter((v) => v.name !== name) };
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function mapProgram(
  program: ScriptProgram,
  path: BodyPath,
  fn: (body: BlockStmt[]) => BlockStmt[],
): ScriptProgram {
  return {
    ...program,
    events: program.events.map((evt) => {
      if (evt.id !== path.eventId) return evt;
      if (path.parents.length === 0) {
        return { ...evt, body: fn(evt.body) };
      }
      return { ...evt, body: mapDeep(evt.body, path.parents, path.bucket ?? "body", fn) };
    }),
  };
}

function mapDeep(
  body: BlockStmt[],
  parents: string[],
  bucket: "body" | "thenBody" | "elseBody",
  fn: (body: BlockStmt[]) => BlockStmt[],
): BlockStmt[] {
  const [head, ...rest] = parents;
  return body.map((s) => {
    if (s.id !== head) return s;
    if (rest.length === 0) {
      // Reached the target — fn applies to the matching bucket.
      switch (s.kind) {
        case "if":
          return bucket === "thenBody" ? { ...s, thenBody: fn(s.thenBody) } : s;
        case "if-else":
          if (bucket === "thenBody") return { ...s, thenBody: fn(s.thenBody) };
          if (bucket === "elseBody") return { ...s, elseBody: fn(s.elseBody) };
          return s;
        case "repeat-n":
        case "forever":
        case "repeat-until":
          return { ...s, body: fn(s.body) };
        default:
          return s;
      }
    }
    // Descend further — the target is nested below this statement.
    switch (s.kind) {
      case "if":
        return bucket === "thenBody" ? { ...s, thenBody: mapDeep(s.thenBody, rest, bucket, fn) } : s;
      case "if-else":
        if (bucket === "thenBody") return { ...s, thenBody: mapDeep(s.thenBody, rest, bucket, fn) };
        if (bucket === "elseBody") return { ...s, elseBody: mapDeep(s.elseBody, rest, bucket, fn) };
        return s;
      case "repeat-n":
      case "forever":
      case "repeat-until":
        return { ...s, body: mapDeep(s.body, rest, bucket, fn) };
      default:
        return s;
    }
  });
}

function walkAndPatch(
  body: BlockStmt[],
  stmtId: string,
  patch: (s: BlockStmt) => BlockStmt,
): BlockStmt[] {
  return body.map((s) => {
    if (s.id === stmtId) return patch(s);
    switch (s.kind) {
      case "if":
        return { ...s, thenBody: walkAndPatch(s.thenBody, stmtId, patch) };
      case "if-else":
        return {
          ...s,
          thenBody: walkAndPatch(s.thenBody, stmtId, patch),
          elseBody: walkAndPatch(s.elseBody, stmtId, patch),
        };
      case "repeat-n":
      case "forever":
      case "repeat-until":
        return { ...s, body: walkAndPatch(s.body, stmtId, patch) };
      default:
        return s;
    }
  });
}
