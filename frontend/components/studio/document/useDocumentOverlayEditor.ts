/**
 * The studio document editor's overlay plane, editable (#1913 / #1934(3) /
 * #2152(3)): drag an image or video from the library (or a widget / a
 * linked-content card) onto the page, then select, drag, resize and delete
 * it — the same CanvasStage interactions the kit's pages use, writing the
 * page's `overlays` through the document history.
 */
import { useCallback, useState } from "react";
import { defaultWidget, emptyCanvasState, makeLinkedContentWidget, type Widget } from "@/lib/studio/editor-v2/canvas-state";
import { resolveLinkedContentColors } from "@/lib/studio/editor-v2/linked-content";
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";
import { removeOverlay } from "@/lib/studio/editor-v2/document-edit";
import { mediaWidget } from "@/lib/build/frame-edits";
import { moveDocumentOverlay, placeDocumentOverlay } from "@/lib/studio/document/document-overlays";
import type { DocumentOverlayEditor } from "@/components/studio/document/DocumentOverlayPlane";

type SetState = (updater: (prev: DocumentState) => DocumentState) => void;

export function useDocumentOverlayEditor(pageId: string, setState: SetState, commit: () => void) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const place = useCallback(
    (widget: Widget, at: { x: number; y: number }, pageCount: number) => {
      setState((prev) => placeDocumentOverlay(prev, pageId, widget, at, pageCount).state);
      commit();
      // Placement keeps the widget's id.
      setSelectedId(widget.id);
    },
    [pageId, setState, commit],
  );

  /** The plane's editor for a sheet of `pageCount` pages. */
  const editorFor = useCallback(
    (pageCount: number): DocumentOverlayEditor => ({
      selectedId,
      onSelect: setSelectedId,
      // Moves land in the history on its debounce (one step per gesture).
      onMove: (id, position) => setState((prev) => moveDocumentOverlay(prev, pageId, id, position, pageCount)),
      onDelete: (id) => {
        setState((prev) => removeOverlay(prev, pageId, id));
        commit();
        setSelectedId(null);
      },
      onDropWidget: (kind, at) => place(defaultWidget(kind), at, pageCount),
      onDropMedia: (url, kind, at) => place(mediaWidget(kind, url), at, pageCount),
      onDropLinked: (kind, id, at) =>
        place(makeLinkedContentWidget({ entityKind: kind, entityId: id, ...resolveLinkedContentColors(emptyCanvasState()) }), at, pageCount),
    }),
    [selectedId, setState, pageId, commit, place],
  );

  return { editorFor, clearSelection: () => setSelectedId(null) };
}
