/**
 * The kit's cover letter page: the letter with its action bar
 * (CoverLetterPane), set on the document stage on its own paper — Letter or
 * A4, in its own type (the letter's `style`, letter-style.ts) — with the
 * free elements over it (KitDocumentStage). Word / PDF carry the elements.
 */
import { useCallback, useMemo, type ReactNode } from "react";
import type { CoverLetterView } from "@/lib/build/use-cover-letter-view";
import type { KitDocumentLayers } from "@/lib/workspace/kit/use-kit-document-layers";
import CoverLetterPane from "@/components/build/cover-letter/CoverLetterPane";
import { letterStyleVars } from "@/lib/build/cover-letter/letter-style";
import { kitPagePaper } from "@/lib/workspace/kit/kit-document";
import { kitPrintOverlays } from "@/lib/workspace/kit/kit-print-overlays";
import KitDocumentStage from "./KitDocumentStage";

interface KitLetterPageProps {
  view: CoverLetterView;
  layers: KitDocumentLayers;
  zoom: number;
  advanced: boolean;
  /** The kit's project (engagement assets on the page read their titles from it). */
  projectId?: string | null;
}

export default function KitLetterPage({ view, layers, zoom, advanced, projectId = null }: KitLetterPageProps) {
  const style = view.letter?.style;
  const paperStyle = useMemo(() => {
    const { fontFamily, fontSize, lineHeight } = letterStyleVars(style);
    return { fontFamily, fontSize, lineHeight };
  }, [style]);
  const paper = kitPagePaper(style?.paper);

  const renderPage = useCallback(
    (page: ReactNode) => (
      <KitDocumentStage page="letter" layers={layers} paper={paper} zoom={zoom} advanced={advanced} paperStyle={paperStyle}>
        {page}
      </KitDocumentStage>
    ),
    [layers, paper, zoom, advanced, paperStyle],
  );

  const { state, pageCounts } = layers;
  const overlays = useCallback(
    () => kitPrintOverlays(state, "letter", paper, pageCounts.letter, projectId),
    [state, paper, pageCounts.letter, projectId],
  );

  return <CoverLetterPane view={view} zoom={zoom} renderPage={renderPage} overlays={overlays} />;
}
