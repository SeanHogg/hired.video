/**
 * BlockExprView — renders one `BlockExpr` slot (gap #1007).
 *
 * Two display modes:
 *   - For `literal-num` / `literal-str` / `literal-bool` / `var-ref` / `key-pressed?`
 *     this renders an inline typed input so the most common case stays
 *     one-click to edit (no "drop a block here" friction for
 *     constants).
 *   - For every other kind it renders a small Scratch-shaped pill with
 *     the operator + its nested slots.
 *
 * Users change the expression KIND via a dropdown at the leading edge —
 * Scratch's authoring model is "drag a block to replace the slot"; ours
 * collapses that to a single picker so non-coders can swap one literal
 * for `random` / `var-ref` / `mouse-x` without learning drag mechanics.
 */

import { ChevronDown } from "lucide-react";
import type { BlockExpr } from "@shared/game-blocks";
import type { GameState } from "@shared/game-state";
import { emptyExpr } from "@shared/game-blocks";
import {
  CATEGORY_COLOR,
  EXPR_BLOCKS,
  findExprDef,
} from "@/lib/studio/game/blocks/vocabulary";
import { KeyPicker } from "./pickers";

interface BlockExprViewProps {
  expr: BlockExpr;
  variableNames: string[];
  activeLevelId: string;
  gameState: GameState;
  onChange: (next: BlockExpr) => void;
}

export default function BlockExprView(props: BlockExprViewProps) {
  const { expr, variableNames, activeLevelId, gameState, onChange } = props;
  const def = findExprDef(expr);
  const palette = def ? CATEGORY_COLOR[def.category] : CATEGORY_COLOR.operators;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 border text-xs"
      style={{ background: palette.fill, borderColor: palette.stroke, color: palette.text }}
    >
      <KindPicker expr={expr} onChange={onChange} />
      {def?.slots.map((slot, i) => {
        switch (slot.type) {
          case "text":
            return <span key={i} className="px-0.5">{slot.text}</span>;
          case "expr": {
            const value = (expr as unknown as Record<string, unknown>)[slot.field] as BlockExpr | undefined;
            if (!value) return null;
            return (
              <BlockExprView
                key={i}
                expr={value}
                variableNames={variableNames}
                activeLevelId={activeLevelId}
                gameState={gameState}
                onChange={(next) => onChange(patch(expr, slot.field, next))}
              />
            );
          }
          case "num": {
            const value = (expr as unknown as Record<string, unknown>)[slot.field] as number | undefined;
            return (
              <input
                key={i}
                type="number"
                aria-label={slot.field}
                className="w-14 rounded bg-white text-slate-900 px-1 py-0.5 text-xs border border-black/20"
                value={value ?? 0}
                onChange={(e) => onChange(patch(expr, slot.field, Number(e.target.value) || 0))}
              />
            );
          }
          case "str": {
            const value = (expr as unknown as Record<string, unknown>)[slot.field] as string | undefined;
            return (
              <input
                key={i}
                type="text"
                aria-label={slot.field}
                placeholder={slot.placeholder}
                className="w-16 rounded bg-white text-slate-900 px-1 py-0.5 text-xs border border-black/20"
                value={value ?? ""}
                onChange={(e) => onChange(patch(expr, slot.field, e.target.value))}
              />
            );
          }
          case "key": {
            const value = (expr as unknown as Record<string, unknown>)[slot.field] as string | undefined;
            return (
              <KeyPicker
                key={i}
                value={value ?? ""}
                onChange={(k) => onChange(patch(expr, slot.field, k))}
              />
            );
          }
          case "var": {
            const value = (expr as unknown as Record<string, unknown>)[slot.field] as string | undefined;
            return (
              <select
                key={i}
                aria-label="variable"
                value={value ?? ""}
                onChange={(e) => onChange(patch(expr, slot.field, e.target.value))}
                className="rounded bg-white text-slate-900 px-1 py-0.5 text-xs border border-black/20"
              >
                <option value="">(var)</option>
                {variableNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            );
          }
          case "sprite": {
            const value = (expr as unknown as Record<string, unknown>)[slot.field] as string | undefined;
            const lvl = gameState.levels.find((l) => l.id === activeLevelId);
            return (
              <select
                key={i}
                aria-label="sprite"
                value={value ?? ""}
                onChange={(e) => onChange(patch(expr, slot.field, e.target.value))}
                className="rounded bg-white text-slate-900 px-1 py-0.5 text-xs border border-black/20"
              >
                <option value="">(sprite)</option>
                {(lvl?.sprites ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.assetId || s.id}</option>
                ))}
              </select>
            );
          }
          default:
            return null;
        }
      })}
      {expr.kind === "math-op" && (
        <select
          aria-label="operator"
          value={expr.op}
          onChange={(e) => onChange({ ...expr, op: e.target.value as "+" | "-" | "*" | "/" | "mod" })}
          className="rounded bg-white text-slate-900 px-0.5 py-0.5 text-xs border border-black/20"
        >
          <option value="+">+</option>
          <option value="-">−</option>
          <option value="*">×</option>
          <option value="/">÷</option>
          <option value="mod">mod</option>
        </select>
      )}
      {expr.kind === "compare" && (
        <select
          aria-label="comparator"
          value={expr.op}
          onChange={(e) => onChange({ ...expr, op: e.target.value as "eq" | "lt" | "gt" })}
          className="rounded bg-white text-slate-900 px-0.5 py-0.5 text-xs border border-black/20"
        >
          <option value="eq">=</option>
          <option value="lt">&lt;</option>
          <option value="gt">&gt;</option>
        </select>
      )}
    </span>
  );
}

function patch(expr: BlockExpr, field: string, value: unknown): BlockExpr {
  return { ...(expr as object), [field]: value } as BlockExpr;
}

/** Inline kind-swap dropdown — replaces the entire expression with a fresh
 *  instance of the chosen kind. Keeps the same slot position; user picks
 *  the new content via the rendered slots of the new kind. */
function KindPicker({ expr, onChange }: { expr: BlockExpr; onChange: (next: BlockExpr) => void }) {
  return (
    <span className="inline-flex items-center">
      <select
        aria-label="kind"
        value={expr.kind}
        onChange={(e) => {
          const newKind = e.target.value as BlockExpr["kind"];
          const def = EXPR_BLOCKS.find((b) => b.kind === newKind);
          onChange(def ? def.make() : emptyExpr());
        }}
        className="rounded bg-white text-slate-900 px-1 py-0.5 text-[10px] border border-black/20 uppercase tracking-wide"
      >
        {EXPR_BLOCKS.map((b) => (
          <option key={b.kind} value={b.kind}>
            {b.label}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3 h-3 -ml-1.5 pointer-events-none opacity-60" />
    </span>
  );
}
