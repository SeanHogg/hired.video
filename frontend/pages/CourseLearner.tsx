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
 *   │            │   • studio_video  → iframe at /v/<slug>│
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
import {
  Award,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  GraduationCap,
  Loader2,
  Lock,
  Package,
  Pencil,
  Sparkles,
  Video,
} from "lucide-react";
import Markdown from "@/components/Markdown";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { courseCategoryLabel } from "@/lib/course-category";
import { signalBadgeRefresh } from "@/lib/badges/refresh";
import { useAI } from "@/lib/ai-context";
import { createGeneralContext } from "@/lib/utils/ai-context-helpers";
import ScormPlayer from "@/components/courses/ScormPlayer";
import TextNarrator from "@/components/audio/TextNarrator";
import { useCoursePermissions } from "@/hooks/use-course-permissions";
import {
  courseService,
  type CourseLearnerContent,
  type CourseLesson,
  type CourseLessonSourceType,
  type LessonProgress,
} from "@/lib/services/course-service";
import { issueCertificate } from "@/lib/courses/courses-api";

const SOURCE_ICON: Record<CourseLessonSourceType, typeof FileText> = {
  text_md: FileText,
  studio_video: Video,
  scorm_package: Package,
  external_url: ExternalLink,
};

// Stable i18n keys resolved at render with t(); never call t() at module scope.
const LESSON_TYPE_LABEL_KEY: Record<CourseLessonSourceType, string> = {
  text_md: "labels.courseLearner.lessonType.reading",
  studio_video: "labels.courseLearner.lessonType.video",
  scorm_package: "labels.courseLearner.lessonType.scorm",
  external_url: "labels.courseLearner.lessonType.externalLink",
};

export default function CourseLearner() {
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
      <AppShell>
        <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t("status.loadingCourse")}
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
  const unfiled = lessonsByModule.get(null) ?? [];

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Course header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <GraduationCap className="h-4 w-4" /> {t("labels.courseLearner.course")}
              {course.category && (
                <>
                  ·{" "}
                  <Badge variant="outline">
                    {courseCategoryLabel(course.category, t)}
                  </Badge>
                </>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold truncate">{course.title}</h1>
            {course.summary && <p className="text-sm text-muted-foreground mt-1">{course.summary}</p>}
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-1">
              {t("labels.courseLearner.lessonsComplete", { passed: passedCount, total: totalLessons })}
            </div>
            <Progress value={progressPct} className="w-48" />
            {enrollment.passed && (
              <div className="mt-2 flex items-center justify-end gap-2">
                <span className="flex items-center gap-1 text-sm text-emerald-600">
                  <Award className="h-4 w-4" />
                  {t("status.courseLearner.coursePassed")}
                </span>
                {data.certificate && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`/verify/${data.certificate.certNumber}`} target="_blank" rel="noreferrer">
                      {t("actions.courseLearner.viewCertificate")}
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-4">
          {/* Curriculum rail */}
          <nav aria-label={t("labels.courseLearner.curriculumNav")} className="space-y-4">
            <Card>
              <CardContent className="p-3 space-y-3">
                {modules
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((m, idx) => {
                    const moduleLessons = lessonsByModule.get(m.id) ?? [];
                    return (
                      <div key={m.id}>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 px-2">
                          {idx + 1}. {m.title}
                        </div>
                        <ul className="space-y-0.5">
                          {moduleLessons.map((l) => (
                            <LessonRailItem
                              key={l.id}
                              lesson={l}
                              progress={enrollment.progress?.[l.id]}
                              active={activeLessonId === l.id}
                              onSelect={() => setActiveLessonId(l.id)}
                            />
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                {unfiled.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 px-2">
                      {t("labels.courseLearner.otherLessons")}
                    </div>
                    <ul className="space-y-0.5">
                      {unfiled.map((l) => (
                        <LessonRailItem
                          key={l.id}
                          lesson={l}
                          progress={enrollment.progress?.[l.id]}
                          active={activeLessonId === l.id}
                          onSelect={() => setActiveLessonId(l.id)}
                        />
                      ))}
                    </ul>
                  </div>
                )}
                {totalLessons === 0 && (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    {t("messages.courseLearner.noLessonsYet")}
                  </div>
                )}
              </CardContent>
            </Card>
            <Button variant="outline" className="w-full" onClick={() => navigate(`/courses/${course.userId}/${course.slug}`)}>
              ← {t("actions.courseLearner.backToCoursePage")}
            </Button>
          </nav>

          {/* Active lesson */}
          <div className="min-w-0 space-y-4">
            {/* Persistent course-completion banner. Unlike the one-shot
                celebration dialog (which only fires on the in-session
                false→true transition), this stays visible for the whole
                time the enrollment is passed — so a learner who finishes
                the last lesson, or returns to a completed course, always
                has a clear "course complete + certificate" surface in the
                main column instead of only the small header text.
                Self-gates on `passed` (DRY rule) — safe to leave mounted. */}
            <CourseCompletePanel
              passed={enrollment.passed}
              courseTitle={course.title}
              issuesCertificate={course.issuesCertificate}
              certNumber={data.certificate?.certNumber ?? null}
            />
            {activeLesson ? (
              <Card>
                <CardContent className="p-0">
                  <div className="p-4 border-b flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">
                        {t(LESSON_TYPE_LABEL_KEY[activeLesson.sourceType])}
                        {activeLesson.estimatedMinutes
                          ? ` · ${t("labels.courseLearner.minutesShort", { count: activeLesson.estimatedMinutes })}`
                          : ""}
                      </div>
                      <h2 className="font-semibold truncate">{activeLesson.title}</h2>
                      {activeLesson.summary && (
                        <p className="text-sm text-muted-foreground truncate">{activeLesson.summary}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* #1521 — owner / SuperAdmin edits via the
                          existing CourseContentEditor surface. Deep
                          link includes the lesson id so the editor
                          can scroll-to/focus it. */}
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigate(
                              `/services/creator/courses?courseId=${course.id}&lessonId=${activeLesson.id}`,
                            )
                          }
                          title={t("actions.courseLearner.editLesson")}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          {t("actions.edit")}
                        </Button>
                      )}
                      {/* #2068 GAP-2 — learning-scoped AI coach launcher. */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={askCoach}
                        title={t("learn.coach.ask")}
                      >
                        <Sparkles className="h-4 w-4 mr-1" />
                        {t("learn.coach.ask")}
                      </Button>
                      {/* SCORM lessons mark complete on their own Commit event;
                          every other type gets the explicit Mark Complete button. */}
                      {activeLesson.sourceType !== "scorm_package" && (
                        <Button
                          size="sm"
                          onClick={markComplete}
                          disabled={
                            markingComplete ||
                            enrollment.progress?.[activeLesson.id]?.status === "passed"
                          }
                        >
                          {markingComplete ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                          )}
                          {enrollment.progress?.[activeLesson.id]?.status === "passed"
                            ? t("labels.completed")
                            : t("actions.courseLearner.markComplete")}
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
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-12 text-center text-muted-foreground">
                  {t("messages.courseLearner.pickLesson")}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Course-completion celebration — fires once when the enrollment
          flips false→true. Surfaces the cert, badge note, and the
          natural "what's next" CTAs in one dialog. Self-gates on the
          underlying boolean so the consumer can leave it mounted
          unconditionally (DRY rule). */}
      <CourseCompletionDialog
        open={completionOpen}
        onOpenChange={setCompletionOpen}
        courseTitle={course.title}
        certNumber={data.certificate?.certNumber ?? null}
      />
    </AppShell>
  );
}

/**
 * Persistent course-completion panel for the lesson surface. Renders a
 * prominent "Course complete" card whenever the enrollment is passed,
 * regardless of which lesson is selected. This is the always-on
 * counterpart to {@link CourseCompletionDialog} (which only fires once
 * per session on the false→true flip): it closes the "I finished
 * everything but there's no way to see it's complete" gap by giving
 * returning learners a stable completion + certificate affordance.
 *
 * Self-gates on `passed` — returns null when the course isn't complete,
 * so the consumer leaves it mounted unconditionally (DRY rule).
 */
function CourseCompletePanel({
  passed,
  courseTitle,
  issuesCertificate,
  certNumber,
}: {
  passed: boolean;
  courseTitle: string;
  issuesCertificate: boolean;
  certNumber: string | null;
}) {
  const { t } = useTranslation();
  if (!passed) return null;
  return (
    <Card className="border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-900">
      <CardContent className="p-4 flex items-center gap-4 flex-wrap">
        <div className="h-11 w-11 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
          <Award className="h-6 w-6 text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">
            {t("headings.courseLearner.courseComplete")}
          </p>
          <p className="text-sm text-emerald-800/80 dark:text-emerald-300/80">
            {issuesCertificate
              ? t("messages.courseLearner.completePanelWithCert", { courseTitle })
              : t("messages.courseLearner.completePanel", { courseTitle })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {certNumber && (
            <Button asChild size="sm">
              <a href={`/verify/${certNumber}`} target="_blank" rel="noreferrer">
                <Award className="h-4 w-4 mr-2" />
                {t("actions.courseLearner.viewCertificate")}
              </a>
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <a href="/tools?tab=learning">{t("actions.courseLearner.browseMoreCourses")}</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CourseCompletionDialog({
  open,
  onOpenChange,
  courseTitle,
  certNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseTitle: string;
  certNumber: string | null;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
            <Award className="h-7 w-7 text-emerald-600" />
          </div>
          <DialogTitle className="text-center text-2xl">
            {t("headings.courseLearner.courseCompleteBang")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t("messages.courseLearner.dialogFinishedPrefix")}{" "}
            <span className="font-medium text-foreground">{courseTitle}</span>.{" "}
            {t("messages.courseLearner.dialogFinishedSuffix")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center sm:flex-col sm:gap-2">
          {certNumber && (
            <Button asChild className="w-full sm:w-auto">
              <a href={`/verify/${certNumber}`} target="_blank" rel="noreferrer">
                <Award className="h-4 w-4 mr-2" />
                {t("actions.courseLearner.viewYourCertificate")}
              </a>
            </Button>
          )}
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <a href="/tools?tab=learning">{t("actions.courseLearner.browseMoreCourses")}</a>
          </Button>
          <Button variant="ghost" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            {t("actions.courseLearner.keepReviewing")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LessonRailItem({
  lesson,
  progress,
  active,
  onSelect,
}: {
  lesson: CourseLesson;
  progress: LessonProgress | undefined;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const Icon = SOURCE_ICON[lesson.sourceType];
  const passed = progress?.status === "passed";
  const ariaLabel = `${lesson.title}${passed ? ` ${t("labels.courseLearner.railCompletedSuffix")}` : ""}${lesson.isRequired ? "" : ` ${t("labels.courseLearner.railOptionalSuffix")}`}`;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        aria-label={ariaLabel}
        className={cn(
          // #1503 — focus-visible ring on the lesson-row button so
          // keyboard learners can see which lesson they're about to
          // activate. Tailwind's default `focus-visible:outline-none` is
          // the strip-the-default-blue half; the `ring-2 ring-primary`
          // half restores a visible focus indicator that respects the
          // active course theme.
          "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-muted/60 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
          active && "bg-primary/10 text-primary",
        )}
      >
        {passed ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm truncate flex-1">{lesson.title}</span>
        {!lesson.isRequired && (
          <span className="text-[10px] text-muted-foreground">{t("labels.courseLearner.optional")}</span>
        )}
      </button>
    </li>
  );
}

function LessonBody({
  lesson,
  enrollmentId,
  courseId,
  themeTokens,
  onScormCompleted,
}: {
  lesson: CourseLesson;
  enrollmentId: string;
  courseId: string;
  themeTokens?: Record<string, string>;
  onScormCompleted: () => void;
}) {
  const { t } = useTranslation();
  // One switch on sourceType — every lesson kind self-renders without
  // prop-drilling capability flags through the parent.
  switch (lesson.sourceType) {
    case "text_md":
      // #1782 — a text_md lesson can also carry a companion video; the
      // shared Read/Watch component decides its own toggle visibility.
      return <ReadWatchLesson lesson={lesson} defaultTab="read" />;

    case "scorm_package":
      if (!lesson.scormEntryUrl || !lesson.scormVersion) {
        return (
          <div className="p-6 flex items-center gap-2 text-sm text-amber-700 bg-amber-50">
            <Lock className="h-4 w-4" />
            {t("messages.courseLearner.scormNotConfigured")}
          </div>
        );
      }
      return (
        <ScormPlayer
          enrollmentId={enrollmentId}
          lessonId={lesson.id}
          scormVersion={lesson.scormVersion}
          scormEntryUrl={lesson.scormEntryUrl}
          courseId={courseId}
          onCompleted={onScormCompleted}
          className="h-[70vh]"
          themeTokens={themeTokens}
        />
      );

    case "studio_video":
      if (!lesson.studioProjectId) {
        return (
          <div className="p-6 text-sm text-muted-foreground italic">
            {t("messages.courseLearner.noStudioProject")}
          </div>
        );
      }
      // #1782 — a studio_video lesson can also carry a readable body; the
      // shared Read/Watch component defaults a video lesson to "watch".
      return <ReadWatchLesson lesson={lesson} defaultTab="watch" />;

    case "external_url":
      if (!lesson.externalUrl) {
        return (
          <div className="p-6 text-sm text-muted-foreground italic">
            {t("messages.courseLearner.noUrlProvided")}
          </div>
        );
      }
      return <ExternalUrlLesson lesson={lesson} />;

    default:
      return null;
  }
}

/**
 * #1782 — shared Read / Watch surface. Decides its OWN visibility: when a
 * lesson carries BOTH a readable body and a video source it shows a small
 * two-tab toggle; when it has a single modality it renders that modality
 * with no toggle. No `hasToggle` boolean drilled in from the parent — the
 * caller only hints the preferred default tab (video lessons → "watch").
 *
 * Video source resolution (#1464): prefer the published `studioSlug` for
 * the /v/ embed so share links + analytics use the slug; fall back to the
 * raw project id for back-compat when the slug hasn't been resolved.
 */
function ReadWatchLesson({
  lesson,
  defaultTab,
}: {
  lesson: CourseLesson;
  defaultTab: "read" | "watch";
}) {
  const { t } = useTranslation();
  // #1464 — `studioSlug` is added to each lesson by the learner-content
  // API for studio_video lessons (resolves studio_projects.slug). The
  // shared CourseLesson type doesn't yet carry it, so read it narrowly.
  const studioSlug = (lesson as { studioSlug?: string | null }).studioSlug ?? null;
  const videoRef = studioSlug || lesson.studioProjectId;

  const hasBody = !!lesson.bodyMd;
  const hasVideo = !!videoRef;

  const [tab, setTab] = useState<"read" | "watch">(defaultTab);

  const readView = (
    <div className="space-y-4">
      {lesson.bodyMd ? (
        <TextNarrator
          text={lesson.bodyMd}
          preferenceKey="learn.lesson-narration"
          variant="inline"
        />
      ) : null}
      {lesson.bodyMd ? (
        // Shared <Markdown> resolves API-relative image srcs (e.g. the
        // /api/og/lesson-diagram diagrams embedded by migration 0190) and
        // owns the prose wrapper — no duplicate ReactMarkdown setup here.
        <Markdown>{lesson.bodyMd}</Markdown>
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-muted-foreground italic">{t("messages.courseLearner.noContentYet")}</p>
        </div>
      )}
    </div>
  );

  const watchView = videoRef ? (
    <div className="aspect-video w-full bg-black rounded-md overflow-hidden">
      <iframe
        src={`/v/${videoRef}`}
        title={lesson.title}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen; picture-in-picture"
      />
    </div>
  ) : (
    <div className="text-sm text-muted-foreground italic">
      {t("messages.courseLearner.noStudioProject")}
    </div>
  );

  // Single-modality lessons render directly — no toggle.
  if (hasBody && !hasVideo) return <div className="p-6">{readView}</div>;
  if (hasVideo && !hasBody) return <div className="p-4">{watchView}</div>;

  return (
    <div className="p-4 space-y-4">
      <div className="inline-flex rounded-md border p-0.5 text-sm">
        <button
          type="button"
          aria-pressed={tab === "read"}
          className={`px-3 py-1 rounded ${tab === "read" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          onClick={() => setTab("read")}
        >
          {t("actions.courseLearner.read")}
        </button>
        <button
          type="button"
          aria-pressed={tab === "watch"}
          className={`px-3 py-1 rounded ${tab === "watch" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          onClick={() => setTab("watch")}
        >
          {t("actions.courseLearner.watch")}
        </button>
      </div>
      {tab === "read" ? readView : watchView}
    </div>
  );
}

/**
 * #1463 — external_url lessons embedded in a sandboxed iframe. Requires
 * HTTPS (refuses to embed plaintext-http origins, showing an inline
 * warning + open-in-new-tab affordance instead) and surfaces a
 * `Hosted at <domain>` badge so the learner can see where the embedded
 * content originates.
 */
function ExternalUrlLesson({ lesson }: { lesson: CourseLesson }) {
  const { t } = useTranslation();
  const url = lesson.externalUrl ?? "";

  // Parse once; guard against malformed URLs so a bad row never throws.
  const parsed = useMemo(() => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  }, [url]);

  const isHttps = parsed?.protocol === "https:";
  const hostname = parsed?.hostname ?? null;

  if (!isHttps) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3 text-sm text-amber-800 dark:text-amber-300">
          <Lock className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {t("messages.courseLearner.externalUrlNotSecure", {
              defaultValue:
                "This lesson links to an insecure (http) address and can't be embedded. Open it in a new tab instead.",
            })}
          </span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
        >
          {t("actions.courseLearner.openInNewTab")} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {hostname && (
        <Badge variant="outline" className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3" />
          {t("labels.courseLearner.hostedAt", {
            domain: hostname,
            defaultValue: "Hosted at {{domain}}",
          })}
        </Badge>
      )}
      <div className="aspect-video w-full bg-muted rounded-md overflow-hidden border">
        <iframe
          src={url}
          title={lesson.title}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
      >
        {t("actions.courseLearner.openInNewTab")} <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
