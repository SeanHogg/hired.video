// /tools/interview-questions
//
// Drives the new question-generation flow surfaced on the AI tools page
// (and deep-linked from Career 360 + the AI Coach):
//   1. User picks a source — saved resume, saved job, pasted text, or
//      target role alone. (Resume/job loads happen lazily per tab so the
//      tool never hits an endpoint the user isn't using.)
//   2. /api/interview-assignments/generate extracts skills (reuses the
//      skill-extractor service) and asks the LLM for 3–10 questions tied
//      to those skills + the target role.
//   3. Questions render with per-question time + skill chips. Job seekers
//      can copy or hand off to AI Coach to practice; recruiters /
//      employers can additionally assign the set to a candidate via
//      magic link (the assign panel falls back to invite-on-signup when
//      the email isn't yet a job-seeker user).

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardCheck,
  Copy,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { ToolShell } from "@/components/tools/ToolShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import { USER_ROLES } from "@shared/user-roles";
import { resumeService } from "@/lib/services/resume-service";
import { jobService } from "@/lib/services/job-service";
import {
  assignInterview,
  buildAICoachPracticeHref,
  generateInterviewQuestions,
  type ExtractedSkill,
  type GeneratedQuestion,
  type QuestionStyle,
  type SourceContext,
} from "@/lib/services/interview-assignments-service";
import { toast } from "sonner";

type SourceMode = "resume" | "job" | "text" | "target-only";

export default function InterviewQuestions() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const deepLinkResumeId = searchParams.get("resumeId") ?? "";
  const deepLinkJobId = searchParams.get("jobId") ?? "";
  const deepLinkTargetRole = searchParams.get("targetRole") ?? "";
  const sourceContext: SourceContext =
    (searchParams.get("source") as SourceContext | null) ?? "tool";

  const initialMode: SourceMode = deepLinkTargetRole
    ? "target-only"
    : deepLinkResumeId
      ? "resume"
      : deepLinkJobId
        ? "job"
        : "resume";

  const [mode, setMode] = useState<SourceMode>(initialMode);
  const [resumeId, setResumeId] = useState(deepLinkResumeId);
  const [jobId, setJobId] = useState(deepLinkJobId);
  const [pastedText, setPastedText] = useState("");
  const [pastedKind, setPastedKind] = useState<"job" | "resume">("job");
  const [targetRole, setTargetRole] = useState(deepLinkTargetRole);
  const [seniority, setSeniority] = useState("");
  const [style, setStyle] = useState<QuestionStyle>("mixed");
  const [count, setCount] = useState(5);

  const [skills, setSkills] = useState<ExtractedSkill[]>([]);
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRecruiterOrEmployer =
    user?.role === USER_ROLES.RECRUITER ||
    user?.role === USER_ROLES.EMPLOYER ||
    user?.role === USER_ROLES.ADMIN ||
    user?.role === USER_ROLES.SUPER_ADMIN;

  const { data: resumes = [] } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => resumeService.getUserResumes(),
    enabled: isAuthenticated && mode === "resume",
  });
  const { data: userJobs = [] } = useQuery({
    queryKey: ["user-jobs"],
    queryFn: () => jobService.getUserJobs(),
    enabled: isAuthenticated && mode === "job",
  });

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const payload: Parameters<typeof generateInterviewQuestions>[0] = {
        style,
        count,
        seniority: seniority.trim() || undefined,
        targetRole: targetRole.trim() || undefined,
        sourceContext,
      };
      if (mode === "resume") {
        if (!resumeId) throw new Error("Pick a resume first");
        payload.resumeId = resumeId;
      } else if (mode === "job") {
        if (!jobId) throw new Error("Pick a job first");
        payload.jobId = jobId;
      } else if (mode === "text") {
        if (pastedText.trim().length < 20)
          throw new Error("Paste at least 20 characters of job description or resume text");
        payload.content = pastedText.trim();
        payload.sourceType = pastedKind;
      } else if (mode === "target-only") {
        if (!targetRole.trim())
          throw new Error("Enter a target role title to generate from");
      }

      const res = await generateInterviewQuestions(payload);
      setSkills(res.skills);
      setQuestions(res.questions);
      if (res.questions.length === 0) {
        setError("Couldn't generate any questions for that input. Try a different source.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not generate questions";
      setError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }

  function handleCopyAll() {
    if (questions.length === 0) return;
    const text = questions
      .map((q, i) => `${i + 1}. ${q.text}${q.maxDurationSec ? ` (max ${q.maxDurationSec}s)` : ""}`)
      .join("\n");
    void navigator.clipboard.writeText(text).then(
      () => toast.success("Questions copied to clipboard"),
      () => toast.error("Could not copy to clipboard"),
    );
  }

  function handleCopyOne(q: GeneratedQuestion) {
    void navigator.clipboard.writeText(q.text).then(
      () => toast.success("Question copied"),
      () => toast.error("Could not copy"),
    );
  }

  function handlePracticeInCoach() {
    if (questions.length === 0) return;
    navigate(buildAICoachPracticeHref(questions, targetRole));
  }

  // ─── Assign dialog state ─────────────────────────────────────────────
  const [assignOpen, setAssignOpen] = useState(false);

  return (
    <ToolShell
      toolId="interview-questions"
      header={{
        icon: <ClipboardCheck className="h-6 w-6 text-brand-purple" />,
        iconBgClassName: "bg-purple-100",
        title: "Interview Questions",
        description:
          "Generate skill-tailored interview questions from a resume, a job, or just a target role. Copy them, practise with the AI Coach, or assign them to a candidate.",
        tier: "free",
      }}
      authOverlay={{
        show: !isAuthenticated,
        message: "Sign in to generate skill-tailored interview questions.",
      }}
      containerClassName="max-w-5xl mx-auto"
    >
      <div className="space-y-6 mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Pick your source</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => setMode(v as SourceMode)}>
              <TabsList className="grid grid-cols-4 w-full max-w-2xl">
                <TabsTrigger value="resume">Resume</TabsTrigger>
                <TabsTrigger value="job">Job</TabsTrigger>
                <TabsTrigger value="text">Paste text</TabsTrigger>
                <TabsTrigger value="target-only">Role only</TabsTrigger>
              </TabsList>

              <TabsContent value="resume" className="space-y-3 pt-4">
                <Label>Saved resume</Label>
                <Select value={resumeId} onValueChange={setResumeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a resume" />
                  </SelectTrigger>
                  <SelectContent>
                    {resumes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.title ?? "Untitled resume"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Skills are extracted from the resume; questions probe them in the target-role context.
                </p>
              </TabsContent>

              <TabsContent value="job" className="space-y-3 pt-4">
                <Label>Saved job</Label>
                <Select value={jobId} onValueChange={setJobId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a job" />
                  </SelectTrigger>
                  <SelectContent>
                    {userJobs.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.title}{j.company ? ` — ${j.company}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Skills are extracted from the JD; questions reference the exact responsibilities required.
                </p>
              </TabsContent>

              <TabsContent value="text" className="space-y-3 pt-4">
                <div className="flex items-center gap-3">
                  <Label>Treat pasted text as:</Label>
                  <Select value={pastedKind} onValueChange={(v) => setPastedKind(v as "job" | "resume")}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="job">Job description</SelectItem>
                      <SelectItem value="resume">Resume</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste a job description or resume…"
                  rows={8}
                />
              </TabsContent>

              <TabsContent value="target-only" className="space-y-3 pt-4">
                <Alert>
                  <AlertDescription>
                    No resume or JD? Generate from the role title alone — the questions will lean on common
                    expectations for that role and seniority.
                  </AlertDescription>
                </Alert>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Tune the question set</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="iq-role">Target role</Label>
              <Input
                id="iq-role"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. Senior Backend Engineer"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="iq-seniority">Seniority</Label>
              <Input
                id="iq-seniority"
                value={seniority}
                onChange={(e) => setSeniority(e.target.value)}
                placeholder="e.g. Senior, Lead"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Style</Label>
              <Select value={style} onValueChange={(v) => setStyle(v as QuestionStyle)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">Mixed</SelectItem>
                  <SelectItem value="behavioral">Behavioral</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Count</Label>
              <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 4, 5, 6, 7, 8, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} questions
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardContent className="pt-0">
            <Button onClick={handleGenerate} disabled={generating || !isAuthenticated} className="gap-2">
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate questions
            </Button>
            {error && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {skills.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Skills detected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {skills.slice(0, 30).map((s, i) => (
                  <Badge key={`${s.name}-${i}`} variant="secondary" className="text-[11px]">
                    {s.name}
                    {s.importance === "required" && <span className="ml-1 text-red-600">*</span>}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {questions.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">3. Your questions ({questions.length})</CardTitle>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleCopyAll} className="gap-1">
                  <Copy className="h-3.5 w-3.5" />
                  Copy all
                </Button>
                <Button variant="outline" size="sm" onClick={handlePracticeInCoach} className="gap-1">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Practise in AI Coach
                </Button>
                {isRecruiterOrEmployer && (
                  <Button size="sm" onClick={() => setAssignOpen(true)} className="gap-1">
                    <Users className="h-3.5 w-3.5" />
                    Assign to candidate
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {questions.map((q, i) => (
                <div key={q.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-[260px]">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className="text-[10px]">
                          Q{i + 1}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {q.category}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {q.maxDurationSec}s
                        </Badge>
                        {q.required && (
                          <Badge variant="destructive" className="text-[10px]">
                            Required
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm">{q.text}</p>
                      {q.skillLinks.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Probes: {q.skillLinks.join(", ")}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleCopyOne(q)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <AssignDialog
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          questions={questions}
          skills={skills}
          targetRole={targetRole}
          sourceContext={sourceContext}
          sourceResumeId={mode === "resume" ? resumeId : undefined}
          sourceJobId={mode === "job" ? jobId : undefined}
        />
      </div>
    </ToolShell>
  );
}

// ─── Assign-to-candidate dialog ──────────────────────────────────────────────

interface AssignDialogProps {
  open: boolean;
  onClose: () => void;
  questions: GeneratedQuestion[];
  skills: ExtractedSkill[];
  targetRole?: string;
  sourceContext: SourceContext;
  sourceResumeId?: string;
  sourceJobId?: string;
}

function AssignDialog({
  open,
  onClose,
  questions,
  skills,
  targetRole,
  sourceContext,
  sourceResumeId,
  sourceJobId,
}: AssignDialogProps) {
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState(targetRole ? `${targetRole} — interview` : "Interview Questions");
  const [instructions, setInstructions] = useState("");
  const [linkExpiryHours, setLinkExpiryHours] = useState(168); // 7d
  const [responseWindowHours, setResponseWindowHours] = useState(72); // 3d
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    inviteUrl: string;
    assignmentType: string;
    candidateBound: boolean;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setResult(null);
      setEmail("");
      setTitle(targetRole ? `${targetRole} — interview` : "Interview Questions");
      setInstructions("");
    }
  }, [open, targetRole]);

  const totalSeconds = useMemo(
    () => questions.reduce((sum, q) => sum + q.maxDurationSec, 0),
    [questions],
  );

  async function handleSubmit() {
    if (!email.trim()) {
      toast.error("Enter the candidate's email");
      return;
    }
    setSubmitting(true);
    try {
      const res = await assignInterview({
        candidateEmail: email.trim(),
        title: title.trim() || "Interview Questions",
        instructions: instructions.trim() || undefined,
        questions,
        jobId: sourceJobId,
        sourceResumeId,
        sourceContext,
        targetRole: targetRole?.trim() || undefined,
        extractedSkills: skills,
        linkExpiryHours,
        responseWindowHours,
      });
      setResult({
        inviteUrl: res.inviteUrl,
        assignmentType: res.assignmentType,
        candidateBound: res.candidateBound,
      });
      toast.success(
        res.candidateBound
          ? "Assigned — magic link sent to the candidate."
          : "Invited — candidate will sign up via the magic link.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not assign";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopyLink() {
    if (!result) return;
    void navigator.clipboard.writeText(result.inviteUrl).then(
      () => toast.success("Invite link copied"),
      () => toast.error("Could not copy"),
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-brand-purple" />
            Assign to candidate
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <Alert>
              <AlertDescription>
                {result.candidateBound
                  ? "The candidate already has a job-seeker account — the magic link is wired straight to them."
                  : "The candidate doesn't have an account yet — the magic link will prompt them to sign up as a job seeker before answering."}
              </AlertDescription>
            </Alert>
            <div>
              <Label className="text-xs">Magic link (also emailed to the candidate)</Label>
              <div className="flex gap-2 mt-1">
                <Input value={result.inviteUrl} readOnly />
                <Button variant="outline" onClick={handleCopyLink}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="assign-email">Candidate email</Label>
              <Input
                id="assign-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="candidate@example.com"
              />
              <p className="text-[11px] text-muted-foreground">
                If the email matches a job-seeker account we'll bind directly. Otherwise we'll send an invite they
                can sign up against.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-title">Title</Label>
              <Input id="assign-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-instructions">Instructions (optional)</Label>
              <Textarea
                id="assign-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                placeholder="e.g. Please answer each question on video, max 2 minutes each."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Magic link expires in</Label>
                <Select
                  value={String(linkExpiryHours)}
                  onValueChange={(v) => setLinkExpiryHours(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">24 hours</SelectItem>
                    <SelectItem value="72">3 days</SelectItem>
                    <SelectItem value="168">7 days</SelectItem>
                    <SelectItem value="336">14 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Response window</Label>
                <Select
                  value={String(responseWindowHours)}
                  onValueChange={(v) => setResponseWindowHours(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">24 hours</SelectItem>
                    <SelectItem value="72">3 days</SelectItem>
                    <SelectItem value="168">7 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Target className="h-3 w-3" />
              {questions.length} questions • approx {Math.round(totalSeconds / 60)} min total
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || questions.length === 0}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Send invite
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
