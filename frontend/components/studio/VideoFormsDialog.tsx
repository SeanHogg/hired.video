"use client";

/**
 * VideoFormsDialog — gap #140 frontend.
 *
 * Lets the project owner create / edit / delete in-video lead capture forms.
 * Each form is pinned to a playback timestamp and supports configurable
 * fields (email/text/tel/select). Submissions are listed inline.
 */

import { useEffect, useState } from "react";
import { Loader2, FormInput, Plus, Trash2, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  listVideoForms,
  createVideoForm,
  deleteVideoForm,
  getVideoFormSubmissions,
  type VideoForm,
  type VideoFormType,
  type VideoFormField,
  type VideoFormAnswerKey,
} from "@/lib/services/studio-features-service";

interface Props {
  projectId: string | null;
}

// #1505 — minimal MCQ defaults for a knowledge-check form. Authors edit
// the question text + per-option strings inline once the form is in
// knowledge_check mode; the answer-key editor is per-field.
const DEFAULT_KC_FIELDS: VideoFormField[] = [
  {
    key: "q1",
    label: "Sample question",
    type: "select",
    required: true,
    options: ["Option A", "Option B", "Option C"],
  },
];

export default function VideoFormsDialog({ projectId }: Props) {
  const [open, setOpen] = useState(false);
  const [forms, setForms] = useState<VideoForm[]>([]);
  const [loading, setLoading] = useState(false);

  // New-form draft
  const [draftType, setDraftType] = useState<VideoFormType>("lead_capture");
  const [draftTitle, setDraftTitle] = useState("Get a free demo");
  const [draftPosition, setDraftPosition] = useState(5);
  const [draftRequireEmail, setDraftRequireEmail] = useState(true);
  const [draftRequireName, setDraftRequireName] = useState(true);
  const [draftGate, setDraftGate] = useState(true);
  const [draftRedirect, setDraftRedirect] = useState("");
  const [creating, setCreating] = useState(false);
  // #1505 — knowledge-check draft state. Fields + answer key edited
  // together; passing score / attempts / lesson id are optional.
  const [kcFields, setKcFields] = useState<VideoFormField[]>(DEFAULT_KC_FIELDS);
  const [kcAnswerKey, setKcAnswerKey] = useState<VideoFormAnswerKey>({
    q1: { correctAnswer: "Option A", points: 1 },
  });
  const [kcPassingScore, setKcPassingScore] = useState(80);
  const [kcMaxAttempts, setKcMaxAttempts] = useState(3);
  const [kcCourseLessonId, setKcCourseLessonId] = useState("");

  // Submission viewer
  const [openSubmissionsFor, setOpenSubmissionsFor] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Awaited<ReturnType<typeof getVideoFormSubmissions>> | null>(null);

  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    listVideoForms(projectId).then(setForms).catch(() => setForms([])).finally(() => setLoading(false));
  }, [open, projectId]);

  async function handleCreate() {
    if (!projectId) return;
    setCreating(true);
    try {
      const isKC = draftType === "knowledge_check";
      const fields = isKC
        ? kcFields
        : [
            ...(draftRequireName ? [{ key: "name", label: "Your name", type: "text" as const, required: true }] : []),
            ...(draftRequireEmail ? [{ key: "email", label: "Email", type: "email" as const, required: true }] : []),
          ];
      const created = await createVideoForm(projectId, {
        title: draftTitle,
        description: null,
        positionSeconds: draftPosition,
        fields,
        requireToContinue: isKC ? true : draftGate,
        redirectUrl: isKC ? null : (draftRedirect || null),
        submitButtonText: isKC ? "Submit" : "Continue",
        formType: draftType,
        answerKey: isKC ? kcAnswerKey : null,
        passingScorePct: isKC ? kcPassingScore : null,
        maxAttempts: isKC ? kcMaxAttempts : null,
        courseLessonId: isKC && kcCourseLessonId ? kcCourseLessonId : null,
      });
      setForms((f) => [...f, created]);
      setDraftTitle(isKC ? "Knowledge check" : "Get a free demo");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteVideoForm(id);
    setForms((f) => f.filter((x) => x.id !== id));
    if (openSubmissionsFor === id) setOpenSubmissionsFor(null);
  }

  async function handleViewSubmissions(id: string) {
    if (openSubmissionsFor === id) {
      setOpenSubmissionsFor(null);
      setSubmissions(null);
      return;
    }
    setOpenSubmissionsFor(id);
    setSubmissions(null);
    const data = await getVideoFormSubmissions(id);
    setSubmissions(data);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!projectId} title="In-video lead forms">
          <FormInput className="w-3.5 h-3.5 mr-1" /> Forms
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>In-video Lead Forms</DialogTitle>
          <DialogDescription>
            Capture leads at any timestamp. Submissions sync into your global lead inbox.
          </DialogDescription>
        </DialogHeader>

        {/* Existing forms */}
        <div>
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Active forms</Label>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : forms.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No forms yet — create one below.</p>
          ) : (
            <ul className="flex flex-col gap-1 mt-1">
              {forms.map((f) => (
                <li key={f.id} className="border rounded-md px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{f.title}</div>
                      <div className="text-[10px] text-muted-foreground">
                        @ {f.positionSeconds.toFixed(1)}s · {f.fields.length} fields · {f.requireToContinue ? "gated" : "skippable"}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleViewSubmissions(f.id)} title="Submissions">
                      <Inbox className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDelete(f.id)} title="Delete">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  {openSubmissionsFor === f.id && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      {submissions === null ? (
                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                      ) : submissions.total === 0 ? (
                        <p className="text-[10px] text-muted-foreground">No submissions yet.</p>
                      ) : (
                        <ul className="text-[10px] space-y-1 max-h-[120px] overflow-y-auto">
                          {submissions.submissions.map((s) => (
                            <li key={s.id} className="font-mono">
                              {s.viewerEmail ?? "(anon)"} · {new Date(s.createdAt).toLocaleString()}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* New form */}
        <div className="border-t pt-3">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">New form</Label>
          {/* #1505 — Form-type picker. Switches the panel between
              lead-capture (existing surface) and knowledge-check (new). */}
          <div className="mt-1 flex items-center gap-1 rounded-md border p-0.5 text-xs">
            <button
              type="button"
              className={`flex-1 rounded px-2 py-1 ${draftType === "lead_capture" ? "bg-muted font-medium" : "text-muted-foreground"}`}
              onClick={() => setDraftType("lead_capture")}
            >
              Lead capture
            </button>
            <button
              type="button"
              className={`flex-1 rounded px-2 py-1 ${draftType === "knowledge_check" ? "bg-muted font-medium" : "text-muted-foreground"}`}
              onClick={() => setDraftType("knowledge_check")}
            >
              Knowledge check
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <Input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Form title"
              className="h-8 text-xs col-span-2"
            />
            <Input
              type="number"
              min={0}
              step={0.5}
              value={draftPosition}
              onChange={(e) => setDraftPosition(parseFloat(e.target.value) || 0)}
              placeholder="Position (s)"
              className="h-8 text-xs"
            />
          </div>

          {draftType === "lead_capture" ? (
            <>
              <div className="flex items-center gap-3 mt-2 text-xs">
                <label className="flex items-center gap-1.5">
                  <Switch checked={draftRequireName} onCheckedChange={setDraftRequireName} /> Name
                </label>
                <label className="flex items-center gap-1.5">
                  <Switch checked={draftRequireEmail} onCheckedChange={setDraftRequireEmail} /> Email
                </label>
                <label className="flex items-center gap-1.5">
                  <Switch checked={draftGate} onCheckedChange={setDraftGate} /> Gate playback
                </label>
              </div>
              <Input
                value={draftRedirect}
                onChange={(e) => setDraftRedirect(e.target.value)}
                placeholder="Redirect URL (optional)"
                className="h-8 text-xs mt-2"
              />
            </>
          ) : (
            <KnowledgeCheckEditor
              fields={kcFields}
              answerKey={kcAnswerKey}
              passingScorePct={kcPassingScore}
              maxAttempts={kcMaxAttempts}
              courseLessonId={kcCourseLessonId}
              onFieldsChange={setKcFields}
              onAnswerKeyChange={setKcAnswerKey}
              onPassingScoreChange={setKcPassingScore}
              onMaxAttemptsChange={setKcMaxAttempts}
              onCourseLessonIdChange={setKcCourseLessonId}
            />
          )}

          <Button size="sm" className="h-7 text-xs mt-2 w-full" onClick={handleCreate} disabled={creating || !draftTitle}>
            {creating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
            Create form
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * #1505 — Inline editor for a knowledge_check form. Per-question text +
 * multiple-choice options + correct-answer picker, plus the form-level
 * passing-score / attempts / course-lesson-id inputs. State is lifted to
 * the parent so the "Create form" submit can read it without ref dances.
 *
 * Kept in the same file as VideoFormsDialog because it has exactly one
 * caller and the lifted props would be the entire seam if we extracted —
 * not worth a second file for a 60-line subcomponent.
 */
function KnowledgeCheckEditor({
  fields,
  answerKey,
  passingScorePct,
  maxAttempts,
  courseLessonId,
  onFieldsChange,
  onAnswerKeyChange,
  onPassingScoreChange,
  onMaxAttemptsChange,
  onCourseLessonIdChange,
}: {
  fields: VideoFormField[];
  answerKey: VideoFormAnswerKey;
  passingScorePct: number;
  maxAttempts: number;
  courseLessonId: string;
  onFieldsChange: (next: VideoFormField[]) => void;
  onAnswerKeyChange: (next: VideoFormAnswerKey) => void;
  onPassingScoreChange: (next: number) => void;
  onMaxAttemptsChange: (next: number) => void;
  onCourseLessonIdChange: (next: string) => void;
}) {
  const addQuestion = () => {
    const nextKey = `q${fields.length + 1}`;
    const newField: VideoFormField = {
      key: nextKey,
      label: "New question",
      type: "select",
      required: true,
      options: ["Option A", "Option B"],
    };
    onFieldsChange([...fields, newField]);
    onAnswerKeyChange({ ...answerKey, [nextKey]: { correctAnswer: "Option A", points: 1 } });
  };

  const updateField = (idx: number, patch: Partial<VideoFormField>) => {
    onFieldsChange(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  const removeField = (idx: number) => {
    const removed = fields[idx];
    onFieldsChange(fields.filter((_, i) => i !== idx));
    if (removed) {
      const { [removed.key]: _drop, ...rest } = answerKey;
      onAnswerKeyChange(rest);
    }
  };

  return (
    <div className="mt-2 space-y-3">
      <div className="space-y-2">
        {fields.map((field, idx) => (
          <div key={field.key} className="rounded-md border p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Input
                value={field.label}
                onChange={(e) => updateField(idx, { label: e.target.value })}
                placeholder="Question text"
                className="h-7 text-xs flex-1"
              />
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeField(idx)} title="Remove">
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
            <div className="space-y-1">
              {(field.options ?? []).map((opt, optIdx) => (
                <div key={optIdx} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`kc-correct-${field.key}`}
                    checked={answerKey[field.key]?.correctAnswer === opt}
                    onChange={() => onAnswerKeyChange({
                      ...answerKey,
                      [field.key]: {
                        correctAnswer: opt,
                        points: answerKey[field.key]?.points ?? 1,
                        rationale: answerKey[field.key]?.rationale,
                      },
                    })}
                    className="h-3 w-3"
                  />
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const nextOptions = [...(field.options ?? [])];
                      const oldText = nextOptions[optIdx];
                      nextOptions[optIdx] = e.target.value;
                      updateField(idx, { options: nextOptions });
                      // If this option was the correct answer, keep the
                      // answer-key text in lockstep with the edited label.
                      if (answerKey[field.key]?.correctAnswer === oldText) {
                        onAnswerKeyChange({
                          ...answerKey,
                          [field.key]: { ...answerKey[field.key]!, correctAnswer: e.target.value },
                        });
                      }
                    }}
                    placeholder="Answer option"
                    className="h-7 text-xs flex-1"
                  />
                </div>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] w-full"
                onClick={() => updateField(idx, { options: [...(field.options ?? []), `Option ${(field.options?.length ?? 0) + 1}`] })}
              >
                <Plus className="w-3 h-3 mr-1" /> Add option
              </Button>
            </div>
          </div>
        ))}
        <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={addQuestion}>
          <Plus className="w-3 h-3 mr-1" /> Add question
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Pass %</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={passingScorePct}
            onChange={(e) => onPassingScoreChange(parseInt(e.target.value, 10) || 0)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Max attempts</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={maxAttempts}
            onChange={(e) => onMaxAttemptsChange(parseInt(e.target.value, 10) || 1)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Lesson ID</Label>
          <Input
            value={courseLessonId}
            onChange={(e) => onCourseLessonIdChange(e.target.value)}
            placeholder="optional"
            className="h-8 text-xs"
          />
        </div>
      </div>
    </div>
  );
}
