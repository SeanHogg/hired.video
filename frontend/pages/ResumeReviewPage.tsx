/**
 * /resume-review/:reviewId (owner) and /r/:token (reviewer) — the studio
 * resume-review surface (#1947). Renders the resume read-only through the ONE
 * canonical `DeclarativeResumeRenderer` (so the review shows exactly what the
 * resume looks like) with a separate annotation overlay plane on top and the
 * feedback rail beside it.
 *
 * Both entry points share `useResumeReview`; the only difference is whether the
 * review is loaded by id (authenticated owner) or by an unguessable share token
 * (a peer/mentor who may not even have an account).
 */
import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import AnnotationLayer, { flashQuoteInContainer } from "@/components/studio/review/AnnotationLayer";
import ReviewSidebar from "@/components/studio/review/ReviewSidebar";
import { useResumeReview } from "@/hooks/use-resume-review";
import { useAuth } from "@/lib/auth";
import { useSEO } from "@/lib/seo";
import {
  DEFAULT_DESCRIPTOR,
  getTemplateById,
  type ResumeTemplateDescriptor,
} from "@/types/resume-template";
import { descriptorFromResumeDocument } from "@/lib/studio/document/resume-document-descriptor";
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";
import type { Resume } from "@/types/resume";
import { FEEDBACK_COLORS, type ResumeReviewAnnotationDTO } from "@shared/resume-feedback";

/** Logical page id every canvas anchor on this single-page surface is stamped with. */
const REVIEW_PAGE_ID = "review-page";

/** Adapt the review's `{ id, title, content }` slice into the `Resume` shape the
 *  canonical renderer expects. Display-only — analytics/ownership fields are
 *  inert here (ownership is enforced server-side; the renderer reads content). */
function toRenderableResume(
  slice: { id: string; title: string; content: unknown },
  ownerId: string,
): Resume {
  return {
    id: slice.id,
    userId: ownerId,
    title: slice.title,
    slug: null,
    content: slice.content as Resume["content"],
    status: "published",
    privacy: "public",
    isMaster: false,
    isActive: true,
    parentId: null,
    diffPercent: null,
    templateId: null,
    metaResumeId: null,
    sentimentScore: null,
    scores: null,
    viewCount: 0,
    isOwner: false,
    isWatched: false,
    archivedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

function resolveDescriptor(content: unknown): ResumeTemplateDescriptor {
  const meta = (content as { meta?: Record<string, unknown> } | undefined)?.meta;
  const layout = meta?.documentLayout as DocumentState | undefined;
  if (layout) return descriptorFromResumeDocument(layout);
  const saved = getTemplateById(meta?.template as string | undefined);
  return saved ?? DEFAULT_DESCRIPTOR;
}

export default function ResumeReviewPage(): JSX.Element {
  const { reviewId, token } = useParams<{ reviewId?: string; token?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const review = useResumeReview({ reviewId, token });
  const { detail, loading, notFound } = review;

  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  useSEO(location.pathname, {
    title: "Resume review · hired.video",
    description: "Collaborative resume feedback.",
    robots: "noindex, nofollow",
  });

  const renderable = useMemo(
    () => (detail ? toRenderableResume(detail.resume, detail.review.ownerId) : null),
    [detail],
  );
  const descriptor = useMemo(
    () => (detail ? resolveDescriptor(detail.resume.content) : DEFAULT_DESCRIPTOR),
    [detail],
  );

  const shareUrl =
    detail?.review.shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/r/${detail.review.shareToken}`
      : undefined;

  const onFlash = (a: ResumeReviewAnnotationDTO) => {
    if (a.anchor.type === "content" && a.anchor.quote) {
      flashQuoteInContainer(canvasRef.current, a.anchor.quote);
    }
  };

  if (loading) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </AppShell>
    );
  }

  if (notFound || !detail || !renderable) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="px-4 py-20 text-center">
          <h1 className="mb-2 text-2xl font-bold">Review unavailable</h1>
          <p className="mb-6 text-muted-foreground">
            This feedback link has been revoked, has expired, or doesn't exist.
          </p>
          <Button onClick={() => navigate("/resumes")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to resumes
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-muted/30">
      <div className="flex flex-col lg:flex-row">
        {/* Resume canvas + annotation overlay */}
        <div className="flex-1 overflow-auto p-4 lg:p-8">
          <div ref={canvasRef} className="relative mx-auto max-w-3xl bg-white shadow-sm">
            <DeclarativeResumeRenderer resume={renderable} descriptor={descriptor} />
            <AnnotationLayer
              containerRef={canvasRef}
              annotations={detail.annotations}
              pageId={REVIEW_PAGE_ID}
              canAnnotate={detail.review.status !== "completed" && detail.review.status !== "cancelled"}
              placing={placing}
              onExitPlacing={() => setPlacing(false)}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onCreate={review.createAnnotation}
              newColor={FEEDBACK_COLORS[0]}
            />
          </div>
        </div>

        {/* Feedback rail */}
        <aside className="w-full shrink-0 border-t bg-card lg:w-[380px] lg:border-l lg:border-t-0">
          <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-hidden">
            <ReviewSidebar
              detail={detail}
              review={review}
              currentUserId={user?.id ?? null}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onFlash={onFlash}
              onStartSticky={() => setPlacing(true)}
              shareUrl={shareUrl}
            />
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
