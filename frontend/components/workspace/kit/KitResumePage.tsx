/**
 * The kit's résumé page: the page with its review layer, section pencils
 * and finding flags (ReviewedResumePane), set on the document stage with
 * the free elements over it (KitDocumentStage).
 *
 * A click on a line (a bullet, a summary, a header field) selects it for
 * the "This line" inspector (useKitLineSelection) and highlights it; a
 * click elsewhere on the paper lets it go. Pencils, flags and links keep
 * their own clicks (kit-line-ref.ts). A double-click on a text field types
 * in place (inline-edit.tsx) and commits through the kit's one history.
 */
import { useCallback, useMemo, type MouseEvent, type ReactNode } from "react";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import ReviewedResumePane from "@/components/build/review/ReviewedResumePane";
import { ResumeLineTargets } from "@/components/resume-renderer/annotations";
import { useKitLineSelection } from "@/lib/workspace/kit/use-kit-line-selection";
import { lineRefOfClick } from "@/lib/workspace/kit/kit-line-ref";
import { resolveKitLine } from "@/lib/build/this-line";
import { kitPaper } from "@/lib/workspace/kit/kit-paper";
import KitDocumentStage from "./KitDocumentStage";

interface KitResumePageProps {
  kit: KitWorkspace;
  advanced: boolean;
}

export default function KitResumePage({ kit, advanced }: KitResumePageProps) {
  const { ready, review, handoff, picks, nav, zoom, findings, docLayers } = kit;
  const { line, select, clear } = useKitLineSelection();
  const content = ready?.content ?? null;
  const selectedPath = useMemo(() => line?.path ?? resolveKitLine(content, line)?.path ?? null, [line, content]);
  const { select: selectElement } = docLayers;
  // The résumé's design says its page (Letter or A4).
  const paper = kitPaper(kit, "resume");
  const { commitEdit } = kit;
  const inlineEdit = useMemo(() => (content ? { content, onChange: commitEdit } : undefined), [content, commitEdit]);

  const onPaperClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!content) return;
      const ref = lineRefOfClick(content, e.target, e.currentTarget);
      if (ref) {
        select(ref);
        selectElement("resume", null);
        return;
      }
      // A control (a pencil, a flag) keeps the line; bare paper lets it go.
      if (!(e.target as Element).closest?.("button, a, input, textarea, select, [role='button']")) clear();
    },
    [content, select, clear, selectElement],
  );

  const renderPage = useCallback(
    (page: ReactNode) => (
      <KitDocumentStage
        page="resume"
        layers={docLayers}
        paper={paper}
        zoom={zoom.zoom}
        advanced={advanced}
        onPaperClick={onPaperClick}
      >
        {/* The print page's 0.5in margin (ResumeDetail print mode), so the
            page flows — and its elements land — as it prints. */}
        <div className="p-12">
          <ResumeLineTargets selectedPath={selectedPath}>{page}</ResumeLineTargets>
        </div>
      </KitDocumentStage>
    ),
    [docLayers, paper, zoom.zoom, advanced, onPaperClick, selectedPath],
  );

  if (!ready) return null;
  return (
    <ReviewedResumePane
      review={review}
      draft={ready.content}
      resume={ready.resume}
      resumeId={handoff.savedResumeId}
      descriptor={picks.descriptor}
      onEditSection={nav.editFromPage}
      zoom={zoom.zoom}
      findings={findings}
      renderPage={renderPage}
      inlineEdit={inlineEdit}
    />
  );
}
