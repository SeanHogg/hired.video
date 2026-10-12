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
import { publicResumePath } from "@shared/public-paths";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, FilePenLine } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import AnnotationLayer, { flashQuoteInContainer } from "@/components/studio/review/AnnotationLayer";
import ReviewSidebar from "@/components/studio/review/ReviewSidebar";
import ProposeDraftSheet from "@/components/studio/review/ProposeDraftSheet";
import type { ResumeContent } from "@shared/resume";
import { useResumeReview } from "@/hooks/use-resume-review";
import { useAuth } from "@/lib/auth";
import { useBreadcrumbs, useSEO } from "@/lib/seo";
import { DEFAULT_DESCRIPTOR } from "@/types/resume-template";
import { resolveResumeDescriptor } from "@/lib/resume-design";
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

export default function ResumeReviewPage(): JSX.Element {
  const { reviewId, token } = useParams<{ reviewId?: string; token?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  const review = useResumeReview({ reviewId, token });
  const { detail, loading, notFound } = review;

  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [proposing, setProposing] = useState(false);

  useSEO(location.pathname, {
    title: "Resume review · hired.video",
    description: "Collaborative resume feedback.",
    robots: "noindex, nofollow",
  });
  useBreadcrumbs([{ name: t("review.title"), url: location.pathname }]);

  const renderable = useMemo(
    () => (detail ? toRenderableResume(detail.resume, detail.review.ownerId) : null),
    [detail],
  );
  const descriptor = useMemo(
    () => (detail ? resolveResumeDescriptor(detail.resume.content) : DEFAULT_DESCRIPTOR),
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

  const isOwner = detail.role === "owner";
  // The reviewed document (a résumé — the only wired subject, #2254).
  const resumeId = detail.resume.id;
  const reviewActive =
    detail.review.status !== "completed" && detail.review.status !== "cancelled";

  const goBack = () => {
    if (isOwner) navigate(publicResumePath(resumeId));
    else if (user) navigate(-1);
    else navigate("/");
  };
  const exitLabel = isOwner
    ? t("review.backToResume")
    : user
      ? t("review.back")
      : t("review.backHome");
  const handleAfterComplete = () => {
    toast({ title: t("review.completedToast"), description: t("review.completedToastHint") });
    navigate(publicResumePath(resumeId));
  };

  return (
    <AppShell bgClassName="bg-muted/30">
      {/* Persistent exit bar — the owner always has a way back to their resume,
          even after the review is completed and the action footer is gone. */}
      <div className="sticky top-16 z-20 flex items-center justify-between gap-2 border-b bg-card/95 px-4 py-2 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> {exitLabel}
        </Button>
        <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-muted-foreground">
          {detail.review.title || t("review.title")}
        </span>
        {/* Reviewer: rewrite the whole résumé as a proposed draft (#2220).
            Proposals are attributed, so it needs an account. */}
        {!isOwner && reviewActive && (
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 shrink-0 sm:min-h-9"
            disabled={!user}
            title={user ? undefined : t("review.propose.signIn")}
            onClick={() => setProposing(true)}
          >
            <FilePenLine className="mr-1.5 h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("review.propose.open")}</span>
            <span className="sm:hidden">{t("review.propose.openShort")}</span>
          </Button>
        )}
      </div>
      {!isOwner && user && (
        <ProposeDraftSheet
          open={proposing}
          onOpenChange={setProposing}
          content={detail.resume.content as ResumeContent}
          busy={review.busy}
          onSubmit={async (draft, label) => {
            await review.proposeDraft(draft, label || undefined);
            toast({ title: t("review.propose.sent") });
          }}
        />
      )}

      {!reviewActive && (
        <div className="flex flex-wrap items-center justify-center gap-3 border-b bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          <span>
            {detail.review.status === "cancelled"
              ? t("review.cancelledBanner")
              : t("review.completedBanner")}
          </span>
          {isOwner && (
            <Button variant="outline" size="sm" className="h-7" onClick={goBack}>
              {t("review.backToResume")}
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col lg:flex-row">
        {/* Resume canvas + annotation overlay */}
        <div className="flex-1 overflow-auto p-4 lg:p-8">
          <div ref={canvasRef} className="relative mx-auto max-w-3xl bg-card shadow-sm">
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
              content={detail.resume.content}
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
              onAfterComplete={handleAfterComplete}
            />
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
