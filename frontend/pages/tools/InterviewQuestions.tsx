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
import { useTranslation } from "react-i18next";
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
  Pencil,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { ToolShell } from "@/components/tools/ToolShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useInterviewQuestionGenerator } from "@/hooks/use-interview-question-generator";
import { resumeService } from "@/lib/services/resume-service";
import { jobService } from "@/lib/services/job-service";
import {
  assignInterview,
  buildAICoachPracticeHref,
  QUESTION_COUNT_OPTIONS,
  type ExtractedSkill,
  type GeneratedQuestion,
  type GenerateRequest,
  type QuestionStyle,
  type SourceContext,
} from "@/lib/services/interview-assignments-service";
import { toast } from "sonner";

type SourceMode = "resume" | "job" | "text" | "target-only";

interface InterviewQuestionsDraft {
  mode: SourceMode;
  resumeId: string;
  jobId: string;
  pastedText: string;
  pastedKind: "job" | "resume";
  targetRole: string;
  seniority: string;
  style: QuestionStyle;
  count: number;
}

export default function InterviewQuestions() {
  const { t } = useTranslation();
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
  // #970 — generated questions are editable before assignment: the recruiter
  // can tweak wording, retime, reorder, delete, or add a custom question.
  const [editing, setEditing] = useState(false);
  const updateQuestion = (id: string, patch: Partial<GeneratedQuestion>) =>
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const removeQuestion = (id: string) =>
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  const moveQuestion = (id: string, dir: -1 | 1) =>
    setQuestions((prev) => {
      const i = prev.findIndex((q) => q.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const addQuestion = () =>
    setQuestions((prev) => [
      ...prev,
      {
        // Stable client-side id; the assign flow persists the text/timing, not the id.
        id: `custom-${prev.length}-${prev.reduce((n, q) => n + q.text.length, 0)}`,
        text: "",
        category: "behavioral",
        maxDurationSec: 120,
        required: false,
        skillLinks: [],
      },
    ]);
  // Authoritative target role + provenance returned by /generate. Used by
  // the AI Coach hand-off + the assign dialog so we ship the JD title /
  // resume role even when the user left the targetRole field blank.
  const [resolvedTargetRole, setResolvedTargetRole] = useState<string | null>(null);
  const [sourceDescription, setSourceDescription] = useState<string | null>(null);
  const { generating, error, setError, generate } = useInterviewQuestionGenerator();
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  // Snapshot every form field so an anon user who clicks Generate, signs
  // in, and bounces back to the page lands on the same configuration.
  const { restored, snapshot, clear } = usePendingToolInput<InterviewQuestionsDraft>();
  useEffect(() => {
    if (!restored || !isAuthenticated) return;
    setMode(restored.mode);
    setResumeId(restored.resumeId);
    setJobId(restored.jobId);
    setPastedText(restored.pastedText);
    setPastedKind(restored.pastedKind);
    setTargetRole(restored.targetRole);
    setSeniority(restored.seniority);
    setStyle(restored.style);
    setCount(restored.count);
  }, [restored, isAuthenticated]);

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
    // Validate inputs up-front so anon users get the same prompts they
    // would post-login — no point bouncing them through signup just to
    // discover they need to pick a resume.
    try {
      if (mode === "resume" && !resumeId) throw new Error(t("errors.interviewQuestions.pickResume"));
      if (mode === "job" && !jobId) throw new Error(t("errors.interviewQuestions.pickJob"));
      if (mode === "text" && pastedText.trim().length < 20)
        throw new Error(t("errors.interviewQuestions.pasteMinChars"));
      if (mode === "target-only" && !targetRole.trim())
        throw new Error(t("errors.interviewQuestions.enterTargetRole"));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.invalidInput");
      setError(message);
      toast.error(message);
      return;
    }

    if (!isAuthenticated) {
      snapshot({
        mode,
        resumeId,
        jobId,
        pastedText,
        pastedKind,
        targetRole,
        seniority,
        style,
        count,
      });
      setShowAuthOverlay(true);
      return;
    }

    const payload: GenerateRequest = {
      style,
      count,
      seniority: seniority.trim() || undefined,
      targetRole: targetRole.trim() || undefined,
      sourceContext,
    };
    if (mode === "resume") {
      payload.resumeId = resumeId;
    } else if (mode === "job") {
      payload.jobId = jobId;
    } else if (mode === "text") {
      payload.content = pastedText.trim();
      payload.sourceType = pastedKind;
    }

    const res = await generate(payload);
    if (!res) return;
    setSkills(res.skills);
    setQuestions(res.questions);
    setResolvedTargetRole(res.targetRole);
    setSourceDescription(res.sourceDescription);
    if (res.questions.length === 0) {
      setError(t("errors.interviewQuestions.noneGenerated"));
    } else {
      clear();
    }
  }

  function handleCopyAll() {
    if (questions.length === 0) return;
    const text = questions
      .map((q, i) => `${i + 1}. ${q.text}${q.maxDurationSec ? ` ${t("messages.interviewQuestions.copyMaxSeconds", { count: q.maxDurationSec })}` : ""}`)
      .join("\n");
    void navigator.clipboard.writeText(text).then(
      () => toast.success(t("messages.interviewQuestions.copiedAll")),
      () => toast.error(t("errors.couldNotCopyToClipboard")),
    );
  }

  function handleCopyOne(q: GeneratedQuestion) {
    void navigator.clipboard.writeText(q.text).then(
      () => toast.success(t("messages.interviewQuestions.copiedOne")),
      () => toast.error(t("errors.couldNotCopyTitle")),
    );
  }

  function handlePracticeInCoach() {
    if (questions.length === 0) return;
    navigate(
      buildAICoachPracticeHref({
        questions,
        targetRole: resolvedTargetRole ?? targetRole,
        seniority,
        style,
        sourceDescription,
        skills,
      }),
    );
  }

  // ─── Assign dialog state ─────────────────────────────────────────────
  const [assignOpen, setAssignOpen] = useState(false);

  return (
    <ToolShell
      toolId="interview-questions"
      header={{
        icon: <ClipboardCheck className="h-6 w-6 text-brand-purple" />,
        iconBgClassName: "bg-purple-100",
        title: t("headings.interviewQuestions.title"),
        description: t("messages.interviewQuestions.description"),
        tier: "free",
      }}
      authOverlay={{
        show: showAuthOverlay,
        message: t("messages.interviewQuestions.authOverlay"),
      }}
    >
      <div className="space-y-6 mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {t("headings.interviewQuestions.step1")}
              <span className="text-xs font-normal text-muted-foreground">
                {t("labels.interviewQuestions.chooseOne")}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => setMode(v as SourceMode)}>
              <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full max-w-2xl bg-muted/50 h-auto">
                <TabsTrigger
                  value="resume"
                  className="data-[state=active]:bg-brand-purple data-[state=active]:text-white data-[state=active]:shadow"
                >
                  {t("labels.resume")}
                </TabsTrigger>
                <TabsTrigger
                  value="job"
                  className="data-[state=active]:bg-brand-purple data-[state=active]:text-white data-[state=active]:shadow"
                >
                  {t("labels.jobLabel")}
                </TabsTrigger>
                <TabsTrigger
                  value="text"
                  className="data-[state=active]:bg-brand-purple data-[state=active]:text-white data-[state=active]:shadow"
                >
                  {t("labels.interviewQuestions.pasteText")}
                </TabsTrigger>
                <TabsTrigger
                  value="target-only"
                  className="data-[state=active]:bg-brand-purple data-[state=active]:text-white data-[state=active]:shadow"
                >
                  {t("labels.interviewQuestions.roleOnly")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="resume" className="space-y-3 pt-4">
                <div className="space-y-1.5">
                  <Label>{t("labels.interviewQuestions.savedResume")}</Label>
                  <Select value={resumeId} onValueChange={setResumeId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("fields.interviewQuestions.chooseResume")} />
                    </SelectTrigger>
                    <SelectContent>
                      {resumes.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.title ?? t("labels.untitledResume")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t("messages.interviewQuestions.resumeHint")}
                  </p>
                </div>
                <TargetRoleFields
                  targetRole={targetRole}
                  seniority={seniority}
                  onTargetRoleChange={setTargetRole}
                  onSeniorityChange={setSeniority}
                />
              </TabsContent>

              <TabsContent value="job" className="space-y-3 pt-4">
                <Label>{t("labels.interviewQuestions.savedJob")}</Label>
                <Select value={jobId} onValueChange={setJobId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("fields.interviewQuestions.chooseJob")} />
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
                  {t("messages.interviewQuestions.jobHint")}
                </p>
              </TabsContent>

              <TabsContent value="text" className="space-y-3 pt-4">
                <div className="flex items-center gap-3">
                  <Label>{t("labels.interviewQuestions.treatPastedAs")}</Label>
                  <Select value={pastedKind} onValueChange={(v) => setPastedKind(v as "job" | "resume")}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="job">{t("labels.interviewQuestions.jobDescription")}</SelectItem>
                      <SelectItem value="resume">{t("labels.resume")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={t("fields.interviewQuestions.pasteJobOrResume")}
                  rows={8}
                />
                {pastedKind === "resume" && (
                  <TargetRoleFields
                    targetRole={targetRole}
                    seniority={seniority}
                    onTargetRoleChange={setTargetRole}
                    onSeniorityChange={setSeniority}
                  />
                )}
              </TabsContent>

              <TabsContent value="target-only" className="space-y-3 pt-4">
                <Alert>
                  <AlertDescription>
                    {t("messages.interviewQuestions.roleOnlyHint")}
                  </AlertDescription>
                </Alert>
                <TargetRoleFields
                  targetRole={targetRole}
                  seniority={seniority}
                  onTargetRoleChange={setTargetRole}
                  onSeniorityChange={setSeniority}
                  required
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("headings.interviewQuestions.step2")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("labels.interviewQuestions.style")}</Label>
              <Select value={style} onValueChange={(v) => setStyle(v as QuestionStyle)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">{t("labels.interviewQuestions.styleMixed")}</SelectItem>
                  <SelectItem value="behavioral">{t("labels.interviewQuestions.styleBehavioral")}</SelectItem>
                  <SelectItem value="technical">{t("labels.interviewQuestions.styleTechnical")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("labels.interviewQuestions.count")}</Label>
              <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUESTION_COUNT_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {t("labels.interviewQuestions.questionsCount", { count: n })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardContent className="pt-0">
            <Button onClick={handleGenerate} disabled={generating} className="gap-2">
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {t("actions.interview.generateQuestions")}
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
              <CardTitle className="text-base">{t("headings.interviewQuestions.skillsDetected")}</CardTitle>
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
            <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base">
                  {t("headings.interviewQuestions.step3", { count: questions.length })}
                </CardTitle>
                {(resolvedTargetRole || sourceDescription) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("messages.interviewQuestions.generatedFor")}{" "}
                    {resolvedTargetRole && (
                      <span className="font-medium text-foreground">{resolvedTargetRole}</span>
                    )}
                    {seniority && <span> ({seniority})</span>}
                    {sourceDescription && (
                      <>
                        {" "}{t("messages.interviewQuestions.fromSource")}{" "}
                        <span className="italic">{sourceDescription}</span>
                      </>
                    )}
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleCopyAll} className="gap-1">
                  <Copy className="h-3.5 w-3.5" />
                  {t("actions.copyAll")}
                </Button>
                <Button variant="outline" size="sm" onClick={handlePracticeInCoach} className="gap-1">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {t("actions.interviewQuestions.practiseInCoach")}
                </Button>
                <Button
                  variant={editing ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setEditing((v) => !v)}
                  className="gap-1"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {editing ? t("actions.done") : t("actions.interviewQuestions.editQuestions")}
                </Button>
                {isRecruiterOrEmployer && (
                  <Button size="sm" onClick={() => setAssignOpen(true)} className="gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {t("actions.interviewQuestions.assignToCandidate")}
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
                          {t("labels.interview.qShort", { number: i + 1 })}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {q.category}
                        </Badge>
                        {editing ? (
                          <span className="inline-flex items-center gap-1">
                            <Input
                              type="number"
                              min={30}
                              max={600}
                              value={q.maxDurationSec}
                              onChange={(e) =>
                                updateQuestion(q.id, {
                                  maxDurationSec: Math.max(30, Math.min(600, Number(e.target.value) || 0)),
                                })
                              }
                              className="h-6 w-20 text-xs"
                              aria-label={t("labels.interviewQuestions.maxSecondsAria")}
                            />
                            <span className="text-[10px] text-muted-foreground">s</span>
                          </span>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            {q.maxDurationSec}s
                          </Badge>
                        )}
                        {q.required && !editing && (
                          <Badge variant="destructive" className="text-[10px]">
                            {t("labels.interviewQuestions.required")}
                          </Badge>
                        )}
                        {editing && (
                          <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Checkbox
                              checked={q.required}
                              onCheckedChange={(v) => updateQuestion(q.id, { required: v === true })}
                            />
                            {t("labels.interviewQuestions.required")}
                          </label>
                        )}
                      </div>
                      {editing ? (
                        <Textarea
                          value={q.text}
                          onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                          rows={2}
                          className="text-sm"
                          placeholder={t("labels.interviewQuestions.questionPlaceholder")}
                        />
                      ) : (
                        <p className="text-sm">{q.text}</p>
                      )}
                      {q.skillLinks.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {t("labels.interviewQuestions.probes", { skills: q.skillLinks.join(", ") })}
                        </p>
                      )}
                    </div>
                    {editing ? (
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={i === 0}
                          onClick={() => moveQuestion(q.id, -1)}
                          aria-label={t("labels.interviewQuestions.moveUp")}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={i === questions.length - 1}
                          onClick={() => moveQuestion(q.id, 1)}
                          aria-label={t("labels.interviewQuestions.moveDown")}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeQuestion(q.id)}
                          aria-label={t("actions.delete")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => handleCopyOne(q)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {editing && (
                <Button variant="outline" size="sm" onClick={addQuestion} className="gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  {t("actions.interviewQuestions.addQuestion")}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <AssignDialog
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          questions={questions}
          skills={skills}
          targetRole={resolvedTargetRole ?? targetRole}
          sourceContext={sourceContext}
          sourceResumeId={mode === "resume" ? resumeId : undefined}
          sourceJobId={mode === "job" ? jobId : undefined}
        />
      </div>
    </ToolShell>
  );
}

// ─── Shared target-role + seniority pair ────────────────────────────────────
// Used wherever the LLM needs an explicit role to interview the candidate for
// (resume tab, paste-resume tab, role-only tab). The Job tab doesn't render
// this — the JD already encodes the target role.

interface TargetRoleFieldsProps {
  targetRole: string;
  seniority: string;
  onTargetRoleChange: (v: string) => void;
  onSeniorityChange: (v: string) => void;
  /** When true, the target role field is marked required + the placeholder
   *  hints that it's the sole input. Used by the role-only tab. */
  required?: boolean;
}

function TargetRoleFields({
  targetRole,
  seniority,
  onTargetRoleChange,
  onSeniorityChange,
  required = false,
}: TargetRoleFieldsProps) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="iq-role">
          {t("labels.interviewQuestions.targetRole")}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        <Input
          id="iq-role"
          value={targetRole}
          onChange={(e) => onTargetRoleChange(e.target.value)}
          placeholder={t("fields.interviewQuestions.targetRolePlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="iq-seniority">{t("labels.seniority")}</Label>
        <Input
          id="iq-seniority"
          value={seniority}
          onChange={(e) => onSeniorityChange(e.target.value)}
          placeholder={t("fields.interviewQuestions.seniorityPlaceholder")}
        />
      </div>
    </div>
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
  const { t } = useTranslation();
  const defaultTitle = targetRole
    ? t("labels.interviewQuestions.assignDefaultTitle", { role: targetRole })
    : t("headings.interviewQuestions.title");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState(defaultTitle);
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
      setTitle(defaultTitle);
      setInstructions("");
    }
  }, [open, targetRole, defaultTitle]);

  const totalSeconds = useMemo(
    () => questions.reduce((sum, q) => sum + q.maxDurationSec, 0),
    [questions],
  );

  async function handleSubmit() {
    if (!email.trim()) {
      toast.error(t("errors.interviewQuestions.enterCandidateEmail"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await assignInterview({
        candidateEmail: email.trim(),
        title: title.trim() || t("headings.interviewQuestions.title"),
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
          ? t("messages.interviewQuestions.assignedBound")
          : t("messages.interviewQuestions.assignedInvited"),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.interviewQuestions.couldNotAssign");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopyLink() {
    if (!result) return;
    void navigator.clipboard.writeText(result.inviteUrl).then(
      () => toast.success(t("messages.interviewQuestions.inviteLinkCopied")),
      () => toast.error(t("errors.couldNotCopyTitle")),
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-brand-purple" />
            {t("actions.interviewQuestions.assignToCandidate")}
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <Alert>
              <AlertDescription>
                {result.candidateBound
                  ? t("messages.interviewQuestions.resultBound")
                  : t("messages.interviewQuestions.resultUnbound")}
              </AlertDescription>
            </Alert>
            <div>
              <Label className="text-xs">{t("labels.interviewQuestions.magicLink")}</Label>
              <div className="flex gap-2 mt-1">
                <Input value={result.inviteUrl} readOnly />
                <Button variant="outline" onClick={handleCopyLink}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>{t("actions.done")}</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="assign-email">{t("labels.interviewQuestions.candidateEmail")}</Label>
              <Input
                id="assign-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("fields.interviewQuestions.candidateEmailPlaceholder")}
              />
              <p className="text-[11px] text-muted-foreground">
                {t("messages.interviewQuestions.candidateEmailHint")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-title">{t("labels.title")}</Label>
              <Input id="assign-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-instructions">{t("labels.interviewQuestions.instructions")}</Label>
              <Textarea
                id="assign-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                placeholder={t("fields.interviewQuestions.instructionsPlaceholder")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("labels.interviewQuestions.magicLinkExpiresIn")}</Label>
                <Select
                  value={String(linkExpiryHours)}
                  onValueChange={(v) => setLinkExpiryHours(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">{t("labels.interviewQuestions.duration24h")}</SelectItem>
                    <SelectItem value="72">{t("labels.interviewQuestions.duration3d")}</SelectItem>
                    <SelectItem value="168">{t("labels.interviewQuestions.duration7d")}</SelectItem>
                    <SelectItem value="336">{t("labels.interviewQuestions.duration14d")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("labels.interviewQuestions.responseWindow")}</Label>
                <Select
                  value={String(responseWindowHours)}
                  onValueChange={(v) => setResponseWindowHours(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">{t("labels.interviewQuestions.duration24h")}</SelectItem>
                    <SelectItem value="72">{t("labels.interviewQuestions.duration3d")}</SelectItem>
                    <SelectItem value="168">{t("labels.interviewQuestions.duration7d")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Target className="h-3 w-3" />
              {t("labels.interviewQuestions.assignSummary", {
                count: questions.length,
                minutes: Math.round(totalSeconds / 60),
              })}
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                {t("actions.cancel")}
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || questions.length === 0}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t("actions.interviewQuestions.sendInvite")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
