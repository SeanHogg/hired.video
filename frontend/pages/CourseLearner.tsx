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
import StudioVideoSurface from "@/components/studio/StudioVideoSurface";
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
  Video,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { signalBadgeRefresh } from "@/lib/badges/refresh";
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

const LESSON_TYPE_LABEL: Record<CourseLessonSourceType, string> = {
  text_md: "Reading",
  studio_video: "Video",
  scorm_package: "Interactive SCORM",
  external_url: "External link",
};

export default function CourseLearner() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

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
        title: "Couldn't save progress",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    }
  }, [data, toast]);

  const markComplete = useCallback(async () => {
    if (!data || !activeLesson) return;
    setMarkingComplete(true);
    try {
      await applyLessonPassed(activeLesson.id);
      toast({ title: "Lesson complete" });
    } finally {
      setMarkingComplete(false);
    }
  }, [data, activeLesson, applyLessonPassed, toast]);

  // Called by <ScormPlayer> when the runtime fires Commit with passed/
  // completed. Same path as markComplete so completion celebration fires
  // for SCORM-driven passes too.
  const onScormCompleted = useCallback(() => {
    if (!activeLesson) return;
    void applyLessonPassed(activeLesson.id);
  }, [activeLesson, applyLessonPassed]);

  if (!isAuthenticated) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(`/learn/${enrollmentId ?? ""}`)}`} replace />;
  }

  if (loading) {
    return (
      <AppShell>
        <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading course…
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
              <GraduationCap className="h-4 w-4" /> Course
              {course.category && <>· <Badge variant="outline">{course.category}</Badge></>}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold truncate">{course.title}</h1>
            {course.summary && <p className="text-sm text-muted-foreground mt-1">{course.summary}</p>}
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-1">
              {passedCount} of {totalLessons} lessons complete
            </div>
            <Progress value={progressPct} className="w-48" />
            {enrollment.passed && (
              <div className="mt-2 flex items-center justify-end gap-2">
                <span className="flex items-center gap-1 text-sm text-emerald-600">
                  <Award className="h-4 w-4" />
                  Course passed
                </span>
                {data.certificate && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`/verify/${data.certificate.certNumber}`} target="_blank" rel="noreferrer">
                      View certificate
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-4">
          {/* Curriculum rail */}
          <nav aria-label="Course curriculum" className="space-y-4">
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
                      Other lessons
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
                    This course has no lessons yet.
                  </div>
                )}
              </CardContent>
            </Card>
            <Button variant="outline" className="w-full" onClick={() => navigate(`/courses/${course.userId}/${course.slug}`)}>
              ← Back to course page
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
                        {LESSON_TYPE_LABEL[activeLesson.sourceType]}
                        {activeLesson.estimatedMinutes ? ` · ${activeLesson.estimatedMinutes}m` : ""}
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
                          title="Edit this lesson"
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      )}
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
                            ? "Completed"
                            : "Mark complete"}
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
                  Pick a lesson from the rail to start.
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
  if (!passed) return null;
  return (
    <Card className="border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-900">
      <CardContent className="p-4 flex items-center gap-4 flex-wrap">
        <div className="h-11 w-11 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
          <Award className="h-6 w-6 text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">
            Course complete
          </p>
          <p className="text-sm text-emerald-800/80 dark:text-emerald-300/80">
            You've finished every lesson in {courseTitle}. Your progress is
            saved{issuesCertificate ? " and your certificate is ready" : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {certNumber && (
            <Button asChild size="sm">
              <a href={`/verify/${certNumber}`} target="_blank" rel="noreferrer">
                <Award className="h-4 w-4 mr-2" />
                View certificate
              </a>
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <a href="/tools?tab=learning">Browse more courses</a>
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
            <Award className="h-7 w-7 text-emerald-600" />
          </div>
          <DialogTitle className="text-center text-2xl">
            Course complete!
          </DialogTitle>
          <DialogDescription className="text-center">
            You finished <span className="font-medium text-foreground">{courseTitle}</span>.
            Your progress is recorded and any earned badges will appear in the corner momentarily.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center sm:flex-col sm:gap-2">
          {certNumber && (
            <Button asChild className="w-full sm:w-auto">
              <a href={`/verify/${certNumber}`} target="_blank" rel="noreferrer">
                <Award className="h-4 w-4 mr-2" />
                View your certificate
              </a>
            </Button>
          )}
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <a href="/tools?tab=learning">Browse more courses</a>
          </Button>
          <Button variant="ghost" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Keep reviewing
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
  const Icon = SOURCE_ICON[lesson.sourceType];
  const passed = progress?.status === "passed";
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        aria-label={`${lesson.title}${passed ? " (completed)" : ""}${lesson.isRequired ? "" : " (optional)"}`}
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
          <span className="text-[10px] text-muted-foreground">optional</span>
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
  // One switch on sourceType — every lesson kind self-renders without
  // prop-drilling capability flags through the parent.
  switch (lesson.sourceType) {
    case "text_md":
      return <TextMdLesson lesson={lesson} />;

    case "scorm_package":
      if (!lesson.scormEntryUrl || !lesson.scormVersion) {
        return (
          <div className="p-6 flex items-center gap-2 text-sm text-amber-700 bg-amber-50">
            <Lock className="h-4 w-4" />
            SCORM package isn't fully configured yet. Ask the course author to upload the zip.
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
            No Studio project linked to this lesson.
          </div>
        );
      }
      // The studio project gets a public watch URL keyed off its slug,
      // but only after the author published. Embed via the existing
      // public /v/:slug route — same surface analytics already wire.
      // When the project hasn't published we fall back to a deep-link
      // hint so the learner isn't staring at a blank iframe.
      return (
        <div className="p-4">
          <div className="aspect-video w-full bg-black rounded-md overflow-hidden">
            <iframe
              src={`/v/${lesson.studioProjectId}`}
              title={lesson.title}
              className="w-full h-full border-0"
              allow="autoplay; fullscreen; picture-in-picture"
            />
          </div>
        </div>
      );

    case "external_url":
      if (!lesson.externalUrl) {
        return (
          <div className="p-6 text-sm text-muted-foreground italic">
            No URL provided for this lesson.
          </div>
        );
      }
      return (
        <div className="p-4 space-y-3">
          <div className="aspect-video w-full bg-muted rounded-md overflow-hidden border">
            <iframe
              src={lesson.externalUrl}
              title={lesson.title}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
          <a
            href={lesson.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            Open in a new tab <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      );

    default:
      return null;
  }
}

/**
 * #1520 — text_md lesson with optional companion video. Renders a
 * Read / Watch tab toggle when `companionStudioProjectId` is set; falls
 * back to the prose-only view otherwise. Self-gates per the DRY rule —
 * no `hasCompanion` boolean drilled into parents.
 */
function TextMdLesson({ lesson }: { lesson: CourseLesson }) {
  const companionId = (lesson as any).companionStudioProjectId as string | undefined;
  const [tab, setTab] = useState<"read" | "watch">("read");

  const readView = (
    <div className="p-6 space-y-4">
      {lesson.bodyMd ? (
        <TextNarrator
          text={lesson.bodyMd}
          preferenceKey="learn.lesson-narration"
          variant="inline"
        />
      ) : null}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        {lesson.bodyMd ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.bodyMd}</ReactMarkdown>
        ) : (
          <p className="text-muted-foreground italic">This lesson has no content yet.</p>
        )}
      </div>
    </div>
  );

  if (!companionId) return readView;

  return (
    <div className="p-6 space-y-4">
      <div className="inline-flex rounded-md border p-0.5 text-sm">
        <button
          type="button"
          className={`px-3 py-1 rounded ${tab === "read" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          onClick={() => setTab("read")}
        >
          Read
        </button>
        <button
          type="button"
          className={`px-3 py-1 rounded ${tab === "watch" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          onClick={() => setTab("watch")}
        >
          Watch
        </button>
      </div>
      {tab === "read" ? (
        readView
      ) : (
        <StudioVideoSurface mode="lazy" videoId={companionId} />
      )}
    </div>
  );
}
