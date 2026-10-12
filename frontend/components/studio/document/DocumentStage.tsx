/**
 * DocumentStage — the paged WYSIWYG canvas runtime for `mediaKind: "document"`
 * (resume / job / article / blog). Self-hosting surface mounted by
 * `<CanvasRouter>` (like DrawingStage / CadStage), per the canvas-runtime
 * extensibility model. See `document-state.ts` for the state shape and the
 * unified-editor gap (#1912).
 *
 * A small switch over two modes:
 *
 *   block    the studio's own document editor (BlockDocumentStage): compose
 *            the structure — add / remove / reorder / detach blocks, inline
 *            section editing — on the sheet, with the overlay plane.
 *   hosted   the host supplies the page body instead of the flow plane — the
 *            career kit's résumé and cover letter in their own templates
 *            (#2351) — and edits the overlay plane (select, drag, resize,
 *            drop); the sheet, page breaks and plane are the same.
 */
import type { ReactNode } from "react";
import type { Scene } from "@/lib/studio/editor-v2/canvas-state";
import { type DocumentEntityContent, type DocumentState, pageDimensions } from "@/lib/studio/editor-v2/document-state";
import DocumentSheet from "@/components/studio/document/DocumentSheet";
import DocumentOverlayPlane, { type DocumentOverlayEditor } from "@/components/studio/document/DocumentOverlayPlane";
import BlockDocumentStage from "@/components/studio/document/BlockDocumentStage";

/** A host-rendered page (the career kit's résumé / letter in their own
 *  template) with an editable overlay plane over it — see `hosted`. */
export interface HostedDocumentPage {
  /** The page body, in place of the flow plane. */
  base: ReactNode;
  /** The overlay elements, positions in plane units (every page stacked),
   *  built by the host for `pageCount` pages. */
  overlayScene: (pageCount: number) => Scene;
  /** Select / drag / drop / delete the elements. Absent: drawn only. */
  overlayEditor?: DocumentOverlayEditor;
  /** The sheet spans at least this many pages. */
  minPages?: number;
  /** The content measured this many printed pages. */
  onPageCount?: (pages: number) => void;
  pageLabel?: (n: number) => string;
  /** Extra attributes on the paper (click handling, labels). */
  sheetProps?: React.HTMLAttributes<HTMLDivElement>;
  sheetStyle?: React.CSSProperties;
}

export interface DocumentStageProps {
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
  /** Hosted mode: the host renders the page body (no block editing, no
   *  view toggle) and the stage adds the sheet, page breaks and the
   *  overlay plane. The page size comes from `state`. */
  hosted?: HostedDocumentPage;
}

export default function DocumentStage(props: DocumentStageProps) {
  const { state, zoom, hosted } = props;
  if (!hosted) return <BlockDocumentStage {...props} />;
  const { width, height } = pageDimensions(state);
  return (
    <DocumentSheet
      width={width}
      pageHeight={height}
      zoom={zoom}
      minPages={hosted.minPages}
      paper={state.pageSize}
      pageLabel={hosted.pageLabel}
      onPageCount={hosted.onPageCount}
      sheetProps={hosted.sheetProps}
      style={hosted.sheetStyle}
      overlay={(pageCount, planeHeight) => (
        <DocumentOverlayPlane scene={hosted.overlayScene(pageCount)} width={width} height={planeHeight} editor={hosted.overlayEditor} />
      )}
    >
      {hosted.base}
    </DocumentSheet>
  );
}
