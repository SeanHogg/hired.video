/**
 * My Learning panel (#1889) — the learner's aggregate home, rendered as
 * the "My Learning" tab on /tools (NOT a standalone route — learning +
 * plans live under /tools).
 *
 * Progress data already existed (`/api/courses/me/enrollments` annotates
 * passed/total lessons; cohort assignments carry due dates) but had no
 * single surface. This packages it for the Student persona (#1886):
 *   • Assigned to you   — training pushed by an educator/employer + due dates
 *   • Your courses      — self-enrolled, with live progress bars
 *   • Join a classroom  — self-serve join-by-code
 *
 * Read-only over existing endpoints; no new server read was added here.
 */
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { courseService, type EnrollmentRow } from "@/lib/services/course-service";
import { listMyAssignments, joinCohortByCode, type LearnerAssignment } from "@/lib/courses/courses-api";
import LearningGoalCard from "@/components/learning/LearningGoalCard";
import { BookOpen, CalendarClock, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";

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

export default function MyLearningPanel() {
  const { isAuthenticated } = useAuth();

  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [assignments, setAssignments] = useState<LearnerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joinMsg, setJoinMsg] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

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
      setJoinMsg(`Joined "${res.cohort.name}". Any assigned training now appears below.`);
      setJoinCode("");
      await load();
    } catch (e) {
      setJoinMsg(e instanceof Error ? e.message : "Could not join with that code.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="space-y-8 mt-2">
      <p className="text-sm">
        <Link to="/tools?tab=classrooms" className="text-primary underline">
          Educator or employer? Manage classrooms &amp; assign training →
        </Link>
      </p>

      {/* Learning-goal onboarding wedge — capture intent + recommend courses.
          Self-gates: shows the capture prompt until a goal is set. */}
      <LearningGoalCard source="onboarding" />

      {/* Assigned to you */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <CalendarClock className="h-5 w-5" /> Assigned to you
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No assigned training. Join a classroom below or browse the{" "}
            <Link to="/tools?tab=learning" className="underline">learning library</Link>.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {assignments.map((a) => {
              const due = dueLabel(a.dueAt);
              const href = a.subjectType === "course"
                ? (a.enrollmentId ? `/learn/${a.enrollmentId}` : "/tools?tab=learning")
                : "/tools?tab=learning";
              return (
                <Card key={a.assignmentId} className={due?.overdue && !a.passed ? "border-destructive/50" : ""}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium leading-tight">{a.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.cohortName} · {a.subjectType === "course" ? "Course" : "Path"}
                          {a.required ? " · Required" : ""}
                        </p>
                      </div>
                      {a.passed ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 shrink-0">
                          <CheckCircle2 className="h-4 w-4" /> Done
                        </span>
                      ) : due ? (
                        <span className={`inline-flex items-center gap-1 text-xs shrink-0 ${due.overdue ? "text-destructive" : "text-muted-foreground"}`}>
                          {due.overdue && <AlertTriangle className="h-3.5 w-3.5" />}{due.text}
                        </span>
                      ) : null}
                    </div>
                    <Button asChild size="sm" variant={a.passed ? "outline" : "default"} className="w-full">
                      <Link to={href}>
                        {a.passed ? "Review" : "Start"} <ArrowRight className="h-4 w-4 ml-1" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Your courses */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <BookOpen className="h-5 w-5" /> Your courses
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You haven't enrolled in any courses yet.{" "}
            <Link to="/tools?tab=learning" className="underline">Explore the library</Link>.
          </p>
        ) : (
          <div className="space-y-2">
            {enrollments.map((r) => {
              const pct = r.totalLessons > 0 ? Math.round((r.passedLessons / r.totalLessons) * 100) : 0;
              return (
                <Card key={r.enrollment.id}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{r.course.title}</p>
                      <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${r.enrollment.passed ? 100 : pct}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {r.enrollment.passed ? "Completed" : `${r.passedLessons} of ${r.totalLessons} lessons`}
                      </p>
                    </div>
                    <Button asChild size="sm" variant={r.enrollment.passed ? "outline" : "default"}>
                      <Link to={`/learn/${r.enrollment.id}`}>{r.enrollment.passed ? "Review" : "Continue"}</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Join a classroom */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Join a classroom</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
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
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
