/**
 * BlockWorkspace — the canvas where authored event stacks live (gap #1007).
 *
 * Each top-level event handler (`scriptProgram.events[i]`) renders as
 * a vertical column: hat block on top, body stack below. Statements
 * nest into control bodies via the recursive BlockStmtView/renderBody
 * pair. The "+ Add block" affordance under each body opens the palette;
 * the picked block is appended to that body.
 *
 * Per the DRY rule: this component owns its own variable-name resolution
 * (sprite-local from `program.variables` + globals from
 * `gameState.globalVariables`) — callers don't drill a `variableNames`
 * prop.
 */

import { useState, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  BlockEventHandler,
  BlockStmt,
  ScriptProgram,
} from "@shared/game-blocks";
import {
  addEventHandler,
  appendStmt,
  emptyScriptProgram,
  removeEventHandler,
  removeStmt,
  updateEventHandler,
  updateStmt,
  type BodyPath,
} from "@shared/game-blocks";
import type { GameState } from "@shared/game-state";
import BlockStmtView from "./BlockStmtView";
import BlockPalette from "./BlockPalette";
import { CATEGORY_COLOR, EVENT_BLOCKS, findEventDef, STMT_BLOCKS } from "@/lib/studio/game/blocks/vocabulary";
import { KeyPicker } from "./pickers";

interface BlockWorkspaceProps {
  program: ScriptProgram | undefined;
  /** Update the entire program in one shot — host wraps in its own
   *  history commit. */
  onChange: (program: ScriptProgram) => void;
  gameState: GameState;
  /** Sprite's active level so the sprite-picker filters to in-frame
   *  options. */
  activeLevelId: string;
}

export default function BlockWorkspace({
  program: programProp,
  onChange,
  gameState,
  activeLevelId,
}: BlockWorkspaceProps) {
  const program = programProp ?? emptyScriptProgram();
  // The append-target body path — set when the user clicks "+ Add block"
  // on a specific body so the palette knows where to drop.
  const [appendTarget, setAppendTarget] = useState<BodyPath | null>(null);

  const variableNames = useMemo(() => {
    const local = program.variables.map((v) => v.name);
    const global = (gameState.globalVariables ?? []).map((v) => v.name);
    return Array.from(new Set([...local, ...global]));
  }, [program.variables, gameState.globalVariables]);

  const handleAddEvent = (eventKind: string) => {
    const def = EVENT_BLOCKS.find((e) => e.kind === eventKind);
    if (!def) return;
    onChange(addEventHandler(program, def.make()));
  };

  const handlePatchField = (stmtId: string, field: string, value: unknown) => {
    onChange(
      updateStmt(program, stmtId, (s) => ({ ...(s as object), [field]: value }) as unknown as BlockStmt),
    );
  };

  const handleRemoveStmt = (eventId: string, stmtId: string) => {
    // We don't know the parent path without walking — try the top-level
    // body of every event first; updateStmt's walker handles nested
    // removal via filter inside walkAndPatch (no — that's patch only).
    // Simpler: filter at every body level via a parallel walker.
    onChange(removeStmtAnywhere(program, eventId, stmtId));
  };

  const handleBodyAppend = (parentId: string, bucket: "body" | "thenBody" | "elseBody", newStmt: BlockStmt) => {
    // Compute the path from the event id by walking the program — we
    // know the parent stmt id, so the walker collects ancestors.
    const path = findPathToStmt(program, parentId, bucket);
    if (!path) return;
    onChange(appendStmt(program, path, newStmt));
  };

  const renderBody = (
    eventId: string,
    parents: string[],
    body: BlockStmt[],
    bucket: "body" | "thenBody" | "elseBody",
  ): React.ReactNode => {
    return (
      <>
        {body.map((stmt) => (
          <BlockStmtView
            key={stmt.id}
            stmt={stmt}
            program={program}
            gameState={gameState}
            variableNames={variableNames}
            activeLevelId={activeLevelId}
            onPatchField={handlePatchField}
            onBodyAppend={handleBodyAppend}
            onRemove={(id) => handleRemoveStmt(eventId, id)}
            renderBody={(parentStmtId, childBucket, childBody) =>
              renderBody(eventId, [...parents, parentStmtId], childBody, childBucket)
            }
          />
        ))}
        <button
          type="button"
          onClick={() => setAppendTarget({ eventId, parents, bucket })}
          className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-dashed border-muted-foreground/40 text-muted-foreground hover:bg-muted self-start"
        >
          <Plus className="w-3 h-3" /> Add block
        </button>
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Add event handler:</span>
        {EVENT_BLOCKS.map((evt) => {
          const palette = CATEGORY_COLOR[evt.category];
          return (
            <button
              type="button"
              key={evt.kind}
              onClick={() => handleAddEvent(evt.kind)}
              className="text-xs rounded-md px-2 py-0.5 border shadow-sm hover:brightness-110"
              style={{ background: palette.fill, color: palette.text, borderColor: palette.stroke }}
            >
              + {evt.label}
            </button>
          );
        })}
      </div>

      {program.events.length === 0 && (
        <div className="text-xs text-muted-foreground italic">
          No event handlers yet. Pick one above to start scripting.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {program.events.map((event) => (
          <div key={event.id} className="border rounded-md p-2 bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <HatBlock
                event={event}
                onChangeEvent={(next) =>
                  onChange(updateEventHandler(program, event.id, (e) => ({ ...e, event: next })))
                }
              />
              <button
                type="button"
                aria-label="Remove handler"
                onClick={() => onChange(removeEventHandler(program, event.id))}
                className="p-1 rounded hover:bg-muted"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <div className="flex flex-col gap-1 items-start">
              {renderBody(event.id, [], event.body, "body")}
            </div>
          </div>
        ))}
      </div>

      {appendTarget && (
        <BlockPalette
          onPick={(stmt) => {
            onChange(appendStmt(program, appendTarget, stmt));
            setAppendTarget(null);
          }}
          onClose={() => setAppendTarget(null)}
        />
      )}
    </div>
  );
}

function HatBlock({
  event,
  onChangeEvent,
}: {
  event: BlockEventHandler;
  onChangeEvent: (next: BlockEventHandler["event"]) => void;
}) {
  const palette = CATEGORY_COLOR.events;
  const def = findEventDef(event.event.kind);
  return (
    <div
      className="inline-flex items-center gap-2 rounded-lg px-3 py-1 text-sm border shadow-sm"
      style={{ background: palette.fill, color: palette.text, borderColor: palette.stroke }}
    >
      <select
        aria-label="event"
        value={event.event.kind}
        onChange={(e) => {
          const newKind = e.target.value;
          const d = EVENT_BLOCKS.find((b) => b.kind === newKind);
          if (d) onChangeEvent(d.make());
        }}
        className="rounded bg-white text-slate-900 px-1.5 py-0.5 text-xs border border-black/20"
      >
        {EVENT_BLOCKS.map((b) => (
          <option key={b.kind} value={b.kind}>
            {b.label}
          </option>
        ))}
      </select>
      {def?.arg?.type === "key" && event.event.kind === "on-key-press" && (
        <KeyPicker
          value={event.event.key}
          onChange={(k) => onChangeEvent({ kind: "on-key-press", key: k })}
        />
      )}
      {def?.arg?.type === "str" && event.event.kind === "on-receive" && (
        <input
          type="text"
          aria-label="message"
          placeholder="message"
          value={event.event.name}
          onChange={(e) => onChangeEvent({ kind: "on-receive", name: e.target.value })}
          className="w-24 rounded bg-white text-slate-900 px-1.5 py-0.5 text-xs border border-black/20"
        />
      )}
      {def?.arg?.type === "num" && event.event.kind === "every-seconds" && (
        <input
          type="number"
          aria-label="interval"
          min={0.1}
          step={0.1}
          value={event.event.interval}
          onChange={(e) => onChangeEvent({ kind: "every-seconds", interval: Number(e.target.value) || 1 })}
          className="w-16 rounded bg-white text-slate-900 px-1.5 py-0.5 text-xs border border-black/20"
        />
      )}
    </div>
  );
}

/** Find the BodyPath to a parent statement so we can append into the
 *  matching bucket. Walks the program tree once. */
function findPathToStmt(
  program: ScriptProgram,
  parentId: string,
  bucket: "body" | "thenBody" | "elseBody",
): BodyPath | null {
  for (const evt of program.events) {
    const path = walkForPath(evt.body, parentId, []);
    if (path) {
      return { eventId: evt.id, parents: [...path, parentId], bucket };
    }
    // Also handle the top-level body case where `parentId` matches a
    // direct child of the event body — but a "child of event body" isn't
    // a control block target; this only applies when parentId IS a
    // statement holding a body. Walker captures that.
  }
  return null;
}

function walkForPath(body: BlockStmt[], targetId: string, trail: string[]): string[] | null {
  for (const s of body) {
    if (s.id === targetId) return trail;
    if (s.kind === "if" || s.kind === "if-else") {
      const sub = walkForPath(s.thenBody, targetId, [...trail, s.id]);
      if (sub) return sub;
      if (s.kind === "if-else") {
        const sub2 = walkForPath(s.elseBody, targetId, [...trail, s.id]);
        if (sub2) return sub2;
      }
    } else if (s.kind === "repeat-n" || s.kind === "forever" || s.kind === "repeat-until") {
      const sub = walkForPath(s.body, targetId, [...trail, s.id]);
      if (sub) return sub;
    }
  }
  return null;
}

/** Generic recursive remove — `removeStmt` from the shared mutator only
 *  removes from a specific body path; the editor finds the stmt anywhere
 *  in the program. */
function removeStmtAnywhere(program: ScriptProgram, eventId: string, stmtId: string): ScriptProgram {
  return {
    ...program,
    events: program.events.map((evt) =>
      evt.id === eventId ? { ...evt, body: pruneBody(evt.body, stmtId) } : evt,
    ),
  };
}

function pruneBody(body: BlockStmt[], stmtId: string): BlockStmt[] {
  return body
    .filter((s) => s.id !== stmtId)
    .map((s) => {
      if (s.kind === "if") return { ...s, thenBody: pruneBody(s.thenBody, stmtId) };
      if (s.kind === "if-else") return { ...s, thenBody: pruneBody(s.thenBody, stmtId), elseBody: pruneBody(s.elseBody, stmtId) };
      if (s.kind === "repeat-n" || s.kind === "forever" || s.kind === "repeat-until") {
        return { ...s, body: pruneBody(s.body, stmtId) };
      }
      return s;
    });
}
