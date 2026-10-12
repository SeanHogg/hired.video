/**
 * KitDocumentStage — a career kit's résumé or cover letter on the studio's
 * DocumentStage (hosted mode): the page as its template renders it, on
 * paper at its true size (Letter, or A4 for a letter set on A4), with the
 * kit's free elements (useKitDocumentLayers) on the overlay plane above it.
 *
 * The paper fills the canvas column like the page always did (the kit's
 * zoom scales from there). Advanced edits the elements on the page (select,
 * drag, resize, rotate, drop from Elements, Delete); Simple draws them.
 * Any other click on the paper goes to `onPaperClick` (the résumé's line
 * selection) and lets go of the selected element.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import DocumentStage from "@/components/studio/document/DocumentStage";
import type { DocumentOverlayEditor } from "@/components/studio/document/DocumentOverlayPlane";
import { PAGE_DIMENSIONS_PX, type PageSize } from "@/lib/studio/editor-v2/document-state";
import type { KitDocumentLayers } from "@/lib/workspace/kit/use-kit-document-layers";
import { kitPageScene, planePageCount, type KitDocPage } from "@/lib/workspace/kit/kit-document";

/** The column the page filled before it sat on paper. */
const COLUMN_MAX_PX = 880;
const NOOP = () => undefined;

interface KitDocumentStageProps {
  page: KitDocPage;
  layers: KitDocumentLayers;
  /** The page body (the template's résumé / the letter), bare. */
  children: ReactNode;
  paper: PageSize;
  /** The kit's zoom (1 = fill the column). */
  zoom: number;
  advanced: boolean;
  /** Type set on the paper (the letter's style). */
  paperStyle?: React.CSSProperties;
  onPaperClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

/** The column's width, so the paper can fill it. */
function useColumnWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export default function KitDocumentStage({
  page,
  layers,
  children,
  paper,
  zoom,
  advanced,
  paperStyle,
  onPaperClick,
}: KitDocumentStageProps) {
  const { t } = useTranslation();
  const column = useColumnWidth();
  const { state, select, reportPages } = layers;
  const docState = useMemo(() => ({ ...state, pageSize: paper, orientation: "portrait" as const }), [state, paper]);
  const pageWidth = PAGE_DIMENSIONS_PX[paper].width;
  const fit = column.width > 0 ? Math.min(column.width, COLUMN_MAX_PX) / pageWidth : 1;
  const minPages = planePageCount(state, page, 1);

  // The plane spans what the sheet shows: the content's pages, or more.
  const [contentPages, setContentPages] = useState(1);
  useEffect(() => {
    reportPages(page, Math.max(contentPages, minPages));
  }, [page, contentPages, minPages, reportPages]);

  const label = t(page === "letter" ? "build.letter.pageLabel" : "build.resume.previewLabel");
  const overlayScene = useCallback((pageCount: number) => kitPageScene(state, page, { pageCount, label }), [state, page, label]);

  const selectedId = layers.selectedOn(page)?.widget.id ?? null;
  const editor: DocumentOverlayEditor | undefined =
    advanced && layers.ready
      ? {
          selectedId,
          onSelect: (id) => select(page, id),
          onMove: (id, position) => layers.move(page, id, position),
          onDelete: (id) => layers.remove(page, id),
          onDropWidget: (kind, at) => layers.insert(page, kind, at),
          // Dropped on a résumé entry → bound to it (#2153).
          onDropMedia: (url, kind, at, item) => layers.insertMedia(page, kind, url, at, item),
          onDropLinked: (kind, id, at) => layers.insertLinked(page, kind, id, at),
        }
      : undefined;

  return (
    <div ref={column.ref} className="w-full overflow-x-auto">
      <DocumentStage
        state={docState}
        setState={NOOP}
        commit={NOOP}
        zoom={fit * zoom}
        hosted={{
          base: children,
          overlayScene,
          overlayEditor: editor,
          minPages,
          onPageCount: setContentPages,
          pageLabel: (n) => t("workspace.doc.pageN", { n }),
          sheetStyle: paperStyle,
          sheetProps: {
            onClick: (e) => {
              if (selectedId) select(page, null);
              onPaperClick?.(e);
            },
          },
        }}
      />
    </div>
  );
}
