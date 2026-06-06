/**
 * DocumentPlaceholderThumbnail — project-tile preview for `mediaKind:
 * "document"` (resume / job / article / blog). Renders a white print sheet
 * with the document's section headings as bold lines + filler rules, so the
 * tile reads unmistakably as a paper document — never the audio waveform that
 * the kind fell through to before this existed.
 *
 * State-driven, per the VideoProjectThumbnail philosophy: section titles come
 * from the project's live `DocumentState` blocks when present, so the tile
 * tracks the real document instead of a baked image. A brand-new blank
 * document falls back to generic ruled lines.
 */
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";

interface DocumentPlaceholderThumbnailProps {
  documentState?: DocumentState | null;
  className?: string;
}

/** Heading labels for the first page's flow blocks (section title, or the
 *  block kind for free-content blocks). Capped — the tile only shows a few. */
function blockHeadings(state: DocumentState | null | undefined): string[] {
  const blocks = state?.pages?.[0]?.blocks ?? [];
  return blocks
    .filter((b) => b.mode !== "absolute")
    .map((b) => b.title ?? b.sectionKey ?? b.component ?? b.kind)
    .filter((s): s is string => Boolean(s))
    .slice(0, 5);
}

export default function DocumentPlaceholderThumbnail({
  documentState,
  className,
}: DocumentPlaceholderThumbnailProps) {
  const headings = blockHeadings(documentState);

  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center bg-slate-200/70 p-3",
        className,
      )}
    >
      {/* The "paper" — portrait aspect, drop shadow, ruled content. */}
      <div className="relative flex h-full w-[72%] flex-col gap-2 overflow-hidden rounded-sm bg-white p-3 shadow-md ring-1 ring-black/5">
        {headings.length > 0 ? (
          headings.map((h, i) => (
            <div key={i} className="space-y-1">
              {/* Section heading line */}
              <div className="h-1.5 w-1/2 rounded-sm bg-slate-700" />
              {/* Two filler rules under each heading */}
              <div className="h-1 w-full rounded-sm bg-slate-200" />
              <div className="h-1 w-5/6 rounded-sm bg-slate-200" />
            </div>
          ))
        ) : (
          <>
            <div className="h-2 w-1/3 rounded-sm bg-slate-700" />
            <div className="mt-1 space-y-1">
              <div className="h-1 w-full rounded-sm bg-slate-200" />
              <div className="h-1 w-5/6 rounded-sm bg-slate-200" />
              <div className="h-1 w-full rounded-sm bg-slate-200" />
              <div className="h-1 w-2/3 rounded-sm bg-slate-200" />
            </div>
          </>
        )}
      </div>
      <FileText className="absolute bottom-2 right-2 h-4 w-4 text-slate-400" />
    </div>
  );
}
