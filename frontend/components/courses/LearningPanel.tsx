import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  GraduationCap,
  Loader2,
  ArrowRight,
  Plus,
  Video,
  Play,
  BookOpen,
  AlertTriangle,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import CourseMarketplaceCard, {
  type CourseMarketplaceItem,
} from "@/components/CourseMarketplaceCard";
import { UnenrollButton } from "@/components/courses/UnenrollButton";
import { type ViewMode } from "@/components/ViewModeToggle";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import Pagination, { usePaginatedList } from "@/components/Pagination";
import LearningGoalCard from "@/components/learning/LearningGoalCard";
import {
  courseService,
  type EnrollmentRow,
  type CourseEnrollment,
  type PublicCourseCard,
} from "@/lib/services/course-service";
import {
  listMyAssignments,
  joinCohortByCode,
  type LearnerAssignment,
} from "@/lib/courses/courses-api";
import { useAuth } from "@/lib/auth";

interface LearningPanelProps {
  /** Cap on how many published courses to fetch for the library. */
  limit?: number;
  /** Active layout mode — controlled by the parent so the toggle can live
   *  next to the global search in PageHeader rather than in this panel. */
  view: ViewMode;
  /** Layout-mode setter, paired with `view`. */
  onViewChange: (next: ViewMode) => void;
}

/** Layout modes the Learning surface offers — Scroll (carousel) / Card
 *  (grid) / Table (dense rows). Shared with every other browse surface via
 *  `<ViewModeToggle>`; "Card" maps to the toggle's `grid` mode. Exported so
 *  the parent (Tools.tsx) can drive the lifted toggle with the same set. */
export const LEARNING_VIEW_MODES: ViewMode[] = ["scroll", "grid", "table"];

type LearningStatus = "in_progress" | "not_started" | "available" | "completed";

/** Default sort puts in-progress training first, then anything queued/assigned
 *  but not started, then the browsable library, with finished courses last. */
const STATUS_RANK: Record<LearningStatus, number> = {
  in_progress: 0,
  not_started: 1,
  available: 2,
  completed: 3,
};

/**
 * One row in the unified learning list. Collapses three sources into a single
 * learner-facing item: cohort assignments, self-enrolments (with live
 * progress), and the published course library (browsable "available" items).
 * A course that is assigned *and* started shows up once, carrying both its
 * classroom cue and its progress bar.
 */
interface LearningItem {
  key: string;
  courseId: string | null;
  title: string;
  summary: string | null;
  href: string;
  status: LearningStatus;
  passed: boolean;
  passedLessons: number | null;
  totalLessons: number | null;
  pct: number;
  /** Rich marketplace card payload — only set for browsable library items
   *  (not enrolled, not assigned) so the grid reuses CourseMarketplaceCard. */
  card: CourseMarketplaceItem | null;
  assigned: boolean;
  cohortName: string | null;
  subjectType: "course" | "path";
  required: boolean;
  due: { text: string; overdue: boolean } | null;
}

function dueLabel(dueAt: string | null): { text: string; overdue: boolean } | null {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  const now = new Date();
  const overdue = now > due;
  const days = Math.round((due.getTime() - now.getTime()) / 86_400_000);
  const text = overdue
    ? `Overdue by ${Math.abs(days)}d`
    : days === 0
      ? "Due today"
      : `Due in ${days}d`;
  return { text, overdue };
}

/** An enrolment counts as started once a lesson has been passed or any lesson
 *  sits in_progress — drives the Start-vs-Continue CTA and the in-progress
 *  sort bucket. */
function hasStarted(enrollment: CourseEnrollment, passedLessons: number): boolean {
  return (
    passedLessons > 0 ||
    Object.values(enrollment.progress ?? {}).some((p) => p?.status === "in_progress")
  );
}

function ctaLabel(item: LearningItem): string {
  if (item.status === "available") return "View course";
  if (item.passed) return "Review";
  if (item.status === "in_progress") return "Continue";
  return "Start";
}

/**
 * Tools → Learning surface. Consolidates the old "Learning" (browse library)
 * and "My Learning" (your enrolled + assigned training) tabs into one:
 *   • Main  — a single unified list (assigned + self-enrolled + library,
 *             deduped), in-progress first, rendered as Scroll / Card / Table.
 *             The layout toggle is lifted to the page header (next to search).
 *   • Right — create actions (author / record / browse), your learning goal,
 *             and join-a-classroom (the old My Learning sidebar, with the
 *             educator "manage classrooms" link folded in).
 *
 * Read-only over existing endpoints (`/api/courses/public`,
 * `/api/courses/me/enrollments`, learner assignments) — no new server read.
 */
export default function LearningPanel({
  limit = 50,
  view,
  onViewChange,
}: LearningPanelProps) {
  const { isAuthenticated } = useAuth();
  const [library, setLibrary] = useState<PublicCourseCard[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [assignments, setAssignments] = useState<LearnerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cohortFilter, setCohortFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [lib, enr, asg] = await Promise.all([
      courseService.listPublished(limit).catch(() => [] as PublicCourseCard[]),
      isAuthenticated
        ? courseService.listMyEnrollments().catch(() => [] as EnrollmentRow[])
        : Promise.resolve([] as EnrollmentRow[]),
      isAuthenticated
        ? listMyAssignments().catch(() => [] as LearnerAssignment[])
        : Promise.resolve([] as LearnerAssignment[]),
    ]);
    setLibrary(lib);
    setEnrollments(enr);
    setAssignments(asg);
    setLoading(false);
  }, [limit, isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  // Merge the three sources into one in-progress-first list. Library courses
  // the viewer is already enrolled in (or assigned) collapse into the richer
  // enrolled/assigned item so a course never appears twice.
  const items = useMemo<LearningItem[]>(() => {
    const byEnrollment = new Map<string, EnrollmentRow>();
    for (const r of enrollments) byEnrollment.set(r.enrollment.id, r);
    const libraryById = new Map<string, PublicCourseCard>();
    for (const c of library) libraryById.set(c.id, c);

    const claimedEnrollments = new Set<string>();
    const claimedCourses = new Set<string>();
    const result: LearningItem[] = [];

    // 1) Assigned training (cohort assignments). Carries the classroom cue.
    for (const a of assignments) {
      const enr = a.enrollmentId ? byEnrollment.get(a.enrollmentId) : undefined;
      if (enr) claimedEnrollments.add(enr.enrollment.id);
      const courseId = a.subjectType === "course" ? a.subjectId : null;
      if (courseId) claimedCourses.add(courseId);
      const lib = courseId ? libraryById.get(courseId) : undefined;
      const passedLessons = enr?.passedLessons ?? null;
      const totalLessons = enr?.totalLessons ?? null;
      const pct =
        enr && enr.totalLessons > 0
          ? Math.round((enr.passedLessons / enr.totalLessons) * 100)
          : 0;
      const status: LearningStatus = a.passed
        ? "completed"
        : enr && hasStarted(enr.enrollment, enr.passedLessons)
          ? "in_progress"
          : "not_started";
      result.push({
        key: a.assignmentId,
        courseId,
        title: a.title,
        summary: lib?.summary ?? null,
        href: a.enrollmentId
          ? `/learn/${a.enrollmentId}`
          : lib
            ? `/courses/${lib.author.slug}/${lib.slug}`
            : "/tools?tab=learning",
        status,
        passed: a.passed,
        passedLessons,
        totalLessons,
        pct,
        card: null,
        assigned: true,
        cohortName: a.cohortName,
        subjectType: a.subjectType,
        required: a.required,
        due: dueLabel(a.dueAt),
      });
    }

    // 2) Self-enrolments not already represented by an assignment.
    for (const r of enrollments) {
      if (claimedEnrollments.has(r.enrollment.id)) continue;
      claimedCourses.add(r.course.id);
      const pct =
        r.totalLessons > 0 ? Math.round((r.passedLessons / r.totalLessons) * 100) : 0;
      const status: LearningStatus = r.enrollment.passed
        ? "completed"
        : hasStarted(r.enrollment, r.passedLessons)
          ? "in_progress"
          : "not_started";
      result.push({
        key: r.enrollment.id,
        courseId: r.course.id,
        title: r.course.title,
        summary: r.course.summary,
        href: `/learn/${r.enrollment.id}`,
        status,
        passed: r.enrollment.passed,
        passedLessons: r.passedLessons,
        totalLessons: r.totalLessons,
        pct,
        card: null,
        assigned: false,
        cohortName: null,
        subjectType: "course",
        required: false,
        due: null,
      });
    }

    // 3) The browsable library — every published course the viewer hasn't
    //    enrolled in / been assigned yet.
    for (const c of library) {
      if (claimedCourses.has(c.id)) continue;
      result.push({
        key: `lib:${c.id}`,
        courseId: c.id,
        title: c.title,
        summary: c.summary,
        href: `/courses/${c.author.slug}/${c.slug}`,
        status: "available",
        passed: false,
        passedLessons: null,
        totalLessons: null,
        pct: 0,
        card: c as CourseMarketplaceItem,
        assigned: false,
        cohortName: null,
        subjectType: "course",
        required: false,
        due: null,
      });
    }

    // Stable sort: in-progress → not started → available → completed.
    return result
      .map((item, i) => ({ item, i }))
      .sort((a, b) => STATUS_RANK[a.item.status] - STATUS_RANK[b.item.status] || a.i - b.i)
      .map(({ item }) => item);
  }, [library, enrollments, assignments]);

  // Distinct classrooms the learner has training from — drives the filter,
  // which only appears once they belong to at least one classroom.
  const cohorts = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignments) if (a.cohortName) set.add(a.cohortName);
    return [...set];
  }, [assignments]);

  const visibleItems = cohortFilter
    ? items.filter((i) => i.cohortName === cohortFilter)
    : items;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* ── Main: unified learning list ──────────────────────────────── */}
      <div className="space-y-5 lg:col-span-2">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-brand-purple" />
            Learning
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Your in-progress training, assigned courses, and the built-in
            content library — SCORM 1.2, xAPI tracked, with HMAC-signed
            verifiable certificates. No separate license required.
          </p>
        </div>

        {/* Classroom filter — self-gates on membership; the layout toggle now
            lives in the page header next to the global search. */}
        {cohorts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCohortFilter(null)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                cohortFilter === null
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "hover:bg-muted"
              }`}
            >
              All
            </button>
            {cohorts.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setCohortFilter(name)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
                  cohortFilter === name
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "hover:bg-muted"
                }`}
              >
                <Users className="h-3 w-3" /> {name}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <Card>
            <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading courses…
            </CardContent>
          </Card>
        ) : visibleItems.length === 0 ? (
          <LearningEmptyState cohortFiltered={cohortFilter !== null} />
        ) : (
          <LearningItemsView items={visibleItems} view={view} onChanged={load} />
        )}
      </div>

      {/* ── Right: goal + join a classroom ───────────────────────────── */}
      <LearningSidebar onJoined={load} />
    </div>
  );
}

/** Switches the unified list between Scroll / Card / Table. Scroll + Card
 *  share `renderItemCard`; Table is a dense rows view. */
function LearningItemsView({
  items,
  view,
  onChanged,
}: {
  items: LearningItem[];
  view: ViewMode;
  onChanged: () => void;
}) {
  if (view === "table") {
    return <LearningTable items={items} />;
  }

  const card = (item: LearningItem) =>
    item.card ? (
      <CourseMarketplaceCard item={item.card} />
    ) : (
      <EnrolledLearningCard item={item} onChanged={onChanged} />
    );

  if (view === "scroll") {
    return (
      <HorizontalScroller itemCount={items.length}>
        {items.map((item) => (
          <Fragment key={item.key}>{card(item)}</Fragment>
        ))}
      </HorizontalScroller>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.key}>{card(item)}</div>
      ))}
    </div>
  );
}

/** Progress-oriented card for enrolled/assigned items (browsable library
 *  items use the richer CourseMarketplaceCard instead). */
function EnrolledLearningCard({
  item,
  onChanged,
}: {
  item: LearningItem;
  onChanged: () => void;
}) {
  const hasProgress = item.totalLessons != null && item.totalLessons > 0;
  return (
    <Card
      className={`h-full flex flex-col hover:border-primary/40 transition-colors ${
        item.due?.overdue && !item.passed ? "border-destructive/50" : ""
      }`}
    >
      <CardContent className="p-4 flex flex-col flex-1 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-semibold text-sm truncate">{item.title}</h4>
            {item.summary && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {item.summary}
              </p>
            )}
          </div>
          <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {item.assigned && item.cohortName && (
            <Badge variant="secondary" className="gap-1 font-normal">
              <Users className="h-3 w-3" /> {item.cohortName}
            </Badge>
          )}
          {item.required && (
            <Badge variant="outline" className="font-normal">
              Required
            </Badge>
          )}
        </div>

        <div className="mt-auto space-y-3">
          <div className="text-xs text-muted-foreground">
            {item.passed
              ? `Completed · ${item.passedLessons ?? 0} of ${item.totalLessons ?? 0} lessons`
              : hasProgress
                ? `${item.passedLessons} of ${item.totalLessons} lessons · ${item.pct}%`
                : item.subjectType === "path"
                  ? "Learning path"
                  : "Not started"}
            {item.due && !item.passed && (
              <span className={item.due.overdue ? "text-destructive" : ""}>
                {" · "}
                {item.due.overdue && (
                  <AlertTriangle className="inline h-3.5 w-3.5 mr-0.5 -mt-0.5" />
                )}
                {item.due.text}
              </span>
            )}
          </div>
          {hasProgress && (
            <Progress value={item.passed ? 100 : item.pct} className="h-1.5" />
          )}
          <div className="flex items-center gap-2">
            <Link to={item.href} className="flex-1">
              <Button
                size="sm"
                variant={item.passed ? "outline" : "default"}
                className="w-full"
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                {ctaLabel(item)}
              </Button>
            </Link>
            {/* Self-enrolled (not assigned) course rows can be left from here;
                assigned training can't be unenrolled by the learner, so the
                button is omitted. UnenrollButton self-gates on passed —
                returns null for completed/cert-issued rows so the Review CTA
                stretches full width via flex-1. */}
            {!item.assigned && item.courseId && (
              <UnenrollButton
                courseId={item.courseId}
                courseTitle={item.title}
                isPassed={item.passed}
                onUnenrolled={onChanged}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Dense table view over the unified learning list — one row per item with
 *  status/progress, classroom cues, due date, and the same CTA. */
function LearningTable({ items }: { items: LearningItem[] }) {
  const { pageItems, paginationProps } = usePaginatedList(items, 12);
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Course</th>
              <th className="px-3 py-2 font-medium">Progress</th>
              <th className="px-3 py-2 font-medium">Classroom</th>
              <th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item) => {
              const hasProgress = item.totalLessons != null && item.totalLessons > 0;
              return (
                <tr
                  key={item.key}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2">
                    <Link to={item.href} className="font-medium hover:text-brand-purple">
                      {item.title}
                    </Link>
                    {item.required && (
                      <Badge variant="outline" className="ml-2 font-normal">
                        Required
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {item.status === "available" ? (
                      <span className="text-xs">Available</span>
                    ) : item.passed ? (
                      <span className="text-xs">Completed</span>
                    ) : hasProgress ? (
                      <span className="flex items-center gap-2">
                        <Progress value={item.pct} className="h-1.5 w-20" />
                        <span className="text-xs">{item.pct}%</span>
                      </span>
                    ) : (
                      <span className="text-xs">
                        {item.subjectType === "path" ? "Learning path" : "Not started"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {item.cohortName ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Users className="h-3 w-3" /> {item.cohortName}
                      </span>
                    ) : (
                      <span className="text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {item.due && !item.passed ? (
                      <span
                        className={`text-xs ${item.due.overdue ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {item.due.overdue && (
                          <AlertTriangle className="inline h-3.5 w-3.5 mr-0.5 -mt-0.5" />
                        )}
                        {item.due.text}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end">
                      <Button
                        asChild
                        size="sm"
                        variant={item.passed || item.status === "available" ? "outline" : "default"}
                      >
                        <Link to={item.href}>
                          {ctaLabel(item)}
                          {item.status !== "available" && !item.passed && (
                            <ArrowRight className="h-4 w-4 ml-1" />
                          )}
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination {...paginationProps} />
    </div>
  );
}

function LearningEmptyState({ cohortFiltered }: { cohortFiltered: boolean }) {
  if (cohortFiltered) {
    return (
      <p className="text-sm text-muted-foreground">
        No training from this classroom yet.
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground space-y-4">
      <GraduationCap className="h-8 w-8 mx-auto opacity-60" />
      <div>
        <p className="font-medium mb-1">No courses yet</p>
        <p className="text-sm max-w-xl mx-auto">
          Platform-seeded courses on AI, RAG, and must-have skills appear here,
          alongside employer-authored internal training and creator-published
          courses. Join a classroom or author the first course to get started.
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
  );
}

/** Right column: create actions (author / record / browse) + learning goal
 *  (self-gating onboarding wedge) + join-a-classroom. The goal + join cards
 *  were lifted verbatim from the retired My Learning tab. */
function LearningSidebar({ onJoined }: { onJoined: () => void }) {
  const [joinCode, setJoinCode] = useState("");
  const [joinMsg, setJoinMsg] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinMsg(null);
    try {
      const res = await joinCohortByCode(joinCode.trim());
      setJoinMsg(
        `Joined "${res.cohort.name}". Any assigned training now appears in your list.`,
      );
      setJoinCode("");
      onJoined();
    } catch (e) {
      setJoinMsg(e instanceof Error ? e.message : "Could not join with that code.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create actions — author a course, record a lesson, or browse the
          marketplace. Relocated here from the main list header. */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <Link to="/services/creator/courses" className="block">
            <Button variant="outline" size="sm" className="w-full justify-start">
              <Plus className="mr-1 h-4 w-4" /> Author a course
            </Button>
          </Link>
          <Link
            to="/studio?contentTemplate=course-lesson-explainer"
            className="block"
          >
            <Button variant="outline" size="sm" className="w-full justify-start">
              <Video className="mr-1 h-4 w-4" /> Record a video lesson
            </Button>
          </Link>
          <Link to="/search?category=courses" className="block">
            <Button variant="outline" size="sm" className="w-full justify-between">
              Browse marketplace <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Self-gates: shows the capture prompt until a goal is set. */}
      <LearningGoalCard source="onboarding" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Join a classroom
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Got a join code from an educator or employer? Enter it to receive
            their assigned training.
          </p>
          <div className="flex gap-2">
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="e.g. H7K2MNPQ"
              className="max-w-[200px] font-mono tracking-wider"
              maxLength={16}
            />
            <Button onClick={handleJoin} disabled={joining || !joinCode.trim()}>
              {joining ? "Joining…" : "Join"}
            </Button>
          </div>
          {joinMsg && <p className="text-sm text-muted-foreground">{joinMsg}</p>}
          <p className="text-sm border-t pt-3">
            <Link to="/tools?tab=classrooms" className="text-primary underline">
              Educator or employer? Manage classrooms &amp; assign training →
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
