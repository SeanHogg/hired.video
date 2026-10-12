/**
 * BlockDocumentStage — the studio document editor's own page (DocumentStage's
 * block mode): a `DocumentState` page at its true print size (Letter / Legal /
 * A4 × orientation, scaled by the editor zoom) where the user composes the
 * STRUCTURE — add / remove / reorder section + primitive blocks, detach a
 * block to an absolute bounding box. Section blocks are inline-editable
 * (#1916) when content + an `onContentChange` are bound; otherwise they
 * render through the SHARED read renderer (DocumentBlockView → BlockView),
 * the same one the PDF export uses, so on-canvas WYSIWYG and the export
 * never drift. Overlays render on ONE plane over every page.
 *
 * The overlay plane is editable (useDocumentOverlayEditor): library images /
 * videos, widgets and linked-content cards drop onto the page and can be
 * selected, dragged, resized and deleted (#1913 / #1934(3)).
 *
 * Still to land (tracked in the register): 2-column / sidebar print layouts
 * (#1917b — all blocks render in one flow plane today).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EDITOR_SHEET_GAP, toPlanePosition } from "@/lib/studio/document/overlay-plane";
import type { Scene } from "@/lib/studio/editor-v2/canvas-state";
import { type DocumentState, pageDimensions } from "@/lib/studio/editor-v2/document-state";
import { resolveDocumentTheme } from "@/lib/studio/editor-v2/document-theme";
import { blockPresetsForEntity, firstPageId, insertBlockAt, moveBlock, removeBlock, setBlockMode, updateBlock } from "@/lib/studio/editor-v2/document-edit";
import { DOCUMENT_BLOCK_DRAG_MIME } from "@/components/studio/document/DocumentLeftPanel";
import DocumentPagedView, { DocumentViewModeToggle, type DocumentViewMode } from "@/components/studio/document/DocumentPagedView";
import DocumentSheet from "@/components/studio/document/DocumentSheet";
import DocumentOverlayPlane from "@/components/studio/document/DocumentOverlayPlane";
import DocumentBlockView from "@/components/studio/document/DocumentBlockView";
import type { DocumentStageProps } from "@/components/studio/document/DocumentStage";
import { useDocumentOverlayEditor } from "@/components/studio/document/useDocumentOverlayEditor";

const DEFAULT_BOX = { x: 0.1, y: 0.1, width: 0.4, height: 0.2, z: 1 };

export default function BlockDocumentStage({ state, setState, commit, zoom, entityContent, onContentChange }: DocumentStageProps) {
  const { t } = useTranslation();
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  // "One Page" = the editable continuous authoring sheet; "Individual Pages" =
  // a read-only two-up book spread for reviewing how the resume paginates.
  const [viewMode, setViewMode] = useState<DocumentViewMode>("continuous");
  const pageId = firstPageId(state);
  const { width, height } = pageDimensions(state);
  const page = state.pages[0];
  const theme = resolveDocumentTheme(state.theme);
  const pageName = t("studio.document.panelPage");

  const overlayEditor = useDocumentOverlayEditor(pageId, setState, commit);

  const commitState = (next: DocumentState) => {
    setState(() => next);
    commit();
  };

  const flowBlocks = page?.blocks.filter((b) => b.mode === "flow") ?? [];
  const absoluteBlocks = page?.blocks.filter((b) => b.mode === "absolute") ?? [];
  // Overlay widgets store page-1 fractions (y may run past 1 onto later
  // pages); the plane spans every page (overlay-plane.ts).
  const overlays = page?.overlays;
  const planeId = page?.id ?? "page";
  const overlayScene = useMemo(
    () => (pageCount: number): Scene => ({
      id: planeId,
      label: pageName,
      durationSeconds: 5,
      backgroundColor: "transparent",
      widgets: (overlays ?? []).map((o) => ({ ...o.widget, position: toPlanePosition(o.widget.position, pageCount, EDITOR_SHEET_GAP) })),
      filters: null,
    }),
    [overlays, planeId, pageName],
  );

  const shared = (blockId: string) => ({
    entityKind: state.entityKind,
    selected: selectedBlockId === blockId,
    entityContent,
    theme,
    cardStyle: state.theme.cardStyle,
    onContentChange,
    onSelect: (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedBlockId(blockId);
    },
    onDelete: () => {
      commitState(removeBlock(state, pageId, blockId));
      setSelectedBlockId(null);
    },
    onCommitText: (text: string) => commitState(updateBlock(state, pageId, blockId, { text })),
  });

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const raw = e.dataTransfer.getData(DOCUMENT_BLOCK_DRAG_MIME);
    if (!raw) return;
    e.preventDefault();
    const preset = blockPresetsForEntity(state.entityKind)[Number(raw)];
    if (!preset) return;
    // Drop-at-cursor: insert before the first flow block whose vertical
    // midpoint is below the drop point; append when dropped past the end.
    let beforeId: string | null = null;
    for (const el of Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-doc-flow-id]"))) {
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        beforeId = el.dataset.docFlowId ?? null;
        break;
      }
    }
    const { state: next, blockId } = insertBlockAt(state, pageId, preset, beforeId);
    commitState(next);
    setSelectedBlockId(blockId);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* One Page (editable continuous sheet) vs Individual Pages (read-only spread). */}
      <DocumentViewModeToggle value={viewMode} onChange={setViewMode} />

      {viewMode === "paged" ? (
        // The spread follows the editor `zoom` — the SAME scale the sheet uses.
        <DocumentPagedView state={state} content={entityContent} mode="paged" zoom={zoom} className="w-full" />
      ) : (
        <DocumentSheet
          width={width}
          pageHeight={height}
          zoom={zoom}
          paper={state.pageSize}
          style={{ color: theme.text, fontFamily: theme.fontFamily }}
          overlay={(pageCount, planeHeight) => (
            <DocumentOverlayPlane
              scene={overlayScene(pageCount)}
              width={width}
              height={planeHeight}
              editor={overlayEditor.editorFor(pageCount)}
            />
          )}
          sheetProps={{
            role: "presentation",
            onClick: () => {
              setSelectedBlockId(null);
              overlayEditor.clearSelection();
            },
            onDragOver: (e) => {
              // Accept palette drags (DocumentLeftPanel section chips).
              if (e.dataTransfer.types.includes(DOCUMENT_BLOCK_DRAG_MIME)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }
            },
            onDrop,
          }}
        >
          {/* Flow plane — ordered, top-to-bottom. */}
          <div className="flex flex-col gap-4 p-12">
            {flowBlocks.length === 0 && (
              <div className="rounded-md border-2 border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
                {t("studio.document.block.emptyPage")}
              </div>
            )}
            {flowBlocks.map((block) => (
              // data-doc-flow-id lets the drop handler find the insertion point.
              <div key={block.id} data-doc-flow-id={block.id}>
                <DocumentBlockView
                  block={block}
                  {...shared(block.id)}
                  onMoveUp={() => commitState(moveBlock(state, pageId, block.id, "up"))}
                  onMoveDown={() => commitState(moveBlock(state, pageId, block.id, "down"))}
                  onDetach={() => commitState(setBlockMode(state, pageId, block.id, "absolute"))}
                />
              </div>
            ))}
          </div>

          {/* Absolute plane — detached blocks by their bounding box (page fractions). */}
          {absoluteBlocks.map((block) => {
            const box = block.box ?? DEFAULT_BOX;
            return (
              <div
                key={block.id}
                className="absolute"
                style={{ left: box.x * width, top: box.y * height, width: box.width * width, minHeight: box.height * height, zIndex: box.z }}
              >
                <DocumentBlockView
                  block={block}
                  {...shared(block.id)}
                  onReflow={() => commitState(setBlockMode(state, pageId, block.id, "flow"))}
                />
              </div>
            );
          })}
        </DocumentSheet>
      )}
    </div>
  );
}
