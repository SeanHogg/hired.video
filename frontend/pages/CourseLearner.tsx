/**
 * CourseLearner — the lesson-by-lesson playback surface for an enrolled
 * user. Closes the consumer side of the SCORM authoring loop (#166): a
 * creator builds a course → publishes → another user enrolls → lands
 * here to actually learn.
 *
 * Route: `/learn/:enrollmentId`
 *
 * Layout:
 *   ┌────────────┬─────────────────────────────────────┐
 *   │ Curriculum │  Active lesson body                  │
 *   │  rail      │   • text_md      → ReactMarkdown     │
 *   │            │   • scorm_package → <ScormPlayer>    │
 *   │            │   • studio_video  → iframe at /m/<slug>│
 *   │            │   • external_url  → iframe           │
 *   │            │                                      │
 *   │            │  [Mark complete] (non-SCORM only)    │
 *   └────────────┴─────────────────────────────────────┘
 *
 * Progress writes via `courseService.patchLessonProgress`. The backend
 * auto-issues the cert when every required lesson hits `passed`
 * (existing behavior in courses.ts). SCORM lessons drive their own
 * completion through the `Commit` event in `<ScormPlayer>` and we mirror
 * it into `progress` on lesson Commit.
 *
 * The page is self-gating — non-owners get a 404 from the API and we
 * redirect to the public course page; no per-prop `canView` boolean.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Award, CheckCircle2, GraduationCap, Loader2, Pencil, Sparkles } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";
import { usePageChrome } from "@/lib/seo";
import { useToast } from "@/hooks/use-toast";
import { courseCategoryLabel } from "@/lib/course-category";
import { signalBadgeRefresh } from "@/lib/badges/refresh";
import { useAI } from "@/lib/ai-context";
import { createGeneralContext } from "@/lib/utils/ai-context-helpers";
import { useCoursePermissions } from "@/hooks/use-course-permissions";
import {
  courseService,
  type CourseLearnerContent,
  type CourseLesson,
} from "@/lib/services/course-service";
import { issueCertificate } from "@/lib/courses/courses-api";
import { EYEBROW_CHIP } from "@/components/content/content-ui";
import CurriculumRail from "@/components/course-learner/CurriculumRail";
import LessonBody from "@/components/course-learner/LessonBody";
import { CourseCompletePanel, CourseCompletionDialog } from "@/components/course-learner/CourseCompletion";
import { LESSON_TYPE_LABEL_KEY } from "@/components/course-learner/lesson-meta";

export default function CourseLearner() {
  usePageChrome();
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const { isAuthenticated, user } = useAuth();
  const { openAIWithPageContextAndMessage } = useAI();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [data, setData] = useState<CourseLearnerContent | null>(null);
  // Celebration modal — fires once when the enrollment transitions
  // false → true. Tracked in a ref so React StrictMode's double-effect
  // doesn't double-show; the modal itself is dialog state.
  const [completionOpen, setCompletionOpen] = useState(false);
  // Backfill guard — when an enrollment was flipped to passed by the
  // migration 0137 backfill, the cert wasn't issued at that time
  // (SQL can't reach the JWT signer). On the next load we auto-issue
  // once so the learner sees their cert. The ref prevents a retry
  // storm if the issue call fails for an unrelated reason.
  const backfillCertAttemptedRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [markingComplete, setMarkingComplete] = useState(false);

  // #1521 — owner / SuperAdmin gets the edit pencil. Hook is called
  // unconditionally with `data?.course` so it stays above the
  // conditional renders below (rules-of-hooks). Returns canEdit=false
  // until the course payload arrives.
  const { canEdit } = useCoursePermissions(data?.course);

  // Fetch the enrollment + course + module + lesson tree on mount. The
  // endpoint 404s when the requester doesn't own the enrollment, so a
  // null response is the same redirect target as a genuinely missing id.
  useEffect(() => {
    if (!enrollmentId) return;
    let cancelled = false;
    setLoading(true);
    courseService
      .getLearnerContent(enrollmentId)
      .then((content) => {
        if (cancelled) return;
        setData(content);
        // Auto-select the first lesson the learner hasn't passed yet,
        // falling back to the first lesson if everything's already done.
        const firstUnfinished = content.lessons
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .find((l) => (content.enrollment.progress?.[l.id]?.status ?? "not_started") !== "passed");
        setActiveLessonId((firstUnfinished ?? content.lessons[0])?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enrollmentId]);

  // Backfill cert issuance — see backfillCertAttemptedRef comment.
  // Only runs when the course actually issues certs AND the enrollment
  // is already passed but no cert row exists. Issuing is idempotent on
  // the server (CertificateService.issueForEnrollment returns the
  // existing cert if one already exists), so the worst case is a
  // wasted round-trip.
  useEffect(() => {
    if (!data) return;
    if (!data.enrollment.passed) return;
    if (data.certificate) return;
    if (!data.course.issuesCertificate) return;
    const enrId = data.enrollment.id;
    if (backfillCertAttemptedRef.current === enrId) return;
    backfillCertAttemptedRef.current = enrId;
    issueCertificate(enrId)
      .then(async () => {
        // Re-fetch to pick up the freshly-issued cert row + any badge
        // fan-out the issue endpoint kicked off.
        const refreshed = await courseService.getLearnerContent(enrId);
        setData(refreshed);
      })
      .catch(() => undefined);
  }, [data]);

  const lessonsByModule = useMemo(() => {
    const map = new Map<string | null, CourseLesson[]>();
    if (!data) return map;
    for (const l of data.lessons) {
      const key = l.moduleId ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [data]);

  const activeLesson: CourseLesson | null = useMemo(() => {
    if (!data || !activeLessonId) return null;
    return data.lessons.find((l) => l.id === activeLessonId) ?? null;
  }, [data, activeLessonId]);

  // Mark a lesson as in_progress the moment the learner opens it. The
  // backend tolerates idempotent calls, so this is safe to re-fire on
  // tab switches.
  useEffect(() => {
    if (!data || !activeLesson) return;
    const cur = data.enrollment.progress?.[activeLesson.id];
    if (cur?.status === "passed" || cur?.status === "in_progress") return;
    courseService
      .patchLessonProgress(data.enrollment.id, {
        lessonId: activeLesson.id,
        status: "in_progress",
      })
      .then((nextEnrollment) => setData((d) => (d ? { ...d, enrollment: nextEnrollment } : d)))
      .catch(() => undefined);
  }, [data, activeLesson]);

  // Shared post-lesson-pass handler — every "this lesson is now passed"
  // signal (markComplete button + SCORM Commit + any future knowledge-
  // check submission) routes through here so the celebration + cert
  // fetch logic lives in ONE place. No prop-drilled passed-flag fan-out.
  //
  // When the backend's response flips the enrollment to `passed`, we
  // re-fetch the full learner content (cert is issued AFTER the PATCH
  // returns, so the enrollment row alone won't carry it) and surface
  // the completion dialog with the cert link.
  const applyLessonPassed = useCallback(async (lessonId: string) => {
    if (!data) return;
    const wasPassed = data.enrollment.passed;
    try {
      const nextEnrollment = await courseService.patchLessonProgress(data.enrollment.id, {
        lessonId,
        status: "passed",
      });
      const flippedToPassed = !wasPassed && nextEnrollment.passed;
      if (flippedToPassed) {
        // Re-fetch to pick up the newly-issued certificate row + any
        // other server-side side effects (badge fan-out happens async).
        const refreshed = await courseService.getLearnerContent(data.enrollment.id);
        setData(refreshed);
        setCompletionOpen(true);
      } else {
        setData((d) => (d ? { ...d, enrollment: nextEnrollment } : d));
      }
      // #1568 — kick BadgeUnlockToaster off the 60s poll so the badge
      // celebration toast surfaces in the same render cycle as the
      // completion dialog. Cheap signal; no-op when nothing's unlocked.
      signalBadgeRefresh();
    } catch (e: unknown) {
      toast({
        title: t("errors.courseLearner.saveProgressFailed"),
        description: e instanceof Error ? e.message : t("actions.tryAgain"),
        variant: "destructive",
      });
    }
  }, [data, toast, t]);

  const markComplete = useCallback(async () => {
    if (!data || !activeLesson) return;
    setMarkingComplete(true);
    try {
      await applyLessonPassed(activeLesson.id);
      toast({ title: t("messages.courseLearner.lessonComplete") });
    } finally {
      setMarkingComplete(false);
    }
  }, [data, activeLesson, applyLessonPassed, toast, t]);

  // Called by <ScormPlayer> when the runtime fires Commit with passed/
  // completed. Same path as markComplete so completion celebration fires
  // for SCORM-driven passes too.
  const onScormCompleted = useCallback(() => {
    if (!activeLesson) return;
    void applyLessonPassed(activeLesson.id);
  }, [activeLesson, applyLessonPassed]);

  // #2068 GAP-2 — open the AI coach scoped to the current course + lesson.
  // `coachPriming` is rendered into the (always-resent) system prompt, so the
  // coach stays on-topic for the active lesson across turns; the primed first
  // message kicks off the conversation.
  const askCoach = useCallback(() => {
    if (!data || !activeLesson) return;
    const ctx = createGeneralContext(user?.role, "course-learn");
    ctx.coachPriming = `The learner is studying the lesson "${activeLesson.title}" in the course "${data.course.title}". Act as a learning coach scoped to this material: explain concepts, answer questions, and quiz them on this lesson.`;
    openAIWithPageContextAndMessage(
      ctx,
      t("learn.coach.prime", { lesson: activeLesson.title, course: data.course.title }),
    );
  }, [data, activeLesson, user, openAIWithPageContextAndMessage, t]);

  if (!isAuthenticated) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(`/learn/${enrollmentId ?? ""}`)}`} replace />;
  }

  if (loading) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> {t("status.loadingCourse")}
        </div>
      </AppShell>
    );
  }

  if (notFound || !data) {
    return <Navigate to="/search?category=courses" replace />;
  }

  const { course, modules, enrollment } = data;
  const totalLessons = data.lessons.length;
  const passedCount = data.lessons.filter((l) => enrollment.progress?.[l.id]?.status === "passed").length;
  const progressPct = totalLessons === 0 ? 0 : Math.round((passedCount / totalLessons) * 100);
  const activePassed = activeLesson ? enrollment.progress?.[activeLesson.id]?.status === "passed" : false;

  return (
    <AppShell bgClassName="bg-background">
      <main className="mx-auto w-full max-w-[1200px] px-6 pb-[72px] pt-8">
        {/* Course header */}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <span className={EYEBROW_CHIP}>
              <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
              {t("labels.courseLearner.course")}
              {course.category && ` · ${courseCategoryLabel(course.category, t)}`}
            </span>
            <h1 className="font-display text-[clamp(28px,3.4vw,40px)] font-bold leading-tight tracking-[-0.03em] text-foreground">
              {course.title}
            </h1>
            {course.summary && <p className="text-muted-foreground">{course.summary}</p>}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-56">
            <div className="font-mono text-[11px] uppercase text-muted-foreground">
              {t("labels.courseLearner.lessonsComplete", { passed: passedCount, total: totalLessons })}
            </div>
            <Progress value={progressPct} className="h-2" />
            {enrollment.passed && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-sm font-semibold text-brand-green-text">
                  <Award className="h-4 w-4" aria-hidden="true" />
                  {t("status.courseLearner.coursePassed")}
                </span>
                {data.certificate && (
                  <a
                    href={`/verify/${data.certificate.certNumber}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    {t("actions.courseLearner.viewCertificate")}
                  </a>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
          {/* Curriculum rail */}
          <nav aria-label={t("labels.courseLearner.curriculumNav")} className="flex flex-col gap-3">
            <CurriculumRail
              modules={modules}
              lessonsByModule={lessonsByModule}
              progress={enrollment.progress}
              activeLessonId={activeLessonId}
              onSelect={setActiveLessonId}
              totalLessons={totalLessons}
            />
            <Button
              variant="outline"
              className="min-h-[44px] w-full"
              onClick={() => navigate(`/courses/${course.userId}/${course.slug}`)}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t("actions.courseLearner.backToCoursePage")}
            </Button>
          </nav>

          {/* Active lesson */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* Persistent course-completion banner (self-gates on passed);
                the one-shot dialog below only fires on the in-session flip. */}
            <CourseCompletePanel
              passed={enrollment.passed}
              courseTitle={course.title}
              issuesCertificate={course.issuesCertificate}
              certNumber={data.certificate?.certNumber ?? null}
            />
            {activeLesson ? (
              <section className="overflow-hidden rounded-[20px] border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[11px] uppercase text-muted-foreground">
                      {t(LESSON_TYPE_LABEL_KEY[activeLesson.sourceType])}
                      {activeLesson.estimatedMinutes
                        ? ` · ${t("labels.courseLearner.minutesShort", { count: activeLesson.estimatedMinutes })}`
                        : ""}
                    </div>
                    <h2 className="mt-1 truncate text-xl font-bold tracking-tight text-foreground">{activeLesson.title}</h2>
                    {activeLesson.summary && (
                      <p className="truncate text-sm text-muted-foreground">{activeLesson.summary}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* #1521 — owner / SuperAdmin edits via the existing
                        CourseContentEditor; deep link focuses the lesson. */}
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-[44px]"
                        onClick={() =>
                          navigate(`/services/creator/courses?courseId=${course.id}&lessonId=${activeLesson.id}`)
                        }
                        title={t("actions.courseLearner.editLesson")}
                      >
                        <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />
                        {t("actions.edit")}
                      </Button>
                    )}
                    {/* #2068 GAP-2 — learning-scoped AI coach launcher. */}
                    <Button size="sm" variant="outline" className="min-h-[44px]" onClick={askCoach} title={t("learn.coach.ask")}>
                      <Sparkles className="mr-1 h-4 w-4" aria-hidden="true" />
                      {t("learn.coach.ask")}
                    </Button>
                    {/* SCORM lessons mark complete on their own Commit event;
                        every other type gets the explicit Mark Complete button. */}
                    {activeLesson.sourceType !== "scorm_package" && (
                      <Button
                        size="sm"
                        className="min-h-[44px]"
                        onClick={markComplete}
                        disabled={markingComplete || activePassed}
                      >
                        {markingComplete ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" />
                        )}
                        {activePassed ? t("labels.completed") : t("actions.courseLearner.markComplete")}
                      </Button>
                    )}
                  </div>
                </div>
                <LessonBody
                  lesson={activeLesson}
                  enrollmentId={enrollment.id}
                  courseId={course.id}
                  themeTokens={course.themeTokens ?? undefined}
                  onScormCompleted={onScormCompleted}
                />
              </section>
            ) : (
              <div className="rounded-[20px] border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
                {t("messages.courseLearner.pickLesson")}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Course-completion celebration — fires once when the enrollment
          flips false→true. Self-gates on `open`. */}
      <CourseCompletionDialog
        open={completionOpen}
        onOpenChange={setCompletionOpen}
        courseTitle={course.title}
        certNumber={data.certificate?.certNumber ?? null}
      />
    </AppShell>
  );
}
