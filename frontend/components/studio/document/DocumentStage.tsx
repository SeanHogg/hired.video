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
 * the page size + orientation. Section blocks are inline-editable (#1916) when
 * content + an `onContentChange` are bound; otherwise they render through the
 * SHARED read renderer (`DocumentView`'s `BlockView`) — the same one the PDF
 * export uses — so the on-canvas WYSIWYG and the export never drift.
 *
 * Still to land (tracked in the register): 2-column / sidebar print layouts
 * (#1917b — all blocks render in one flow plane today), interactive media
 * overlays (#1913), and a left-rail drag-drop palette.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { AlignLeft, ArrowDown, ArrowUp, Maximize2, Trash2 } from "lucide-react";
import SectionEditor from "@/components/studio/document/SectionEditor";
import { documentSectionSchema } from "@/lib/studio/document/document-field-schema";
import { cn } from "@/lib/utils";
import {
  type DocumentBlock,
  type DocumentEntityContent,
  type DocumentEntityKind,
  type DocumentState,
  pageDimensions,
} from "@/lib/studio/editor-v2/document-state";
import {
  resolveDocumentTheme,
  type ResolvedDocumentTheme,
} from "@/lib/studio/editor-v2/document-theme";
import {
  blockPresetsForEntity,
  firstPageId,
  insertBlockAt,
  moveBlock,
  removeBlock,
  setBlockMode,
  updateBlock,
} from "@/lib/studio/editor-v2/document-edit";
import { DOCUMENT_BLOCK_DRAG_MIME } from "@/components/studio/document/DocumentLeftPanel";
import DocumentPagedView, {
  DocumentViewModeToggle,
  type DocumentViewMode,
} from "@/components/studio/document/DocumentPagedView";
import { BlockView } from "@/components/studio/document/DocumentView";

interface DocumentStageProps {
  state: DocumentState;
  setState: (updater: (prev: DocumentState) => DocumentState) => void;
  commit: () => void;
  zoom: number;
  /** The bound entity's content (resume / job …). Section blocks render it —
   *  editable when `onContentChange` is supplied, read-only summary otherwise.
   *  null while a fresh draft has no content yet. */
  entityContent?: DocumentEntityContent | null;
  /** When supplied, section blocks become inline-editable (#1916) and edits
   *  flow back through here; the host owns persistence. */
  onContentChange?: (next: DocumentEntityContent) => void;
}

export default function DocumentStage({
  state,
  setState,
  commit,
  zoom,
  entityContent,
  onContentChange,
}: DocumentStageProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  // "One Page" = the editable continuous authoring sheet; "Individual Pages" =
  // a read-only two-up book spread for reviewing how the resume paginates.
  const [viewMode, setViewMode] = useState<DocumentViewMode>("continuous");
  const pageId = firstPageId(state);
  const { width, height } = pageDimensions(state);
  const page = state.pages[0];
  const theme = resolveDocumentTheme(state.theme);

  const commitState = (next: DocumentState) => {
    setState(() => next);
    commit();
  };

  const flowBlocks = page?.blocks.filter((b) => b.mode === "flow") ?? [];
  const absoluteBlocks = page?.blocks.filter((b) => b.mode === "absolute") ?? [];

  // ── Auto-pagination by height ──
  // The sheet GROWS to fit its content (no clipping); we measure the rendered
  // height and draw a page-break guide + "Page N" label every print-page
  // height, so the user sees page 1 / 2 / 3 even though authoring is one
  // continuous flow. The browser's @page handles the real breaks on print/PDF.
  const sheetRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);
  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    // scrollHeight is the unscaled layout height (transform: scale doesn't
    // affect it), so it's the true content height in page px.
    const n = Math.max(1, Math.ceil(el.scrollHeight / height));
    setPageCount((prev) => (prev === n ? prev : n));
  });

  return (
    <div className="flex flex-col items-center gap-3">
      {/* View-mode toggle — One Page (editable continuous sheet) vs Individual
          Pages (read-only two-up flip spread). Self-contained here so the
          stage owns its own display mode. */}
      <DocumentViewModeToggle value={viewMode} onChange={setViewMode} />

      {viewMode === "paged" ? (
        // Drive the spread off the editor `zoom` (the bottom-right slider) —
        // the SAME scale the One Page sheet uses — instead of the view's
        // fit-to-width fallback. The stage mounts inside a shrink-to-content
        // centering flex (`min-w-min`), so fit-to-width would read a collapsed
        // `clientWidth` and render the pages tiny, AND the slider would be inert
        // here. Passing `zoom` makes the slider control the spread too.
        <DocumentPagedView
          state={state}
          content={entityContent}
          mode="paged"
          zoom={zoom}
          className="w-full"
        />
      ) : (
      /* ── The page sheet (true print width × zoom; grows in height, with
            per-page break guides). The authoring toolbar lives in the editor
            footer (<DocumentToolbar>), not here. ── */
      <div
        ref={sheetRef}
        // `force-light-scope` pins color-scheme + the design tokens to light
        // for the whole sheet (the same mechanism the read-only renderers use).
        // The sheet is fixed white paper, so under the app's dark theme its
        // inline-editing controls (SectionEditor inputs) would otherwise inherit
        // the dark theme.text onto a dark native field background and become
        // unreadable. Pinning light makes inputs white-bg/dark-text again.
        className="force-light-scope relative origin-top shadow-xl ring-1 ring-black/10"
        style={{
          width,
          minHeight: height,
          transform: `scale(${zoom})`,
          background: "#fff",
          color: theme.text,
          fontFamily: theme.fontFamily,
        }}
        onClick={() => setSelectedBlockId(null)}
        onDragOver={(e) => {
          // Accept palette drags (DocumentLeftPanel section chips).
          if (e.dataTransfer.types.includes(DOCUMENT_BLOCK_DRAG_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData(DOCUMENT_BLOCK_DRAG_MIME);
          if (!raw) return;
          e.preventDefault();
          const preset = blockPresetsForEntity(state.entityKind)[Number(raw)];
          if (!preset) return;
          // Drop-at-cursor: insert before the first flow block whose vertical
          // midpoint is below the drop point; append when dropped past the end.
          const dropY = e.clientY;
          let beforeId: string | null = null;
          const sheet = sheetRef.current;
          if (sheet) {
            const els = sheet.querySelectorAll<HTMLElement>("[data-doc-flow-id]");
            for (const el of Array.from(els)) {
              const r = el.getBoundingClientRect();
              if (dropY < r.top + r.height / 2) {
                beforeId = el.dataset.docFlowId ?? null;
                break;
              }
            }
          }
          const { state: next, blockId } = insertBlockAt(state, pageId, preset, beforeId);
          commitState(next);
          setSelectedBlockId(blockId);
        }}
        role="presentation"
      >
        {/* Page-break guides — one dashed line + "Page N" label per print page
            boundary. pointer-events-none so they don't intercept block clicks. */}
        {Array.from({ length: pageCount }).map((_, i) => (
          <div
            key={`page-label-${i}`}
            className="pointer-events-none absolute right-3 text-[10px] font-medium uppercase tracking-wide text-slate-300"
            style={{ top: i * height + 8 }}
          >
            Page {i + 1}
          </div>
        ))}
        {Array.from({ length: Math.max(0, pageCount - 1) }).map((_, i) => (
          <div
            key={`page-break-${i}`}
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-300"
            style={{ top: (i + 1) * height }}
          />
        ))}

        {/* Flow plane — ordered, top-to-bottom. */}
        <div className="flex flex-col gap-4 p-12">
          {flowBlocks.length === 0 && (
            <div className="rounded-md border-2 border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
              Empty page — use “Add block” in the footer to start building.
            </div>
          )}
          {flowBlocks.map((block) => (
            // data-doc-flow-id lets the drop handler locate the insertion point
            // by comparing the cursor Y to each block's midpoint.
            <div key={block.id} data-doc-flow-id={block.id}>
              <DocumentBlockView
                block={block}
                entityKind={state.entityKind}
                selected={selectedBlockId === block.id}
                entityContent={entityContent}
                theme={theme}
                onContentChange={onContentChange}
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
                onCommitText={(text) =>
                  commitState(updateBlock(state, pageId, block.id, { text }))
                }
              />
            </div>
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
                entityKind={state.entityKind}
                selected={selectedBlockId === block.id}
                entityContent={entityContent}
                theme={theme}
                onContentChange={onContentChange}
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
                onCommitText={(text) =>
                  commitState(updateBlock(state, pageId, block.id, { text }))
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
      )}
    </div>
  );
}

function DocumentBlockView({
  block,
  entityKind,
  selected,
  entityContent,
  theme,
  onContentChange,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  onDetach,
  onReflow,
  onCommitText,
}: {
  block: DocumentBlock;
  entityKind: DocumentEntityKind;
  selected: boolean;
  entityContent?: DocumentEntityContent | null;
  theme: ResolvedDocumentTheme;
  onContentChange?: (next: DocumentEntityContent) => void;
  onSelect: (e: React.MouseEvent) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete: () => void;
  onDetach?: () => void;
  onReflow?: () => void;
  onCommitText?: (text: string) => void;
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
        <div className="absolute -top-3 right-2 z-10 flex items-center gap-1 rounded-full border border-border bg-card px-1 py-0.5 shadow-sm">
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
      <BlockBody
        block={block}
        entityKind={entityKind}
        entityContent={entityContent}
        theme={theme}
        onContentChange={onContentChange}
        onCommitText={onCommitText}
      />
    </div>
  );
}

function BlockBody({
  block,
  entityKind,
  entityContent,
  theme,
  onContentChange,
  onCommitText,
}: {
  block: DocumentBlock;
  entityKind: DocumentEntityKind;
  entityContent?: DocumentEntityContent | null;
  theme: ResolvedDocumentTheme;
  onContentChange?: (next: DocumentEntityContent) => void;
  onCommitText?: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.text ?? "");

  if (block.kind === "divider") {
    return <hr className="my-2 border-slate-300" />;
  }
  if (block.kind === "spacer") {
    return <div className="h-8" aria-hidden="true" />;
  }
  if (block.kind === "text") {
    // Double-click to edit inline — a first slice of "the canvas is the form"
    // (#1916). Commits on blur; full per-field section editing lands with the
    // declarative field schema.
    if (editing && onCommitText) {
      return (
        <textarea
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            onCommitText(draft);
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-full resize-y rounded border border-brand-purple/40 bg-white p-1 text-sm leading-relaxed text-slate-700 outline-none"
          rows={3}
        />
      );
    }
    return (
      <p
        className="cursor-text whitespace-pre-wrap text-sm leading-relaxed text-slate-700"
        onDoubleClick={(e) => {
          if (!onCommitText) return;
          e.stopPropagation();
          setDraft(block.text ?? "");
          setEditing(true);
        }}
        title={onCommitText ? "Double-click to edit" : undefined}
      >
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
  // section / component. Inline the null/schema checks (not a hoisted bool) so
  // TS narrows entityContent + onContentChange to non-null in the edit branch.
  if (onContentChange && entityContent && documentSectionSchema(entityKind, block.sectionKey)) {
    return (
      <div>
        <h3
          className="mb-1 pb-0.5 text-sm font-semibold"
          style={{
            color: theme.accent,
            textTransform: theme.headingDecoration.textTransform,
            letterSpacing: theme.headingDecoration.letterSpacing,
            borderBottom: theme.headingDecoration.borderBottom,
            paddingBottom: theme.headingDecoration.paddingBottom,
          }}
        >
          {block.title ?? block.sectionKey ?? "Section"}
        </h3>
        <SectionEditor
          entityKind={entityKind}
          sectionKey={block.sectionKey as string}
          content={entityContent}
          onChange={onContentChange}
        />
      </div>
    );
  }
  // Non-editable (no content bound / no edit callback) → the SAME canonical
  // read renderer the PDF/export view uses, so on-canvas WYSIWYG and the export
  // never drift (#1912/#2152 — full theme + item fidelity, not a label list).
  if (!entityContent || !sectionHasContent(entityKind, entityContent, block.sectionKey)) {
    return (
      <p className="text-xs italic text-slate-400">No {block.sectionKey ?? "content"} yet</p>
    );
  }
  return <BlockView block={block} entityKind={entityKind} content={entityContent} theme={theme} />;
}

/** Schema-aware "does this section have anything to render?" — array sections
 *  need ≥1 item; object sections (resume basics by `objectPath`, jobs at the
 *  flat root) need ≥1 set field. Drives the "No X yet" placeholder. */
function sectionHasContent(
  entityKind: DocumentEntityKind,
  content: DocumentEntityContent,
  sectionKey: string | undefined,
): boolean {
  const schema = documentSectionSchema(entityKind, sectionKey);
  if (!schema) return false;
  const root = content as Record<string, unknown>;
  if (schema.shape === "array") {
    const rows = root[schema.sectionKey];
    return Array.isArray(rows) && rows.length > 0;
  }
  const obj = schema.objectPath ? root[schema.objectPath] : root;
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return schema.fields.some((f) => {
    const v = o[f.key];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  });
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
