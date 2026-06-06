/**
 * DocumentStage — the paged WYSIWYG canvas runtime for `mediaKind: "document"`
 * (resume / job / article / blog). Self-hosting surface mounted by
 * `<CanvasRouter>` (like DrawingStage / CadStage), per the canvas-runtime
 * extensibility model. See `document-state.ts` for the state shape and the
 * unified-editor gap (#1912).
 *
 * This first runtime renders a `DocumentState` page at its true print size
 * (Letter/Legal/A4 × orientation, scaled by the editor zoom) and lets the
 * user compose the STRUCTURE: add / remove / reorder section + primitive
 * blocks, detach a block to an absolute bounding box, and (resume only) pick
 * the page size + orientation. Section blocks render a live summary of the
 * bound entity content when it's available.
 *
 * Still to land (tracked in the register): full-fidelity section rendering via
 * the generalized DeclarativeResumeRenderer, inline field editing (#1916),
 * interactive media overlays (#1913), and a left-rail drag-drop palette.
 */
import { useState } from "react";
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Maximize2,
  Plus,
  Trash2,
} from "lucide-react";
import type { ResumeContent } from "@shared/resume";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  type DocumentBlock,
  type DocumentState,
  pageDimensions,
  documentSupportsPageMode,
  PAGE_SIZES,
  type PageSize,
} from "@/lib/studio/editor-v2/document-state";
import {
  type DocumentSelection,
  RESUME_BLOCK_PRESETS,
  addBlock,
  firstPageId,
  moveBlock,
  removeBlock,
  setBlockMode,
  setOrientation,
  setPageSize,
} from "@/lib/studio/editor-v2/document-edit";

interface DocumentStageProps {
  state: DocumentState;
  setState: (updater: (prev: DocumentState) => DocumentState) => void;
  commit: () => void;
  zoom: number;
  /** The bound entity's content (resume today). Section blocks summarize it
   *  when present; null while a fresh draft has no saved content yet. */
  entityContent?: ResumeContent | null;
}

/** Compact display lines for a section block — a primary label per item.
 *  Lightweight by design; full-fidelity rendering is the renderer
 *  generalization tracked in #1912. */
function sectionItemLabels(
  content: ResumeContent | null | undefined,
  sectionKey: string | undefined,
): string[] {
  if (!content || !sectionKey) return [];
  const rows = (content as unknown as Record<string, unknown>)[sectionKey];
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 6).map((row) => {
    const r = row as Record<string, unknown>;
    const label =
      r.position ??
      r.name ??
      r.institution ??
      r.title ??
      r.organization ??
      r.language ??
      r.area ??
      "Item";
    return String(label);
  });
}

export default function DocumentStage({
  state,
  setState,
  commit,
  zoom,
  entityContent,
}: DocumentStageProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const pageId = firstPageId(state);
  const { width, height } = pageDimensions(state);
  const page = state.pages[0];
  const canSetPageMode = documentSupportsPageMode(state.entityKind);

  const commitState = (next: DocumentState) => {
    setState(() => next);
    commit();
  };

  const flowBlocks = page?.blocks.filter((b) => b.mode === "flow") ?? [];
  const absoluteBlocks = page?.blocks.filter((b) => b.mode === "absolute") ?? [];

  return (
    <div className="flex flex-col items-center gap-3">
      {/* ── Stage toolbar ── */}
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="default">
              <Plus className="mr-1 h-4 w-4" />
              Add block
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
            {RESUME_BLOCK_PRESETS.map((preset) => (
              <DropdownMenuItem
                key={preset.label}
                onSelect={() => {
                  const { state: next, blockId } = addBlock(state, pageId, preset);
                  commitState(next);
                  setSelectedBlockId(blockId);
                }}
              >
                {preset.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Page geometry — resume only (other entities are locked Letter
            portrait; the control self-gates via documentSupportsPageMode). */}
        {canSetPageMode && (
          <>
            <div className="mx-1 h-5 w-px bg-border" />
            <select
              value={state.pageSize}
              onChange={(e) =>
                commitState(setPageSize(state, e.target.value as PageSize))
              }
              aria-label="Page size"
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
            <div className="flex items-center rounded-md border border-border">
              <Button
                size="sm"
                variant={state.orientation === "portrait" ? "default" : "ghost"}
                className="rounded-r-none"
                onClick={() => commitState(setOrientation(state, "portrait"))}
              >
                Portrait
              </Button>
              <Button
                size="sm"
                variant={state.orientation === "landscape" ? "default" : "ghost"}
                className="rounded-l-none"
                onClick={() => commitState(setOrientation(state, "landscape"))}
              >
                Landscape
              </Button>
            </div>
          </>
        )}
      </div>

      {/* ── The page sheet (true print size × zoom) ── */}
      <div
        className="relative origin-top overflow-hidden bg-white text-slate-900 shadow-xl ring-1 ring-black/10"
        style={{
          width,
          height,
          transform: `scale(${zoom})`,
          fontFamily:
            state.theme.fontFamily === "serif"
              ? "Georgia, serif"
              : state.theme.fontFamily === "mono"
                ? "ui-monospace, monospace"
                : "Inter, system-ui, sans-serif",
        }}
        onClick={() => setSelectedBlockId(null)}
        role="presentation"
      >
        {/* Flow plane — ordered, top-to-bottom. */}
        <div className="flex flex-col gap-4 p-12">
          {flowBlocks.length === 0 && (
            <div className="rounded-md border-2 border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
              Empty page — use “Add block” to start building.
            </div>
          )}
          {flowBlocks.map((block) => (
            <DocumentBlockView
              key={block.id}
              block={block}
              selected={selectedBlockId === block.id}
              entityContent={entityContent}
              onSelect={(e) => {
                e.stopPropagation();
                setSelectedBlockId(block.id);
              }}
              onMoveUp={() => commitState(moveBlock(state, pageId, block.id, "up"))}
              onMoveDown={() => commitState(moveBlock(state, pageId, block.id, "down"))}
              onDelete={() => {
                commitState(removeBlock(state, pageId, block.id));
                setSelectedBlockId(null);
              }}
              onDetach={() =>
                commitState(setBlockMode(state, pageId, block.id, "absolute"))
              }
            />
          ))}
        </div>

        {/* Absolute plane — detached blocks positioned by their bounding box
            (fractions of the page). Reflow returns them to the flow plane. */}
        {absoluteBlocks.map((block) => {
          const box = block.box ?? { x: 0.1, y: 0.1, width: 0.4, height: 0.2, z: 1 };
          return (
            <div
              key={block.id}
              className="absolute"
              style={{
                left: box.x * width,
                top: box.y * height,
                width: box.width * width,
                minHeight: box.height * height,
                zIndex: box.z,
              }}
            >
              <DocumentBlockView
                block={block}
                selected={selectedBlockId === block.id}
                entityContent={entityContent}
                onSelect={(e) => {
                  e.stopPropagation();
                  setSelectedBlockId(block.id);
                }}
                onDelete={() => {
                  commitState(removeBlock(state, pageId, block.id));
                  setSelectedBlockId(null);
                }}
                onReflow={() =>
                  commitState(setBlockMode(state, pageId, block.id, "flow"))
                }
              />
            </div>
          );
        })}

        {/* Overlay plane — interactive media layers (#1913). Rendered as
            simple image/text overlays for now; full Widget reuse + drag lands
            with the interactive-media pass. */}
        {(page?.overlays ?? []).map((overlay) => {
          const pos = overlay.widget.position;
          return (
            <div
              key={overlay.widget.id}
              className="absolute"
              style={{
                left: pos.x * width,
                top: pos.y * height,
                width: pos.width * width,
                height: pos.height * height,
                zIndex: pos.z,
                transform: pos.rotation ? `rotate(${pos.rotation}deg)` : undefined,
              }}
            >
              <OverlayView overlay={overlay} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DocumentBlockView({
  block,
  selected,
  entityContent,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  onDetach,
  onReflow,
}: {
  block: DocumentBlock;
  selected: boolean;
  entityContent?: ResumeContent | null;
  onSelect: (e: React.MouseEvent) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete: () => void;
  onDetach?: () => void;
  onReflow?: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative rounded-md border p-3 transition",
        selected
          ? "border-brand-purple ring-2 ring-brand-purple/40"
          : "border-transparent hover:border-slate-200",
      )}
      onClick={onSelect}
      role="presentation"
    >
      {/* Per-block action bar — shown when selected. */}
      {selected && (
        <div className="absolute -top-3 right-2 z-10 flex items-center gap-1 rounded-full border border-border bg-white px-1 py-0.5 shadow-sm">
          {onMoveUp && (
            <button type="button" aria-label="Move up" className="p-1 hover:text-brand-purple" onClick={(e) => { e.stopPropagation(); onMoveUp(); }}>
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          )}
          {onMoveDown && (
            <button type="button" aria-label="Move down" className="p-1 hover:text-brand-purple" onClick={(e) => { e.stopPropagation(); onMoveDown(); }}>
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          )}
          {onDetach && (
            <button type="button" aria-label="Detach to free position" className="p-1 hover:text-brand-purple" onClick={(e) => { e.stopPropagation(); onDetach(); }}>
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          {onReflow && (
            <button type="button" aria-label="Return to flow" className="p-1 hover:text-brand-purple" onClick={(e) => { e.stopPropagation(); onReflow(); }}>
              <AlignLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" aria-label="Delete block" className="p-1 text-red-600 hover:text-red-700" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <BlockBody block={block} entityContent={entityContent} />
    </div>
  );
}

function BlockBody({
  block,
  entityContent,
}: {
  block: DocumentBlock;
  entityContent?: ResumeContent | null;
}) {
  if (block.kind === "divider") {
    return <hr className="my-2 border-slate-300" />;
  }
  if (block.kind === "spacer") {
    return <div className="h-8" aria-hidden="true" />;
  }
  if (block.kind === "text") {
    return (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
        {block.text || "Text block"}
      </p>
    );
  }
  if (block.kind === "image") {
    return block.imageUrl ? (
      <img src={block.imageUrl} alt="" className="max-h-40 rounded object-contain" />
    ) : (
      <div className="flex h-24 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
        Image
      </div>
    );
  }
  // section / component
  const labels = sectionItemLabels(entityContent, block.sectionKey);
  return (
    <div>
      <h3 className="mb-1 border-b border-slate-200 pb-0.5 text-sm font-semibold uppercase tracking-wide text-slate-800">
        {block.title ?? block.sectionKey ?? "Section"}
      </h3>
      {labels.length > 0 ? (
        <ul className="space-y-0.5 text-sm text-slate-700">
          {labels.map((l, i) => (
            <li key={i} className="truncate">
              {l}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs italic text-slate-400">
          No {block.sectionKey ?? "content"} yet
        </p>
      )}
    </div>
  );
}

function OverlayView({ overlay }: { overlay: import("@/lib/studio/editor-v2/document-state").DocumentOverlay }) {
  const params = overlay.widget.params as Record<string, unknown>;
  const url = typeof params.url === "string" ? params.url : null;
  if (url) {
    return <img src={url} alt="" className="h-full w-full rounded object-cover" />;
  }
  const text = typeof params.text === "string" ? params.text : "";
  return (
    <div className="flex h-full w-full items-center justify-center rounded bg-black/5 text-sm">
      {text}
    </div>
  );
}
