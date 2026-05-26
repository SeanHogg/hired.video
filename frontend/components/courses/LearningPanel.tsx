import { useEffect, useState } from "react";
import { GraduationCap, Loader2, ArrowRight, Plus, Video, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import CourseMarketplaceCard, {
  type CourseMarketplaceItem,
} from "@/components/CourseMarketplaceCard";
import { UnenrollButton } from "@/components/courses/UnenrollButton";
import {
  courseService,
  type EnrollmentRow,
  type PublicCourseCard,
} from "@/lib/services/course-service";
import { useAuth } from "@/lib/auth";

interface LearningPanelProps {
  /** Cap on how many courses to fetch. Default 50 matches the legacy
   *  per-profile cap in ProfileCoursesPanel. */
  limit?: number;
  /** When true, hide the section-level intro copy (used by surfaces that
   *  already render their own heading above the grid). */
  hideIntro?: boolean;
}

/**
 * Renders the platform's learning content library — every published course
 * across the platform. Used by the Tools / Learning surface to compete
 * with LinkedIn Learning's separately-licensed content library: ours is
 * bundled into every plan (including Free).
 *
 * The grid is intentionally generic — it reuses CourseMarketplaceCard so
 * cards look identical to the `/search?category=courses` marketplace. The
 * fetch path is `GET /api/courses/public` (already DI-refactored).
 */
export default function LearningPanel({ limit = 50, hideIntro = false }: LearningPanelProps = {}) {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<PublicCourseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    courseService
      .listPublished(limit)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  // Authed users see a "Continue learning" rail across the top with every
  // course they've enrolled in. Self-fetches; unauth viewers skip.
  // `enrollmentsToken` bumps after an unenroll so the rail refreshes.
  const [enrollmentsToken, setEnrollmentsToken] = useState(0);
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    courseService
      .listMyEnrollments()
      .then((rows) => {
        if (!cancelled) setEnrollments(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, enrollmentsToken]);
  const refreshEnrollments = () => setEnrollmentsToken((t) => t + 1);

  return (
    <div>
      {!hideIntro && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-brand-purple" />
              Learning Content Library
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Built-in courses on AI, RAG, and must-have skills — SCORM 1.2,
              xAPI tracked, with HMAC-signed verifiable certificates. No
              separate license required.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/services/creator/courses">
              <Button variant="outline" size="sm">
                <Plus className="mr-1 h-4 w-4" /> Author a course
              </Button>
            </Link>
            <Link to="/studio?contentTemplate=course-lesson-explainer">
              <Button variant="outline" size="sm">
                <Video className="mr-1 h-4 w-4" /> Record a video lesson
              </Button>
            </Link>
            <Link to="/search?category=courses">
              <Button variant="outline" size="sm">
                Browse marketplace <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* "Continue learning" rail — only renders when the authed user
          has at least one enrollment. Shared component decides its own
          visibility (returns null when empty) per the DRY rule. */}
      {enrollments.length > 0 && (
        <ContinueLearningRail
          enrollments={enrollments}
          onEnrollmentChange={refreshEnrollments}
        />
      )}

      {loading ? (
        <Card>
          <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading courses…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground space-y-4">
          <GraduationCap className="h-8 w-8 mx-auto opacity-60" />
          <div>
            <p className="font-medium mb-1">No published courses yet</p>
            <p className="text-sm max-w-xl mx-auto">
              Platform-seeded courses on AI, RAG, and must-have skills will
              appear here once the seed migration runs. Employer-authored
              internal training and creator-published courses surface
              alongside them.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Link to="/services/creator/courses">
              <Button>
                <Plus className="mr-1 h-4 w-4" /> Author the first course
              </Button>
            </Link>
            <Link to="/studio?contentTemplate=course-lesson-explainer">
              <Button variant="outline">
                <Video className="mr-1 h-4 w-4" /> Or record a lesson in Studio
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((c) => (
            <CourseMarketplaceCard key={c.id} item={c as CourseMarketplaceItem} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Per-enrollment "Continue learning" card. The progress bar is derived
 *  from `enrollment.passed` + the enrollment's `progress` JSONB (count
 *  of passed lessons over total — we don't have total here, so we show a
 *  100/0 bar for passed/in-progress; a future iteration can compute the
 *  real percentage if we add `progressPct` to the listMyEnrollments
 *  response). */
function ContinueLearningRail({
  enrollments,
  onEnrollmentChange,
}: {
  enrollments: EnrollmentRow[];
  onEnrollmentChange: () => void;
}) {
  const incomplete = enrollments.filter((r) => !r.enrollment.passed);
  const completed = enrollments.filter((r) => r.enrollment.passed);
  return (
    <div className="mb-8 space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Continue learning
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {incomplete.map((r) => (
          <EnrollmentCard
            key={r.enrollment.id}
            row={r}
            onUnenrolled={onEnrollmentChange}
          />
        ))}
        {completed.map((r) => (
          <EnrollmentCard
            key={r.enrollment.id}
            row={r}
            onUnenrolled={onEnrollmentChange}
          />
        ))}
      </div>
    </div>
  );
}

function EnrollmentCard({
  row,
  onUnenrolled,
}: {
  row: EnrollmentRow;
  onUnenrolled: () => void;
}) {
  const { enrollment, course, totalLessons, passedLessons } = row;
  const passed = enrollment.passed;
  // #1462 — exact percentage now that listMyEnrollments annotates totals.
  const pct = totalLessons > 0 ? Math.round((passedLessons / totalLessons) * 100) : 0;
  const hasStarted = passedLessons > 0
    || Object.values(enrollment.progress ?? {}).some((p) => p?.status === "in_progress");
  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-semibold text-sm truncate">{course.title}</h4>
            {course.summary && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{course.summary}</p>
            )}
          </div>
          <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
        <div className="text-xs text-muted-foreground">
          {passed
            ? `Completed · ${passedLessons} of ${totalLessons} lessons`
            : totalLessons > 0
              ? `${passedLessons} of ${totalLessons} lessons · ${pct}%`
              : "Not started"}
        </div>
        <Progress value={passed ? 100 : pct} className="h-1.5" />
        <div className="flex items-center gap-2">
          <Link to={`/learn/${enrollment.id}`} className="flex-1">
            <Button size="sm" variant={passed ? "outline" : "default"} className="w-full">
              <Play className="h-3.5 w-3.5 mr-1" />
              {passed ? "Review" : hasStarted ? "Continue" : "Start"}
            </Button>
          </Link>
          {/* Self-gates on passed — returns null for completed/cert-issued rows
              so the Review CTA stretches the full width via flex-1 above. */}
          <UnenrollButton
            courseId={course.id}
            courseTitle={course.title}
            isPassed={passed}
            onUnenrolled={onUnenrolled}
          />
        </div>
      </CardContent>
    </Card>
  );
}
