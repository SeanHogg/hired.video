/**
 * DetailsPreview — render a free-form details string to whatever
 * presentation makes sense for its kind.
 *
 *   • resume / job → eventually the structured template engines
 *     (DeclarativeResumeRenderer / DeclarativeJobRenderer) once we have
 *     a parsed `Resume` / `RendererJob` to hand them. Until that
 *     parsing pipeline exists, falls through to markdown so users
 *     still get a real rendered preview instead of monospaced raw
 *     text.
 *   • everything else → markdown (most details ARE markdown:
 *     personal-brand pitches, company promo blurbs, skills demo
 *     descriptions).
 *
 * Per the DRY rule: this component is the single answer to "show a
 * details string the way the rest of the platform will eventually
 * render it." Drop it everywhere a details preview is needed and the
 * kind-specific upgrade lands in one place.
 */

import Markdown from "@/components/Markdown";

type DetailsKind = "resume" | "job" | "personal_brand" | "company" | "skills_demo" | "generic";

interface DetailsPreviewProps {
  /** The raw details string to render. */
  text: string;
  /** What kind of details — drives which renderer is used. Defaults to
   *  "generic" (markdown) so callers without a strong opinion still get
   *  a real preview. */
  kind?: DetailsKind;
  className?: string;
  /** When true, an empty / whitespace-only `text` renders a small
   *  "nothing yet" hint instead of nothing. */
  showEmptyHint?: boolean;
}

export default function DetailsPreview({
  text,
  kind = "generic",
  className,
  showEmptyHint = true,
}: DetailsPreviewProps) {
  const trimmed = text.trim();
  if (!trimmed) {
    if (!showEmptyHint) return null;
    return (
      <div className={className}>
        <p className="text-xs text-muted-foreground italic">
          Nothing to preview yet — start typing on the Edit tab.
        </p>
      </div>
    );
  }

  // Resume / job get a TODO marker in the comment above this branch.
  // Both renderers expect structured objects (RendererJob / Resume)
  // rather than free-form text, so wiring them needs a parser pass.
  // Until that lands, every kind falls through to markdown — which
  // already covers the dominant case the user complained about
  // (job descriptions stored as markdown-style text).
  void kind;

  return (
    <div className={className}>
      <Markdown>{trimmed}</Markdown>
    </div>
  );
}
