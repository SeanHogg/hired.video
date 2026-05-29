// /tools/interview-templates
//
// Recruiter/employer library of reusable interview question sets. Each
// row in the library is an `interview_question_sets` aggregate that the
// recruiter built (in this tool) or imported from a generated set in the
// Interview Questions tool. From here a set can be:
//   - Edited (title, target role, retake/prep/proctoring defaults,
//     individual questions reordered or removed)
//   - Archived
//   - Attached to a job — opens the Jobs page to pick where (the
//     attachment itself is owned by the JobScreeningCard)
//
// Personal vs company-owned: company-owned sets show a Building icon and
// are visible to every active member of that company. The API enforces the
// xor, so the only authoring decision here is "save to personal or to a
// company" — the create dialog surfaces a Select if the user has any
// company memberships.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Building2,
  ClipboardCheck,
  Eye,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { ToolShell } from "@/components/tools/ToolShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { USER_ROLES } from "@shared/user-roles";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useInterviewQuestionGenerator } from "@/hooks/use-interview-question-generator";
import {
  archiveQuestionSet,
  createQuestionSet,
  listQuestionSets,
  updateQuestionSet,
  type InterviewQuestionSet,
} from "@/lib/services/interview-question-sets-service";
import {
  QUESTION_COUNT_OPTIONS,
  type GeneratedQuestion,
} from "@/lib/services/interview-assignments-service";
import { toast } from "sonner";

interface TemplateDraft {
  title: string;
  description: string;
  targetRole: string;
  style: "mixed" | "behavioral" | "technical";
  prepTimeSec: number;
  maxRetakes: number;
  proctoringOn: boolean;
  questions: GeneratedQuestion[];
}

export default function InterviewTemplates() {
  const { isAuthenticated, user } = useAuth();
  const isRecruiterOrEmployer =
    user?.role === USER_ROLES.RECRUITER ||
    user?.role === USER_ROLES.EMPLOYER ||
    user?.role === USER_ROLES.ADMIN ||
    user?.role === USER_ROLES.SUPER_ADMIN;

  const qc = useQueryClient();
  const { data: sets = [], isLoading } = useQuery({
    queryKey: ["interview-question-sets"],
    queryFn: () => listQuestionSets(),
    enabled: isAuthenticated && isRecruiterOrEmployer,
  });

  const [editing, setEditing] = useState<InterviewQuestionSet | null>(null);
  const [creating, setCreating] = useState(false);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const [authMessage, setAuthMessage] = useState(
    "Sign in as a recruiter or employer to save this template.",
  );

  // Preserve an in-progress draft across the anonymous → authenticated
  // round-trip so users return to the same editor with everything they
  // typed still in place.
  const { restored, snapshot, clear } = usePendingToolInput<TemplateDraft>();
  const [restoredDraft, setRestoredDraft] = useState<TemplateDraft | null>(null);

  useEffect(() => {
    if (!restored) return;
    if (!isAuthenticated || !isRecruiterOrEmployer) return;
    setRestoredDraft(restored);
    setCreating(true);
  }, [restored, isAuthenticated, isRecruiterOrEmployer]);

  const archiveMut = useMutation({
    mutationFn: (id: string) => archiveQuestionSet(id),
    onSuccess: () => {
      toast.success("Set archived");
      void qc.invalidateQueries({ queryKey: ["interview-question-sets"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not archive"),
  });

  const handleUnauthSave = (draft: TemplateDraft) => {
    snapshot(draft);
    setAuthMessage(
      !isAuthenticated
        ? "Sign in to save this template — we'll keep everything you've entered."
        : "Switch to a recruiter or employer account to save interview templates.",
    );
    setShowAuthOverlay(true);
  };

  return (
    <ToolShell
      toolId="interview-templates"
      header={{
        icon: <ClipboardCheck className="h-6 w-6 text-brand-purple" />,
        iconBgClassName: "bg-purple-100",
        title: "Interview Templates",
        description:
          "Build reusable interview question sets once, attach them to any job posting, and send the same screening to every applicant automatically.",
        tier: "free",
      }}
      authOverlay={{
        show: showAuthOverlay,
        message: authMessage,
      }}
    >
      <div className="space-y-4 mt-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-muted-foreground">
            {sets.length === 0
              ? "No templates yet — build one from scratch or import questions from the Interview Questions tool."
              : `${sets.length} template${sets.length === 1 ? "" : "s"} ready to attach to a job.`}
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/tools/interview-questions">Generate from skills</Link>
            </Button>
            <Button onClick={() => setCreating(true)} className="gap-1">
              <Plus className="h-4 w-4" />
              New template
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sets.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <ClipboardCheck className="h-10 w-10 text-muted-foreground/50 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Your library is empty.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sets.map((s) => (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1">{s.title}</span>
                    {s.ownerCompanyId && (
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" aria-label="Company-owned" />
                    )}
                  </CardTitle>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {s.targetRole && (
                      <Badge variant="secondary" className="text-[10px]">{s.targetRole}</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">{s.style}</Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {Array.isArray(s.questions) ? s.questions.length : 0} questions
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {s.useCount} use{s.useCount === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {s.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => setEditing(s)} className="gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      Open
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => archiveMut.mutate(s.id)}
                      disabled={archiveMut.isPending}
                      className="gap-1 text-muted-foreground"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Alert>
          <AlertDescription className="text-xs">
            Attach a template to a job from the{" "}
            <Link to="/jobs" className="underline">Jobs page</Link> → Edit → Video screening, or send
            ad-hoc invites from <Link to="/tools/interview-questions" className="underline">Interview Questions</Link>.
          </AlertDescription>
        </Alert>
      </div>

      {(editing || creating) && (
        <TemplateEditorDialog
          open={true}
          initial={editing}
          initialDraft={editing ? null : restoredDraft}
          canSave={isAuthenticated && isRecruiterOrEmployer}
          onUnauthSave={handleUnauthSave}
          onClose={() => {
            setEditing(null);
            setCreating(false);
            setRestoredDraft(null);
          }}
          onSaved={() => {
            clear();
            setRestoredDraft(null);
            void qc.invalidateQueries({ queryKey: ["interview-question-sets"] });
          }}
        />
      )}
    </ToolShell>
  );
}

// ─── Editor dialog ─────────────────────────────────────────────────────────

interface EditorProps {
  open: boolean;
  initial: InterviewQuestionSet | null;
  /** Snapshot restored from local storage after a login round-trip. Only
   *  consulted when creating a new template (no `initial`). */
  initialDraft?: TemplateDraft | null;
  /** When false, `handleSave` skips the API call and routes to
   *  `onUnauthSave` so the parent can snapshot + show the auth overlay. */
  canSave: boolean;
  onUnauthSave: (draft: TemplateDraft) => void;
  onClose: () => void;
  onSaved: () => void;
}

function TemplateEditorDialog({
  open,
  initial,
  initialDraft,
  canSave,
  onUnauthSave,
  onClose,
  onSaved,
}: EditorProps) {
  const seed = initial ?? initialDraft ?? null;
  const [title, setTitle] = useState(seed?.title ?? "");
  const [description, setDescription] = useState(seed?.description ?? "");
  const [targetRole, setTargetRole] = useState(seed?.targetRole ?? "");
  const [style, setStyle] = useState<"mixed" | "behavioral" | "technical">(
    (seed?.style as "mixed" | "behavioral" | "technical") ?? "mixed",
  );
  const [prepTimeSec, setPrepTimeSec] = useState(seed?.prepTimeSec ?? 10);
  const [maxRetakes, setMaxRetakes] = useState(seed?.maxRetakes ?? 1);
  const [proctoringOn, setProctoringOn] = useState(seed?.proctoringOn ?? true);
  const [questions, setQuestions] = useState<GeneratedQuestion[]>(seed?.questions ?? []);
  const [draft, setDraft] = useState<{ text: string; maxDurationSec: number }>({
    text: "",
    maxDurationSec: 120,
  });
  const [saving, setSaving] = useState(false);
  const [genCount, setGenCount] = useState(5);
  const { generating, error: genError, setError: setGenError, generate } =
    useInterviewQuestionGenerator();

  const totalMinutes = useMemo(
    () => Math.ceil(questions.reduce((sum, q) => sum + (q.maxDurationSec ?? 120), 0) / 60),
    [questions],
  );

  function addQuestion() {
    if (!draft.text.trim() || draft.text.trim().length < 8) {
      toast.error("Question must be at least 8 characters");
      return;
    }
    setQuestions((qs) => [
      ...qs,
      {
        id: `q${qs.length + 1}-${Date.now()}`,
        text: draft.text.trim(),
        category: "behavioral",
        maxDurationSec: draft.maxDurationSec,
        required: true,
        skillLinks: [],
      },
    ]);
    setDraft({ text: "", maxDurationSec: 120 });
  }

  function removeQuestion(id: string) {
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  }

  function currentDraft(): TemplateDraft {
    return {
      title: title.trim(),
      description: description.trim(),
      targetRole: targetRole.trim(),
      style,
      questions,
      prepTimeSec,
      maxRetakes,
      proctoringOn,
    };
  }

  async function generateQuestions() {
    // Generation needs auth (any role); reuse the save bounce so an anon /
    // wrong-role user snapshots the draft and returns here after signing in.
    if (!canSave) {
      onUnauthSave(currentDraft());
      return;
    }
    if (!targetRole.trim()) {
      const msg = "Enter a target role first — AI questions are generated from it.";
      setGenError(msg);
      toast.error(msg);
      return;
    }
    const res = await generate({
      targetRole: targetRole.trim(),
      style,
      count: genCount,
      sourceContext: "tool",
    });
    if (!res) return;
    if (res.questions.length === 0) {
      setGenError("Couldn't generate questions for that role. Try a more specific title.");
      return;
    }
    // Re-id on append so a second generate pass can't collide with ids
    // already in the list, and skip questions whose text we already hold.
    const seen = new Set(questions.map((q) => q.text.trim().toLowerCase()));
    const fresh = res.questions
      .filter((q) => !seen.has(q.text.trim().toLowerCase()))
      .map((q, i) => ({ ...q, id: `gen-${Date.now()}-${i}` }));
    if (fresh.length === 0) {
      toast.info("Those questions are already in the list");
      return;
    }
    setQuestions((qs) => [...qs, ...fresh]);
    toast.success(`Added ${fresh.length} AI-generated question${fresh.length === 1 ? "" : "s"}`);
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Give the template a title");
      return;
    }
    if (questions.length === 0) {
      toast.error("Add at least one question");
      return;
    }
    const draftPayload = currentDraft();
    if (!canSave) {
      onUnauthSave(draftPayload);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...draftPayload,
        description: draftPayload.description || undefined,
        targetRole: draftPayload.targetRole || undefined,
      };
      if (initial) {
        await updateQuestionSet(initial.id, payload);
        toast.success("Template updated");
      } else {
        await createQuestionSet(payload);
        toast.success("Template saved");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit template" : "New interview template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Backend Screening" />
            </div>
            <div className="space-y-1.5">
              <Label>Target role</Label>
              <Input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description / instructions</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Shown to candidates when they open the interview"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Style</Label>
              <Select value={style} onValueChange={(v) => setStyle(v as typeof style)}>
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
              <Label>Prep time (s)</Label>
              <Input
                type="number"
                min={0}
                max={120}
                value={prepTimeSec}
                onChange={(e) => setPrepTimeSec(Math.max(0, Math.min(120, Number(e.target.value))))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max retakes</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={maxRetakes}
                onChange={(e) => setMaxRetakes(Math.max(0, Math.min(10, Number(e.target.value))))}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={proctoringOn} onCheckedChange={setProctoringOn} id="proctoring" />
            <Label htmlFor="proctoring" className="cursor-pointer text-sm">
              Proctor (tab-blur + paste + copy tracking on each answer)
            </Label>
          </div>

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label className="text-base">Questions ({questions.length})</Label>
              <span className="text-xs text-muted-foreground">~{totalMinutes} min total</span>
            </div>
            <div className="space-y-2">
              {questions.map((q, i) => (
                <div key={q.id} className="rounded-md border p-2 flex items-start gap-2">
                  <span className="text-xs text-muted-foreground pt-1">Q{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{q.text}</p>
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{q.category}</Badge>
                      <Badge variant="outline" className="text-[10px]">{q.maxDurationSec}s</Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => removeQuestion(q.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="rounded-md border border-brand-purple/30 bg-purple-50/50 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-purple" />
                <Label className="text-xs font-medium">Generate with AI</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Builds skill-tailored questions from the target role
                {targetRole.trim() ? (
                  <> (<span className="font-medium text-foreground">{targetRole.trim()}</span>)</>
                ) : null}{" "}
                and style above — each is added below so you can edit or remove it.
              </p>
              <div className="flex items-center gap-2">
                <Select value={String(genCount)} onValueChange={(v) => setGenCount(Number(v))}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUESTION_COUNT_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} questions
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={generateQuestions}
                  disabled={generating}
                  className="ml-auto gap-1"
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Generate
                </Button>
              </div>
              {genError && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription className="text-xs">{genError}</AlertDescription>
                </Alert>
              )}
            </div>
            <div className="rounded-md border-dashed border p-3 space-y-2">
              <Label className="text-xs">Add a question manually</Label>
              <Textarea
                value={draft.text}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                rows={2}
                placeholder="e.g. Tell me about a time you had to debug a production outage"
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={30}
                  max={300}
                  step={15}
                  value={draft.maxDurationSec}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, maxDurationSec: Math.max(30, Math.min(300, Number(e.target.value))) }))
                  }
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">seconds max</span>
                <Button size="sm" onClick={addQuestion} className="ml-auto gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {initial ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
