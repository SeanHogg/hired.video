// /interview-assignments — shows both:
//   • interviews assigned to me as a job seeker (with my answers)
//   • interviews I created as a recruiter / employer (with candidate responses + resend)
//
// Detail view is reached at /interview-assignments/:id.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Mic,
  RotateCcw,
  Send,
  Type,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import {
  getInterviewAssignment,
  listMyInterviewAssignments,
  resendInterviewInvite,
  type InterviewAssignmentRow,
  type AssignmentResponse,
} from "@/lib/services/interview-assignments-service";
import { toast } from "sonner";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-blue-100 text-blue-800",
    in_progress: "bg-amber-100 text-amber-800",
    submitted: "bg-green-100 text-green-800",
    reviewed: "bg-purple-100 text-purple-800",
    expired: "bg-red-100 text-red-800",
  };
  return <Badge className={styles[status] ?? ""}>{status.replace("_", " ")}</Badge>;
}

function InterviewRow({
  row,
  perspective,
  onResend,
}: {
  row: InterviewAssignmentRow;
  perspective: "creator" | "candidate";
  onResend?: (id: string) => void;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Link to={`/interview-assignments/${row.id}`} className="font-medium text-sm hover:underline">
                {row.title}
              </Link>
              <StatusBadge status={row.status} />
              {row.assignmentType === "invite" && (
                <Badge variant="outline" className="text-[10px]">
                  Invite
                </Badge>
              )}
              {row.targetRole && (
                <Badge variant="secondary" className="text-[10px]">
                  {row.targetRole}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
              <span>
                {row.questions.length} question{row.questions.length === 1 ? "" : "s"}
              </span>
              {perspective === "creator" && row.candidateEmail && <span>→ {row.candidateEmail}</span>}
              {row.questionResponseDeadline && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Due {new Date(row.questionResponseDeadline).toLocaleDateString()}
                </span>
              )}
              {row.resendCount > 0 && <span>Resent {row.resendCount}×</span>}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {perspective === "creator" && onResend && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onResend(row.id)}
                disabled={row.status === "submitted" || row.status === "reviewed"}
                className="gap-1"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Resend
              </Button>
            )}
            <Button asChild size="sm" variant={perspective === "candidate" ? "default" : "outline"}>
              <Link to={`/interview-assignments/${row.id}`}>
                {perspective === "candidate" ? "Open" : "View"}
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ListView() {
  const [createdByMe, setCreatedByMe] = useState<InterviewAssignmentRow[]>([]);
  const [assignedToMe, setAssignedToMe] = useState<InterviewAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listMyInterviewAssignments();
      setCreatedByMe(res.createdByMe);
      setAssignedToMe(res.assignedToMe);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load interviews");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleResend(id: string) {
    try {
      await resendInterviewInvite(id);
      toast.success("Magic link re-sent");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      {assignedToMe.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Assigned to me</h2>
          {assignedToMe.map((row) => (
            <InterviewRow key={row.id} row={row} perspective="candidate" />
          ))}
        </section>
      )}

      {createdByMe.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Send className="h-4 w-4" />
            Sent by me
          </h2>
          {createdByMe.map((row) => (
            <InterviewRow key={row.id} row={row} perspective="creator" onResend={handleResend} />
          ))}
        </section>
      )}

      {createdByMe.length === 0 && assignedToMe.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Users className="h-10 w-10 text-muted-foreground/50 mx-auto" />
            <p className="text-sm text-muted-foreground">No interview assignments yet.</p>
            <Button asChild>
              <Link to="/tools/interview-questions">Generate interview questions</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DetailView({ id }: { id: string }) {
  const [data, setData] = useState<{
    interview: InterviewAssignmentRow;
    responses: AssignmentResponse[];
    viewerRole: "creator" | "candidate";
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getInterviewAssignment(id)
      .then(setData)
      .catch((err) => setError(err?.message ?? "Could not load interview"))
      .finally(() => setLoading(false));
  }, [id]);

  const responsesByQuestion = useMemo(() => {
    const map = new Map<string, AssignmentResponse>();
    if (data) data.responses.forEach((r) => map.set(r.questionId, r));
    return map;
  }, [data]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error ?? "Interview not found"}</AlertDescription>
      </Alert>
    );
  }

  const { interview, responses, viewerRole } = data;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/interview-assignments">
          <ArrowLeft className="h-4 w-4 mr-1" />
          All interview assignments
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span>{interview.title}</span>
            <StatusBadge status={interview.status} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {interview.targetRole && (
            <p>
              <span className="font-medium">Target role:</span> {interview.targetRole}
            </p>
          )}
          {interview.instructions && (
            <p className="text-muted-foreground">{interview.instructions}</p>
          )}
          {viewerRole === "creator" && interview.candidateEmail && (
            <p className="text-muted-foreground">
              <span className="font-medium">Candidate:</span> {interview.candidateEmail}
            </p>
          )}
          {interview.questionResponseDeadline && (
            <p className="text-muted-foreground">
              <span className="font-medium">Response deadline:</span>{" "}
              {new Date(interview.questionResponseDeadline).toLocaleString()}
            </p>
          )}
          {viewerRole === "candidate" && interview.status !== "submitted" && interview.inviteToken && (
            <div className="pt-3">
              <Button asChild>
                <Link to={`/interview/${interview.inviteToken}`}>
                  {responses.length > 0 ? "Continue answering" : "Start answering"}
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {interview.questions.map((q, i) => {
          const r = responsesByQuestion.get(q.id);
          return (
            <Card key={q.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Q{i + 1}. {q.text}
                </CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {q.category}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {q.maxDurationSec}s
                  </Badge>
                  {r && (
                    <Badge className="bg-green-500/10 text-green-600 text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {r.responseMode === "text" ? (
                        <>
                          <Type className="h-3 w-3 mr-1" /> Text
                        </>
                      ) : (
                        <>
                          <Mic className="h-3 w-3 mr-1" /> Video
                        </>
                      )}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {r ? (
                  r.responseMode === "text" ? (
                    <p className="text-sm whitespace-pre-wrap">{r.textAnswer ?? ""}</p>
                  ) : r.videoUrl ? (
                    <video
                      src={r.videoUrl}
                      controls
                      className="w-full max-w-md rounded-md"
                      preload="metadata"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      Video recorded but not yet uploaded.
                    </p>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground italic">No answer yet.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default function MyInterviewAssignments() {
  const { isAuthenticated } = useAuth();
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) navigate("/login?next=/interview-assignments");
  }, [isAuthenticated, navigate]);

  return (
    <AppShell>
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
          <h1 className="text-2xl font-bold">Interview assignments</h1>
          <Button asChild variant="outline">
            <Link to="/tools/interview-questions">
              <Copy className="h-4 w-4 mr-1.5" />
              New question set
            </Link>
          </Button>
        </div>
        {id ? <DetailView id={id} /> : <ListView />}
      </div>
    </AppShell>
  );
}
