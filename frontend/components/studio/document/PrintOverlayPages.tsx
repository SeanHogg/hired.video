/**
 * PrintOverlayPages — a document's free elements on a print page: one
 * transparent PNG per printed page (rasterize-overlays.ts), each laid at its
 * page's corner. The print page sets `@page { margin: 0 }`, so page N
 * starts N × the sheet height down the document; the images are
 * absolutely placed against it, in front of the text.
 */
interface PrintOverlayPagesProps {
  pages: ReadonlyArray<string | null>;
  pageWidthIn?: number;
  pageHeightIn?: number;
}

export default function PrintOverlayPages({ pages, pageWidthIn = 8.5, pageHeightIn = 11 }: PrintOverlayPagesProps) {
  if (!pages.some(Boolean)) return null;
  return (
    <>
      {pages.map((src, i) =>
        src ? (
          <img
            key={i}
            src={src}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute left-0 z-10 block"
            style={{ top: `${i * pageHeightIn}in`, width: `${pageWidthIn}in`, height: `${pageHeightIn}in` }}
          />
        ) : null,
      )}
    </>
  );
}
