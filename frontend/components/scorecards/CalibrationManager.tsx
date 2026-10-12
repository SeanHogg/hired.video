// CalibrationManager — list / create / run calibration sessions (#1381).
//
// Three views, single self-managing component:
//   • List of sessions + "New session" CTA.
//   • New-session form (pick template + candidates by paste-in
//     applicationId list — full candidate-picker is layered on later
//     since the people-search surface is shared infra).
//   • Session detail: per-candidate calibration form + close-session
//     CTA + deltas table once closed.

import { useEffect, useState } from "react";
import { Plus, Lock, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calibrationService,
  type CalibrationSession,
  type CalibrationSessionView,
} from "@/lib/services/calibration-service";
import {
  scorecardsService,
  type ScorecardTemplate,
} from "@/lib/services/scorecards-service";

interface Props {
  companyId: string;
}

const STATUS_TONE: Record<CalibrationSession["status"], string> = {
  open: "bg-green-500 text-white",
  closed: "bg-amber-500 text-white",
  archived: "bg-muted text-muted-foreground",
};

export function CalibrationManager({ companyId }: Props) {
  const [sessions, setSessions] = useState<CalibrationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setSessions(await calibrationService.listSessions());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  if (openSessionId) {
    return (
      <CalibrationSessionDetail
        sessionId={openSessionId}
        onClose={() => {
          setOpenSessionId(null);
          refresh();
        }}
      />
    );
  }

  if (creating) {
    return (
      <NewSessionForm
        companyId={companyId}
        onCancel={() => setCreating(false)}
        onCreated={async (s) => {
          setCreating(false);
          await refresh();
          setOpenSessionId(s.id);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Calibration sessions</h3>
          <p className="text-sm text-muted-foreground">
            Score past candidates blind in a group, then reveal deltas vs.
            the real hiring decision. Use quarterly to align the bar.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> New session
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No calibration sessions yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sessions.map((s) => (
            <Card
              key={s.id}
              className="cursor-pointer transition hover:border-primary"
              onClick={() => setOpenSessionId(s.id)}
            >
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{s.name}</span>
                  <Badge className={STATUS_TONE[s.status]}>{s.status}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {s.candidateApplicationIds.length} candidates ·{" "}
                {new Date(s.createdAt).toLocaleDateString()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function NewSessionForm({
  companyId,
  onCancel,
  onCreated,
}: {
  companyId: string;
  onCancel: () => void;
  onCreated: (s: CalibrationSession) => void;
}) {
  const [templates, setTemplates] = useState<ScorecardTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [applicationIdsText, setApplicationIdsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setTemplates(await scorecardsService.listTemplates(companyId));
    })();
  }, [companyId]);

  async function submit() {
    setErr(null);
    const candidateApplicationIds = applicationIdsText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (candidateApplicationIds.length === 0) {
      setErr("Paste at least one application id.");
      return;
    }
    if (!templateId) {
      setErr("Pick a template.");
      return;
    }
    setSaving(true);
    try {
      const session = await calibrationService.createSession({
        companyId,
        templateId,
        name: name.trim(),
        description: description.trim() || undefined,
        candidateApplicationIds,
      });
      onCreated(session);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create session");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New calibration session</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Name</Label>
          <Input
            placeholder="e.g. Q2 calibration — Senior Engineering"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label>Template</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick the rubric to calibrate against" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Candidate application ids</Label>
          <Textarea
            rows={3}
            placeholder="Paste application ids, one per line"
            value={applicationIdsText}
            onChange={(e) => setApplicationIdsText(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            These are the candidates the cohort will re-score blind.
          </p>
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Create session"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CalibrationSessionDetail({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const [view, setView] = useState<CalibrationSessionView | null>(null);
  const [template, setTemplate] = useState<ScorecardTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [submittingApp, setSubmittingApp] = useState<string | null>(null);
  const [ratingsByApp, setRatingsByApp] = useState<
    Record<string, Record<string, number | null>>
  >({});
  const [notesByApp, setNotesByApp] = useState<Record<string, string>>({});

  async function refresh() {
    setLoading(true);
    try {
      const v = await calibrationService.getSession(sessionId);
      if (v) {
        setView(v);
        const tpl = await scorecardsService.getTemplate(v.session.templateId);
        setTemplate(tpl);
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [sessionId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading session…</p>;
  if (!view || !template) return null;

  const isClosed = view.session.status !== "open";
  const ratingScale = template.ratingScale;
  const ratingValues =
    ratingScale === "1-5"
      ? [1, 2, 3, 4, 5]
      : ratingScale === "thumbs" || ratingScale === "yes-no"
        ? [0, 1]
        : [1, 2, 3, 4];

  async function submit(applicationId: string) {
    setSubmittingApp(applicationId);
    try {
      await calibrationService.submitCalibration(sessionId, {
        applicationId,
        ratings: ratingsByApp[applicationId] ?? {},
        notes: notesByApp[applicationId] || undefined,
      });
      await refresh();
    } finally {
      setSubmittingApp(null);
    }
  }

  async function closeSession() {
    setClosing(true);
    try {
      await calibrationService.closeSession(sessionId);
      await refresh();
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onClose}>
        ← Back to sessions
      </Button>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{view.session.name}</CardTitle>
            {view.session.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {view.session.description}
              </p>
            )}
          </div>
          <Badge className={STATUS_TONE[view.session.status]}>
            {view.session.status}
          </Badge>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Template: {template.name} · {view.submissions.length} calibration scorecards
            submitted · {view.session.candidateApplicationIds.length} candidates
          </p>
          {!isClosed && (
            <Button
              variant="outline"
              className="mt-3"
              onClick={closeSession}
              disabled={closing}
            >
              <Lock className="mr-2 h-4 w-4" />
              {closing ? "Closing…" : "Close session + reveal deltas"}
            </Button>
          )}
        </CardContent>
      </Card>

      {view.session.candidateApplicationIds.map((appId) => {
        const ratings = ratingsByApp[appId] ?? {};
        const deltas = view.deltas?.[appId];
        return (
          <Card key={appId}>
            <CardHeader>
              <CardTitle className="text-base">
                Candidate <code className="text-xs">{appId}</code>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!isClosed &&
                (template.attributes ?? []).map((a) => (
                  <div key={a.id} className="space-y-1">
                    <Label className="text-sm">{a.name}</Label>
                    <div className="flex flex-wrap gap-2">
                      {ratingValues.map((v) => (
                        <Button
                          key={v}
                          size="sm"
                          variant={ratings[a.id] === v ? "default" : "outline"}
                          onClick={() =>
                            setRatingsByApp((prev) => ({
                              ...prev,
                              [appId]: { ...(prev[appId] ?? {}), [a.id]: v },
                            }))
                          }
                        >
                          {ratingScale === "thumbs"
                            ? v === 1
                              ? "👍"
                              : "👎"
                            : ratingScale === "yes-no"
                              ? v === 1
                                ? "Yes"
                                : "No"
                              : v}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              {!isClosed && (
                <>
                  <Textarea
                    placeholder="Notes (optional)"
                    rows={2}
                    value={notesByApp[appId] ?? ""}
                    onChange={(e) =>
                      setNotesByApp((prev) => ({ ...prev, [appId]: e.target.value }))
                    }
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={() => submit(appId)}
                      disabled={submittingApp === appId}
                    >
                      {submittingApp === appId
                        ? "Submitting…"
                        : "Submit calibration"}
                    </Button>
                  </div>
                </>
              )}

              {isClosed && deltas && (
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <BarChart3 className="h-3 w-3" /> Attribute deltas
                  </Label>
                  <div className="space-y-1 mt-1 text-sm">
                    {deltas.map((d) => {
                      const attr = (template.attributes ?? []).find(
                        (a) => a.id === d.attributeId,
                      );
                      const tone =
                        d.delta === null
                          ? "text-muted-foreground"
                          : Math.abs(d.delta) >= 0.7
                            ? "text-red-700"
                            : Math.abs(d.delta) >= 0.3
                              ? "text-amber-700"
                              : "text-green-700";
                      return (
                        <div
                          key={d.attributeId}
                          className="flex items-center justify-between"
                        >
                          <span>{attr?.name ?? d.attributeId}</span>
                          <span className={tone}>
                            cal {d.calibrationMean ?? "—"} vs real{" "}
                            {d.realMean ?? "—"} (Δ {d.delta ?? "—"})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
