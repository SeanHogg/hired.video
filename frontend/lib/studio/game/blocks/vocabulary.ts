/**
 * Block vocabulary (gap #1007 — Snap!/Scratch visual block editor).
 *
 * Pure UI metadata table: every authorable block kind declares its
 * category color + label + slot shape. The editor reads this to render
 * the palette + initialise default blocks; nothing in here mutates the
 * program — that goes through the shared `appendStmt` / `updateStmt`
 * mutators.
 *
 * Slot model — each block declares an ordered list of `slots`. The
 * SVG renderer walks them left-to-right with this contract:
 *   - `text`      — static label drawn between input slots ("move", "by")
 *   - `expr`      — drop target for a `BlockExpr`; renders as a rounded
 *                   field with the expression's inline editor
 *   - `num` / `str` — direct numeric / text input field bound to a
 *                   primitive value on the stmt (no nested expression)
 *   - `key`       — keyboard-key picker
 *   - `var`       — variable-name picker (sprite-local + global)
 *   - `level`     — level-id picker from the game state
 *   - `sprite`    — sprite-id picker from the level
 *   - `bool`      — checkbox
 *   - `text-static-from` — pulls the label text from a stmt field
 *
 * Categories follow Scratch's colour conventions so authors who learned
 * Scratch first see familiar colours.
 */

import type { BlockExpr, BlockStmt } from "@shared/game-blocks";
import { emptyExpr, newBlockId } from "@shared/game-blocks";

export type BlockCategory =
  | "events"
  | "motion"
  | "looks"
  | "sound"
  | "control"
  | "sensing"
  | "operators"
  | "variables";

export const CATEGORY_COLOR: Record<BlockCategory, { fill: string; stroke: string; text: string }> = {
  events:    { fill: "#facc15", stroke: "#a16207", text: "#422006" }, // yellow
  motion:    { fill: "#3b82f6", stroke: "#1d4ed8", text: "#ffffff" }, // blue
  looks:     { fill: "#a855f7", stroke: "#6b21a8", text: "#ffffff" }, // purple
  sound:     { fill: "#ec4899", stroke: "#9d174d", text: "#ffffff" }, // pink
  control:   { fill: "#f97316", stroke: "#9a3412", text: "#ffffff" }, // orange
  sensing:   { fill: "#06b6d4", stroke: "#0e7490", text: "#ffffff" }, // cyan
  operators: { fill: "#10b981", stroke: "#047857", text: "#ffffff" }, // emerald
  variables: { fill: "#ef4444", stroke: "#991b1b", text: "#ffffff" }, // red
};

export type SlotKind =
  | { type: "text"; text: string }
  | { type: "expr"; field: string }
  | { type: "num"; field: string; placeholder?: string }
  | { type: "str"; field: string; placeholder?: string }
  | { type: "key"; field: string }
  | { type: "var"; field: string }
  | { type: "level"; field: string }
  | { type: "sprite"; field: string }
  | { type: "bool"; field: string };

export interface BlockDef {
  /** Stmt `kind` (or `event:<eventKind>` for hat blocks). */
  kind: string;
  category: BlockCategory;
  /** Human label used in the palette + as the block's accessible name. */
  label: string;
  slots: SlotKind[];
  /** Shape:
   *   - "stack" — normal stacking statement
   *   - "hat"   — event handler at the top of a stack
   *   - "c-then"   — control block with one body (if / repeat / forever)
   *   - "c-then-else" — if-else with two bodies */
  shape: "stack" | "hat" | "c-then" | "c-then-else";
  /** Factory for a fresh instance with default field values. */
  make: () => BlockStmt;
}

/** Statement block definitions, ordered for the palette. */
export const STMT_BLOCKS: BlockDef[] = [
  // ── Motion ─────────────────────────────────────────────────────────────
  {
    kind: "move-by",
    category: "motion",
    label: "move",
    shape: "stack",
    slots: [
      { type: "text", text: "move x" },
      { type: "expr", field: "dx" },
      { type: "text", text: "y" },
      { type: "expr", field: "dy" },
    ],
    make: () => ({ id: newBlockId("mv"), kind: "move-by", dx: emptyExpr(), dy: emptyExpr() }),
  },
  {
    kind: "set-position",
    category: "motion",
    label: "set position",
    shape: "stack",
    slots: [
      { type: "text", text: "go to x" },
      { type: "expr", field: "x" },
      { type: "text", text: "y" },
      { type: "expr", field: "y" },
    ],
    make: () => ({ id: newBlockId("pos"), kind: "set-position", x: emptyExpr(), y: emptyExpr() }),
  },
  {
    kind: "set-property:width",
    category: "motion",
    label: "set width",
    shape: "stack",
    slots: [
      { type: "text", text: "set width to" },
      { type: "expr", field: "value" },
    ],
    make: () => ({ id: newBlockId("sw"), kind: "set-property", property: "width", value: emptyExpr() }),
  },
  {
    kind: "set-property:height",
    category: "motion",
    label: "set height",
    shape: "stack",
    slots: [
      { type: "text", text: "set height to" },
      { type: "expr", field: "value" },
    ],
    make: () => ({ id: newBlockId("sh"), kind: "set-property", property: "height", value: emptyExpr() }),
  },
  // ── Looks ──────────────────────────────────────────────────────────────
  {
    kind: "show",
    category: "looks",
    label: "show",
    shape: "stack",
    slots: [{ type: "text", text: "show" }],
    make: () => ({ id: newBlockId("show"), kind: "show" }),
  },
  {
    kind: "hide",
    category: "looks",
    label: "hide",
    shape: "stack",
    slots: [{ type: "text", text: "hide" }],
    make: () => ({ id: newBlockId("hide"), kind: "hide" }),
  },
  {
    kind: "set-message",
    category: "looks",
    label: "say",
    shape: "stack",
    slots: [
      { type: "text", text: "say" },
      { type: "expr", field: "text" },
    ],
    make: () => ({ id: newBlockId("say"), kind: "set-message", text: { kind: "literal-str", value: "" } }),
  },
  // ── Sound ──────────────────────────────────────────────────────────────
  {
    kind: "play-sound",
    category: "sound",
    label: "play sound",
    shape: "stack",
    slots: [
      { type: "text", text: "play sound" },
      { type: "str", field: "assetId", placeholder: "asset id" },
    ],
    make: () => ({ id: newBlockId("snd"), kind: "play-sound", assetId: "" }),
  },
  // ── Control ────────────────────────────────────────────────────────────
  {
    kind: "wait-seconds",
    category: "control",
    label: "wait seconds",
    shape: "stack",
    slots: [
      { type: "text", text: "wait" },
      { type: "expr", field: "seconds" },
      { type: "text", text: "seconds" },
    ],
    make: () => ({ id: newBlockId("wait"), kind: "wait-seconds", seconds: { kind: "literal-num", value: 1 } }),
  },
  {
    kind: "if",
    category: "control",
    label: "if",
    shape: "c-then",
    slots: [
      { type: "text", text: "if" },
      { type: "expr", field: "condition" },
      { type: "text", text: "then" },
    ],
    make: () => ({ id: newBlockId("if"), kind: "if", condition: { kind: "literal-bool", value: true }, thenBody: [] }),
  },
  {
    kind: "if-else",
    category: "control",
    label: "if/else",
    shape: "c-then-else",
    slots: [
      { type: "text", text: "if" },
      { type: "expr", field: "condition" },
    ],
    make: () => ({ id: newBlockId("ifelse"), kind: "if-else", condition: { kind: "literal-bool", value: true }, thenBody: [], elseBody: [] }),
  },
  {
    kind: "repeat-n",
    category: "control",
    label: "repeat N",
    shape: "c-then",
    slots: [
      { type: "text", text: "repeat" },
      { type: "expr", field: "count" },
    ],
    make: () => ({ id: newBlockId("rep"), kind: "repeat-n", count: { kind: "literal-num", value: 10 }, body: [] }),
  },
  {
    kind: "forever",
    category: "control",
    label: "forever",
    shape: "c-then",
    slots: [{ type: "text", text: "forever" }],
    make: () => ({ id: newBlockId("fvr"), kind: "forever", body: [] }),
  },
  {
    kind: "repeat-until",
    category: "control",
    label: "repeat until",
    shape: "c-then",
    slots: [
      { type: "text", text: "repeat until" },
      { type: "expr", field: "condition" },
    ],
    make: () => ({ id: newBlockId("rpu"), kind: "repeat-until", condition: { kind: "literal-bool", value: false }, body: [] }),
  },
  {
    kind: "wait-until",
    category: "control",
    label: "wait until",
    shape: "stack",
    slots: [
      { type: "text", text: "wait until" },
      { type: "expr", field: "condition" },
    ],
    make: () => ({ id: newBlockId("wun"), kind: "wait-until", condition: { kind: "literal-bool", value: true } }),
  },
  {
    kind: "goto-level",
    category: "control",
    label: "goto level",
    shape: "stack",
    slots: [
      { type: "text", text: "goto level" },
      { type: "level", field: "levelId" },
    ],
    make: () => ({ id: newBlockId("gl"), kind: "goto-level", levelId: "" }),
  },
  // ── Variables ──────────────────────────────────────────────────────────
  {
    kind: "set-var",
    category: "variables",
    label: "set var",
    shape: "stack",
    slots: [
      { type: "text", text: "set" },
      { type: "var", field: "name" },
      { type: "text", text: "to" },
      { type: "expr", field: "value" },
    ],
    make: () => ({ id: newBlockId("set"), kind: "set-var", name: "", value: emptyExpr() }),
  },
  {
    kind: "change-var-by",
    category: "variables",
    label: "change var by",
    shape: "stack",
    slots: [
      { type: "text", text: "change" },
      { type: "var", field: "name" },
      { type: "text", text: "by" },
      { type: "expr", field: "delta" },
    ],
    make: () => ({ id: newBlockId("chg"), kind: "change-var-by", name: "", delta: emptyExpr() }),
  },
  // ── Events / Broadcasts ────────────────────────────────────────────────
  {
    kind: "broadcast",
    category: "events",
    label: "broadcast",
    shape: "stack",
    slots: [
      { type: "text", text: "broadcast" },
      { type: "str", field: "name", placeholder: "message" },
    ],
    make: () => ({ id: newBlockId("bc"), kind: "broadcast", name: "" }),
  },
];

/** Event-handler (hat block) definitions. Triggers a fresh
 *  `BlockEventHandler` rather than a stmt. */
export interface EventDef {
  kind: string;
  category: BlockCategory;
  label: string;
  /** Optional inline slot — `key` for on-key-press, `str` for on-receive,
   *  `num` for every-seconds interval. */
  arg?: SlotKind & { field: "key" | "name" | "interval" };
  make: () => import("@shared/game-blocks").BlockEventHandler["event"];
}

export const EVENT_BLOCKS: EventDef[] = [
  {
    kind: "on-level-mount",
    category: "events",
    label: "when level starts",
    make: () => ({ kind: "on-level-mount" }),
  },
  {
    kind: "on-tick",
    category: "events",
    label: "every tick",
    make: () => ({ kind: "on-tick" }),
  },
  {
    kind: "on-key-press",
    category: "events",
    label: "when key pressed",
    arg: { type: "key", field: "key" },
    make: () => ({ kind: "on-key-press", key: "ArrowRight" }),
  },
  {
    kind: "on-click",
    category: "events",
    label: "when clicked",
    make: () => ({ kind: "on-click" }),
  },
  {
    kind: "on-receive",
    category: "events",
    label: "when I receive",
    arg: { type: "str", field: "name", placeholder: "message" },
    make: () => ({ kind: "on-receive", name: "" }),
  },
  {
    kind: "every-seconds",
    category: "events",
    label: "every N seconds",
    arg: { type: "num", field: "interval" },
    make: () => ({ kind: "every-seconds", interval: 1 }),
  },
];

/** Expression block definitions — produce `BlockExpr` values for slots. */
export interface ExprDef {
  kind: BlockExpr["kind"];
  category: BlockCategory;
  label: string;
  /** Slot layout, same shape as STMT_BLOCKS — but slots address fields
   *  on the expression, and the `expr` slot type recurses. */
  slots: SlotKind[];
  make: () => BlockExpr;
}

export const EXPR_BLOCKS: ExprDef[] = [
  // Literals (the editor inlines a typed input directly when a slot is
  // dropped; these factory entries cover the explicit-block surface for
  // tests + a future "blockify" agent path).
  {
    kind: "literal-num",
    category: "operators",
    label: "number",
    slots: [{ type: "num", field: "value" }],
    make: () => ({ kind: "literal-num", value: 0 }),
  },
  {
    kind: "literal-str",
    category: "operators",
    label: "text",
    slots: [{ type: "str", field: "value", placeholder: "text" }],
    make: () => ({ kind: "literal-str", value: "" }),
  },
  {
    kind: "var-ref",
    category: "variables",
    label: "var",
    slots: [{ type: "var", field: "name" }],
    make: () => ({ kind: "var-ref", name: "" }),
  },
  {
    kind: "math-op",
    category: "operators",
    label: "math",
    slots: [
      { type: "expr", field: "left" },
      { type: "text", text: "+" },
      { type: "expr", field: "right" },
    ],
    make: () => ({ kind: "math-op", op: "+", left: emptyExpr(), right: emptyExpr() }),
  },
  {
    kind: "compare",
    category: "operators",
    label: "compare",
    slots: [
      { type: "expr", field: "left" },
      { type: "text", text: "=" },
      { type: "expr", field: "right" },
    ],
    make: () => ({ kind: "compare", op: "eq", left: emptyExpr(), right: emptyExpr() }),
  },
  {
    kind: "and",
    category: "operators",
    label: "and",
    slots: [
      { type: "expr", field: "left" },
      { type: "text", text: "and" },
      { type: "expr", field: "right" },
    ],
    make: () => ({ kind: "and", left: emptyExpr(), right: emptyExpr() }),
  },
  {
    kind: "or",
    category: "operators",
    label: "or",
    slots: [
      { type: "expr", field: "left" },
      { type: "text", text: "or" },
      { type: "expr", field: "right" },
    ],
    make: () => ({ kind: "or", left: emptyExpr(), right: emptyExpr() }),
  },
  {
    kind: "not",
    category: "operators",
    label: "not",
    slots: [
      { type: "text", text: "not" },
      { type: "expr", field: "value" },
    ],
    make: () => ({ kind: "not", value: emptyExpr() }),
  },
  {
    kind: "random-range",
    category: "operators",
    label: "random",
    slots: [
      { type: "text", text: "random" },
      { type: "expr", field: "min" },
      { type: "text", text: "to" },
      { type: "expr", field: "max" },
    ],
    make: () => ({ kind: "random-range", min: { kind: "literal-num", value: 1 }, max: { kind: "literal-num", value: 10 } }),
  },
  {
    kind: "round",
    category: "operators",
    label: "round",
    slots: [
      { type: "text", text: "round" },
      { type: "expr", field: "value" },
    ],
    make: () => ({ kind: "round", value: emptyExpr() }),
  },
  {
    kind: "join",
    category: "operators",
    label: "join",
    slots: [
      { type: "text", text: "join" },
      { type: "expr", field: "left" },
      { type: "expr", field: "right" },
    ],
    make: () => ({ kind: "join", left: { kind: "literal-str", value: "" }, right: { kind: "literal-str", value: "" } }),
  },
  {
    kind: "length-of",
    category: "operators",
    label: "length of",
    slots: [
      { type: "text", text: "length of" },
      { type: "expr", field: "value" },
    ],
    make: () => ({ kind: "length-of", value: { kind: "literal-str", value: "" } }),
  },
  {
    kind: "mouse-x",
    category: "sensing",
    label: "mouse x",
    slots: [{ type: "text", text: "mouse x" }],
    make: () => ({ kind: "mouse-x" }),
  },
  {
    kind: "mouse-y",
    category: "sensing",
    label: "mouse y",
    slots: [{ type: "text", text: "mouse y" }],
    make: () => ({ kind: "mouse-y" }),
  },
  {
    kind: "key-pressed?",
    category: "sensing",
    label: "key pressed?",
    slots: [
      { type: "key", field: "key" },
      { type: "text", text: "pressed?" },
    ],
    make: () => ({ kind: "key-pressed?", key: "ArrowRight" }),
  },
  {
    kind: "distance-to",
    category: "sensing",
    label: "distance to",
    slots: [
      { type: "text", text: "distance to" },
      { type: "sprite", field: "spriteId" },
    ],
    make: () => ({ kind: "distance-to", spriteId: "" }),
  },
  {
    kind: "timer",
    category: "sensing",
    label: "timer",
    slots: [{ type: "text", text: "timer" }],
    make: () => ({ kind: "timer" }),
  },
];

/** Lookup a stmt definition by its `kind` (or `set-property:width` /
 *  `set-property:height` for the property branch). Returns undefined for
 *  unknown kinds — the renderer falls back to a generic block. */
export function findStmtDef(stmt: BlockStmt): BlockDef | undefined {
  if (stmt.kind === "set-property") {
    const sub = `set-property:${stmt.property}`;
    return STMT_BLOCKS.find((b) => b.kind === sub);
  }
  return STMT_BLOCKS.find((b) => b.kind === stmt.kind);
}

export function findExprDef(expr: BlockExpr): ExprDef | undefined {
  return EXPR_BLOCKS.find((b) => b.kind === expr.kind);
}

export function findEventDef(eventKind: string): EventDef | undefined {
  return EVENT_BLOCKS.find((b) => b.kind === eventKind);
}
