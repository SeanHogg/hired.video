/**
 * My Learning panel (#1889) — the learner's aggregate home, rendered as
 * the "My Learning" tab on /tools (NOT a standalone route — learning +
 * plans live under /tools).
 *
 * Progress data already existed (`/api/courses/me/enrollments` annotates
 * passed/total lessons; cohort assignments carry due dates) but had no
 * single surface. Layout is a two-column shell:
 *   • Left  — one unified content list (assigned + self-enrolled merged,
 *             deduped by enrollment), with per-item visual cues (which
 *             classroom assigned it, required, due/overdue, progress) and
 *             a classroom filter that appears once you've joined one.
 *   • Right — your learning goal + join-a-classroom (with the educator
 *             "manage classrooms" link folded into the join card).
 *
 * Read-only over existing endpoints; no new server read was added here.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { courseService, type EnrollmentRow } from "@/lib/services/course-service";
import { listMyAssignments, joinCohortByCode, type LearnerAssignment } from "@/lib/courses/courses-api";
import LearningGoalCard from "@/components/learning/LearningGoalCard";
import { BookOpen, AlertTriangle, ArrowRight, Users } from "lucide-react";

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

/** One row in the unified content list — an assigned course/path and/or a
 *  self-enrolled course collapsed into a single learner-facing item. */
interface LearningItem {
  key: string;
  title: string;
  href: string;
  passed: boolean;
  passedLessons: number | null;
  totalLessons: number | null;
  pct: number;
  assigned: boolean;
  cohortName: string | null;
  subjectType: "course" | "path";
  required: boolean;
  due: { text: string; overdue: boolean } | null;
}

export default function MyLearningPanel() {
  const { isAuthenticated } = useAuth();

  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [assignments, setAssignments] = useState<LearnerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joinMsg, setJoinMsg] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [cohortFilter, setCohortFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [enr, asg] = await Promise.all([
      courseService.listMyEnrollments().catch(() => [] as EnrollmentRow[]),
      listMyAssignments().catch(() => [] as LearnerAssignment[]),
    ]);
    setEnrollments(enr);
    setAssignments(asg);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
    else setLoading(false);
  }, [isAuthenticated, load]);

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinMsg(null);
    try {
      const res = await joinCohortByCode(joinCode.trim());
      setJoinMsg(`Joined "${res.cohort.name}". Any assigned training now appears in your list.`);
      setJoinCode("");
      await load();
    } catch (e) {
      setJoinMsg(e instanceof Error ? e.message : "Could not join with that code.");
    } finally {
      setJoining(false);
    }
  };

  // Merge assigned training + self-enrolled courses into one list, deduped by
  // enrollment so a course that was assigned *and* started shows up once
  // (carrying both its classroom cue and its live progress bar).
  const items = useMemo<LearningItem[]>(() => {
    const byEnrollment = new Map<string, EnrollmentRow>();
    for (const r of enrollments) byEnrollment.set(r.enrollment.id, r);

    const result: LearningItem[] = [];
    const claimedEnrollments = new Set<string>();

    for (const a of assignments) {
      const enr = a.enrollmentId ? byEnrollment.get(a.enrollmentId) : undefined;
      if (enr) claimedEnrollments.add(enr.enrollment.id);
      const total = enr?.totalLessons ?? null;
      const pct = enr && enr.totalLessons > 0 ? Math.round((enr.passedLessons / enr.totalLessons) * 100) : 0;
      result.push({
        key: a.assignmentId,
        title: a.title,
        href: a.subjectType === "course"
          ? (a.enrollmentId ? `/learn/${a.enrollmentId}` : "/tools?tab=learning")
          : "/tools?tab=learning",
        passed: a.passed,
        passedLessons: enr?.passedLessons ?? null,
        totalLessons: total,
        pct,
        assigned: true,
        cohortName: a.cohortName,
        subjectType: a.subjectType,
        required: a.required,
        due: dueLabel(a.dueAt),
      });
    }

    for (const r of enrollments) {
      if (claimedEnrollments.has(r.enrollment.id)) continue;
      const pct = r.totalLessons > 0 ? Math.round((r.passedLessons / r.totalLessons) * 100) : 0;
      result.push({
        key: r.enrollment.id,
        title: r.course.title,
        href: `/learn/${r.enrollment.id}`,
        passed: r.enrollment.passed,
        passedLessons: r.passedLessons,
        totalLessons: r.totalLessons,
        pct,
        assigned: false,
        cohortName: null,
        subjectType: "course",
        required: false,
        due: null,
      });
    }

    return result;
  }, [enrollments, assignments]);

  // Distinct classrooms the learner has training from — drives the filter,
  // which only appears once they belong to at least one classroom.
  const cohorts = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignments) if (a.cohortName) set.add(a.cohortName);
    return [...set];
  }, [assignments]);

  const visibleItems = cohortFilter ? items.filter((i) => i.cohortName === cohortFilter) : items;

  return (
    <div className="grid grid-cols-1 gap-6 mt-2 lg:grid-cols-3">
      {/* ── Left: unified content list ───────────────────────────────── */}
      <div className="space-y-4 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> Your learning
          </h2>
          {cohorts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCohortFilter(null)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  cohortFilter === null ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-muted"
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
                    cohortFilter === name ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-muted"
                  }`}
                >
                  <Users className="h-3 w-3" /> {name}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : visibleItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {cohortFilter
              ? "No training from this classroom yet."
              : <>No courses yet. Join a classroom or browse the{" "}
                  <Link to="/tools?tab=learning" className="underline">learning library</Link>.</>}
          </p>
        ) : (
          <div className="space-y-2">
            {visibleItems.map((item) => {
              const hasProgress = item.totalLessons != null && item.totalLessons > 0;
              const cta = item.passed ? "Review" : item.passedLessons ? "Continue" : "Start";
              return (
                <Card key={item.key} className={item.due?.overdue && !item.passed ? "border-destructive/50" : ""}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium truncate">{item.title}</p>
                        {item.assigned && item.cohortName && (
                          <Badge variant="secondary" className="gap-1 font-normal">
                            <Users className="h-3 w-3" /> {item.cohortName}
                          </Badge>
                        )}
                        {item.required && <Badge variant="outline" className="font-normal">Required</Badge>}
                      </div>
                      {hasProgress && (
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${item.passed ? 100 : item.pct}%` }} />
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {item.passed
                          ? "Completed"
                          : hasProgress
                            ? `${item.passedLessons} of ${item.totalLessons} lessons`
                            : item.subjectType === "path" ? "Learning path" : "Course"}
                        {item.due && !item.passed && (
                          <span className={item.due.overdue ? "text-destructive" : ""}>
                            {" · "}
                            {item.due.overdue && <AlertTriangle className="inline h-3.5 w-3.5 mr-0.5 -mt-0.5" />}
                            {item.due.text}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button asChild size="sm" variant={item.passed ? "outline" : "default"}>
                      <Link to={item.href}>
                        {cta}
                        {!item.passed && <ArrowRight className="h-4 w-4 ml-1" />}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Right: goal + join a classroom ───────────────────────────── */}
      <div className="space-y-6">
        {/* Learning-goal onboarding wedge — capture intent + recommend courses.
            Self-gates: shows the capture prompt until a goal is set. */}
        <LearningGoalCard source="onboarding" />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Join a classroom</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Got a join code from an educator or employer? Enter it to receive their assigned training.
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
    </div>
  );
}
