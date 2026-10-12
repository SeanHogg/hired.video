/**
 * The kit page with the review layer on it: the review bar (or, with no
 * review open, the ★ Master / Version
 * of ★ Master context + "Side by side" for a version), the staleness banner, the page itself — the draft, or the
 * open review's Before / After / Changes with its marks and cards — and the
 * compare panel. Section pencils edit the draft, so they hide while a
 * review is showing something else. With no review open, the scoring
 * runs' findings sit on the lines they criticise as flags (a review's own
 * marks take precedence).
 */
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Maximize2 } from "lucide-react";
import type { ResumeContent } from "@shared/resume";
import { Button } from "@/components/ui/button";
import ResumePreviewPane from "@/components/build/ResumePreviewPane";
import type { ResumeInlineEdit } from "@/components/resume-renderer/inline-edit";
import { toPreviewResume } from "@/lib/build/preview-resume";
import type { PageFinding } from "@/lib/build/page-findings";
import type { BuildReview } from "@/lib/build/review/use-build-review";
import type { Resume } from "@/types/resume";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";
import ComparePanel from "./ComparePanel";
import LineageBadge from "./LineageBadge";
import ReviewBar from "./ReviewBar";
import StalenessBanner from "./StalenessBanner";
import { useFindingAnnotations } from "./finding-annotations";
import { useReviewAnnotations } from "./use-review-annotations";

interface ReviewedResumePaneProps {
  review: BuildReview;
  draft: ResumeContent;
  /** The draft's preview envelope (title etc.). */
  resume: Resume;
  resumeId: string | null;
  descriptor: ResumeTemplateDescriptor;
  onEditSection: (key: string) => void;
  zoom: number;
  /** Scoring findings to flag on the page (lib/build/page-findings.ts);
   *  shown only while no review is open. */
  findings?: readonly PageFinding[];
  /** Puts the page somewhere else (the kit's document stage) — gets the
   *  page, returns what renders in its place. The bars and the compare
   *  panel stay around it. The page is "bare" (no shadow, no zoom) then. */
  renderPage?: (page: ReactNode) => ReactNode;
  /** In-place typing on the draft (inline-edit.tsx). Never on a review's
   *  Before / After / Changes — only the draft is editable. */
  inlineEdit?: ResumeInlineEdit;
}

export default function ReviewedResumePane({
  review,
  draft,
  resume,
  resumeId,
  descriptor,
  onEditSection,
  zoom,
  findings,
  renderPage,
  inlineEdit,
}: ReviewedResumePaneProps) {
  const { t } = useTranslation();
  const active = review.active;
  const reviewAnnotations = useReviewAnnotations(review);
  const findingAnnotations = useFindingAnnotations({ findings: active ? undefined : findings, draft, onEditSection });
  const annotations = active ? reviewAnnotations : findingAnnotations;
  const page = useMemo(
    () => (active && review.pageContent ? toPreviewResume(review.pageContent, resume.title) : resume),
    [active, review.pageContent, resume],
  );
  const isVersion = review.lineage?.role === "version";
  const pageNode = (
    <ResumePreviewPane
      resume={page}
      descriptor={descriptor}
      onEditSection={active ? undefined : onEditSection}
      zoom={renderPage ? 1 : zoom}
      annotations={annotations}
      bare={!!renderPage}
      inlineEdit={active ? undefined : inlineEdit}
    />
  );

  return (
    <div className="flex w-full flex-col gap-3">
      {active ? (
        <ReviewBar review={review} />
      ) : (
        <div className="flex flex-wrap items-center gap-2.5">
          <LineageBadge lineage={review.lineage} />
          <span className="flex-1" />
          {isVersion && (
            <Button variant="outline" size="sm" className="min-h-11 gap-1.5 sm:min-h-9" onClick={review.openCompare}>
              {t("review.compare.withMaster")}
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
      <StalenessBanner lineage={review.lineage} onPull={review.startPull} hidden={!!active} />
      {renderPage ? renderPage(pageNode) : pageNode}
      <ComparePanel review={review} draft={draft} resumeId={resumeId} descriptor={descriptor} title={resume.title} />
    </div>
  );
}
