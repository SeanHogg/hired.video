/**
 * BlockPalette — Scratch-style category picker mounted as a popover when
 * the user clicks "+ Add block" in the workspace (gap #1007).
 *
 * Tabs by category; selecting a block calls `onPick` with a fresh stmt
 * (the vocabulary's `make()` factory) and closes the popover. The
 * workspace then appends it to the right body via `appendStmt`.
 */

import { useState } from "react";
import { X } from "lucide-react";
import type { BlockStmt } from "@shared/game-blocks";
import {
  CATEGORY_COLOR,
  STMT_BLOCKS,
  type BlockCategory,
  type BlockDef,
} from "@/lib/studio/game/blocks/vocabulary";

const CATEGORY_ORDER: BlockCategory[] = [
  "motion",
  "looks",
  "sound",
  "control",
  "sensing",
  "operators",
  "variables",
  "events",
];

const CATEGORY_LABEL: Record<BlockCategory, string> = {
  motion: "Motion",
  looks: "Looks",
  sound: "Sound",
  control: "Control",
  sensing: "Sensing",
  operators: "Operators",
  variables: "Variables",
  events: "Events",
};

export default function BlockPalette({
  onPick,
  onClose,
}: {
  onPick: (stmt: BlockStmt) => void;
  onClose: () => void;
}) {
  const [active, setActive] = useState<BlockCategory>("motion");
  const blocks = STMT_BLOCKS.filter((b) => b.category === active);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="bg-background rounded-lg shadow-xl border w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="text-sm font-medium">Add a block</h3>
          <button
            type="button"
            aria-label="Close palette"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-32 border-r overflow-y-auto py-2">
            {CATEGORY_ORDER.map((cat) => {
              const palette = CATEGORY_COLOR[cat];
              const isActive = active === cat;
              return (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setActive(cat)}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                    isActive ? "bg-muted font-medium" : "hover:bg-muted/50"
                  }`}
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full border"
                    style={{ background: palette.fill, borderColor: palette.stroke }}
                  />
                  {CATEGORY_LABEL[cat]}
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 items-start">
            {blocks.length === 0 && (
              <div className="text-xs text-muted-foreground italic">
                No blocks in this category yet.
              </div>
            )}
            {blocks.map((b) => (
              <PaletteTile key={b.kind} def={b} onPick={onPick} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PaletteTile({ def, onPick }: { def: BlockDef; onPick: (stmt: BlockStmt) => void }) {
  const palette = CATEGORY_COLOR[def.category];
  return (
    <button
      type="button"
      onClick={() => onPick(def.make())}
      className="rounded-md px-3 py-1.5 text-xs border shadow-sm hover:brightness-110 transition-all text-left"
      style={{ background: palette.fill, color: palette.text, borderColor: palette.stroke }}
    >
      {def.label}
    </button>
  );
}
