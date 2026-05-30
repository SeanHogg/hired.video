/**
 * BlockStmtView — renders one `BlockStmt` as a Scratch-shaped pill with
 * inline slot editors (gap #1007).
 *
 * The slot table from `vocabulary.ts` drives the layout:
 *   - text   → label span
 *   - expr   → recursive `BlockExprView` (drop target for an expression
 *               block; defaults to an inline number/text input for literal
 *               values so editing is one-click)
 *   - num/str→ direct typed input
 *   - key/var/level/sprite → dedicated picker controls
 *
 * For control blocks (`shape === "c-then"` / `"c-then-else"`) the body
 * renders as a nested column with its own list of `BlockStmtView`s.
 *
 * Per the DRY rule: this component owns its own slot dispatch — callers
 * never branch on stmt.kind. Adding a block is one row in `vocabulary.ts`
 * + (if it has new field types) one new SlotKind case here.
 */

import { Trash2 } from "lucide-react";
import type { BlockStmt, ScriptProgram } from "@shared/game-blocks";
import type { GameState } from "@shared/game-state";
import {
  CATEGORY_COLOR,
  findStmtDef,
  type SlotKind,
} from "@/lib/studio/game/blocks/vocabulary";
import BlockExprView from "./BlockExprView";
import { KeyPicker } from "./pickers";

interface BlockStmtViewProps {
  stmt: BlockStmt;
  program: ScriptProgram;
  gameState: GameState;
  /** All variable names in scope (sprite-local + global) so var pickers
   *  can self-populate without prop-drilling separate lists. */
  variableNames: string[];
  /** Active level — used by sprite pickers + level pickers so the
   *  controls only offer ids that actually exist on the game state. */
  activeLevelId: string;
  /** Field-update callback — host updates the stmt by id via the shared
   *  `updateStmt` mutator. */
  onPatchField: (stmtId: string, field: string, value: unknown) => void;
  /** Body-edit callback for control blocks — `bucket` distinguishes
   *  `if`'s thenBody from `if-else`'s elseBody. */
  onBodyAppend: (parentStmtId: string, bucket: "body" | "thenBody" | "elseBody", newStmt: BlockStmt) => void;
  /** Remove this statement. */
  onRemove: (stmtId: string) => void;
  /** Nested body renderer — recursive; host wires it so we don't import
   *  BlockBodyView at this level (would create a cycle). */
  renderBody: (parentStmtId: string, bucket: "body" | "thenBody" | "elseBody", body: BlockStmt[]) => React.ReactNode;
}

export default function BlockStmtView(props: BlockStmtViewProps) {
  const { stmt, program, gameState, variableNames, activeLevelId, onPatchField, onRemove, renderBody } = props;
  const def = findStmtDef(stmt);
  if (!def) {
    return (
      <div className="rounded-md bg-slate-500 px-3 py-1.5 text-xs text-white">
        unknown block: {stmt.kind}
      </div>
    );
  }
  const palette = CATEGORY_COLOR[def.category];
  return (
    <div
      className="rounded-lg px-3 py-1.5 text-sm shadow-sm border flex flex-col gap-1 self-start"
      style={{ background: palette.fill, borderColor: palette.stroke, color: palette.text }}
      data-block-kind={def.kind}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {def.slots.map((slot, i) => (
          <span key={i} className="inline-flex items-center">
            {renderSlot(slot, stmt, palette, {
              program,
              gameState,
              variableNames,
              activeLevelId,
              onPatchField,
            })}
          </span>
        ))}
        <button
          type="button"
          aria-label="Delete block"
          onClick={() => onRemove(stmt.id)}
          className="ml-1 p-0.5 rounded hover:bg-black/10"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {renderControlBody(stmt, renderBody)}
    </div>
  );
}

interface SlotRenderCtx {
  program: ScriptProgram;
  gameState: GameState;
  variableNames: string[];
  activeLevelId: string;
  onPatchField: (stmtId: string, field: string, value: unknown) => void;
}

function renderSlot(
  slot: SlotKind,
  stmt: BlockStmt,
  palette: { fill: string; stroke: string; text: string },
  ctx: SlotRenderCtx,
) {
  switch (slot.type) {
    case "text":
      return <span className="px-0.5 font-medium">{slot.text}</span>;
    case "expr": {
      const value = (stmt as unknown as Record<string, unknown>)[slot.field] as import("@shared/game-blocks").BlockExpr | undefined;
      if (!value) return null;
      return (
        <BlockExprView
          expr={value}
          variableNames={ctx.variableNames}
          activeLevelId={ctx.activeLevelId}
          gameState={ctx.gameState}
          onChange={(next) => ctx.onPatchField(stmt.id, slot.field, next)}
        />
      );
    }
    case "num": {
      const value = (stmt as unknown as Record<string, unknown>)[slot.field] as number | undefined;
      return (
        <input
          type="number"
          aria-label={slot.field}
          placeholder={slot.placeholder}
          className="w-16 rounded bg-white text-slate-900 px-1.5 py-0.5 text-xs border border-black/20"
          value={value ?? 0}
          onChange={(e) => ctx.onPatchField(stmt.id, slot.field, Number(e.target.value) || 0)}
        />
      );
    }
    case "str": {
      const value = (stmt as unknown as Record<string, unknown>)[slot.field] as string | undefined;
      return (
        <input
          type="text"
          aria-label={slot.field}
          placeholder={slot.placeholder}
          className="w-24 rounded bg-white text-slate-900 px-1.5 py-0.5 text-xs border border-black/20"
          value={value ?? ""}
          onChange={(e) => ctx.onPatchField(stmt.id, slot.field, e.target.value)}
        />
      );
    }
    case "key": {
      const value = (stmt as unknown as Record<string, unknown>)[slot.field] as string | undefined;
      return <KeyPicker value={value ?? ""} onChange={(k) => ctx.onPatchField(stmt.id, slot.field, k)} />;
    }
    case "var": {
      const value = (stmt as unknown as Record<string, unknown>)[slot.field] as string | undefined;
      return (
        <select
          aria-label="variable"
          value={value ?? ""}
          onChange={(e) => ctx.onPatchField(stmt.id, slot.field, e.target.value)}
          className="rounded bg-white text-slate-900 px-1.5 py-0.5 text-xs border border-black/20"
        >
          <option value="">(pick variable)</option>
          {ctx.variableNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      );
    }
    case "level": {
      const value = (stmt as unknown as Record<string, unknown>)[slot.field] as string | undefined;
      return (
        <select
          aria-label="level"
          value={value ?? ""}
          onChange={(e) => ctx.onPatchField(stmt.id, slot.field, e.target.value)}
          className="rounded bg-white text-slate-900 px-1.5 py-0.5 text-xs border border-black/20"
        >
          <option value="">(pick level)</option>
          {ctx.gameState.levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label || l.id}
            </option>
          ))}
        </select>
      );
    }
    case "sprite": {
      const value = (stmt as unknown as Record<string, unknown>)[slot.field] as string | undefined;
      const lvl = ctx.gameState.levels.find((l) => l.id === ctx.activeLevelId);
      return (
        <select
          aria-label="sprite"
          value={value ?? ""}
          onChange={(e) => ctx.onPatchField(stmt.id, slot.field, e.target.value)}
          className="rounded bg-white text-slate-900 px-1.5 py-0.5 text-xs border border-black/20"
        >
          <option value="">(pick sprite)</option>
          {(lvl?.sprites ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.assetId || s.id}
            </option>
          ))}
        </select>
      );
    }
    case "bool": {
      const value = (stmt as unknown as Record<string, unknown>)[slot.field] as boolean | undefined;
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => ctx.onPatchField(stmt.id, slot.field, e.target.checked)}
          className="accent-current"
        />
      );
    }
    default:
      return null;
  }
}

/** Walk the stmt's `kind` once and render the matching control-flow
 *  body slot(s). Keeps the discriminated-union narrowing tight so each
 *  branch reads cleanly without `as` casts. */
function renderControlBody(
  stmt: BlockStmt,
  renderBody: (parentStmtId: string, bucket: "body" | "thenBody" | "elseBody", body: BlockStmt[]) => React.ReactNode,
) {
  switch (stmt.kind) {
    case "if":
      return <NestedBody parentId={stmt.id} bucket="thenBody" body={stmt.thenBody} renderBody={renderBody} />;
    case "if-else":
      return (
        <>
          <NestedBody parentId={stmt.id} bucket="thenBody" body={stmt.thenBody} renderBody={renderBody} />
          <div className="text-xs italic opacity-80 ml-2">else</div>
          <NestedBody parentId={stmt.id} bucket="elseBody" body={stmt.elseBody} renderBody={renderBody} />
        </>
      );
    case "repeat-n":
    case "forever":
    case "repeat-until":
      return <NestedBody parentId={stmt.id} bucket="body" body={stmt.body} renderBody={renderBody} />;
    default:
      return null;
  }
}

function NestedBody({
  parentId,
  bucket,
  body,
  renderBody,
}: {
  parentId: string;
  bucket: "body" | "thenBody" | "elseBody";
  body: BlockStmt[];
  renderBody: (parentStmtId: string, bucket: "body" | "thenBody" | "elseBody", body: BlockStmt[]) => React.ReactNode;
}) {
  return (
    <div className="ml-3 pl-3 mt-1 border-l-4 border-black/30 flex flex-col gap-1 items-start">
      {renderBody(parentId, bucket, body)}
    </div>
  );
}
