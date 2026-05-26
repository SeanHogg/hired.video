// InterviewKitEditor — list + edit interview kits (named bundles of stages,
// each stage backed by a scorecard template).

import { useEffect, useState } from "react";
import { Plus, Trash2, Save, Archive, GripVertical, EyeOff } from "lucide-react";
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
  scorecardsService,
  type InterviewKit,
  type ScorecardTemplate,
  type StageInput,
} from "@/lib/services/scorecards-service";
import {
  BLIND_REVIEW_MODES,
  BLIND_REVIEW_MODE_META,
  parseBlindReviewMode,
  type BlindReviewMode,
} from "@/lib/scorecards/blind-review";

// Shared blind-review mode picker — used by both the new-kit form and the
// kit detail editor. Self-renders the help text from the canonical
// BLIND_REVIEW_MODE_META so the two callsites never drift (#1380, DRY).
function BlindReviewModeField({
  value,
  onChange,
  disabled,
}: {
  value: BlindReviewMode;
  onChange: (v: BlindReviewMode) => void;
  disabled?: boolean;
}) {
  const meta = BLIND_REVIEW_MODE_META[value];
  return (
    <div>
      <Label className="flex items-center gap-1.5">
        <EyeOff className="h-3.5 w-3.5" /> Blind-review policy
      </Label>
      <Select
        value={value}
        onValueChange={(v) => onChange(parseBlindReviewMode(v))}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BLIND_REVIEW_MODES.map((m) => (
            <SelectItem key={m} value={m}>
              {BLIND_REVIEW_MODE_META[m].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground mt-1">{meta.description}</p>
    </div>
  );
}

interface Props {
  companyId: string;
  jobId?: string;
}

export function InterviewKitEditor({ companyId, jobId }: Props) {
  const [kits, setKits] = useState<InterviewKit[]>([]);
  const [templates, setTemplates] = useState<ScorecardTemplate[]>([]);
  const [editing, setEditing] = useState<InterviewKit | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const [k, t] = await Promise.all([
        scorecardsService.listKits({ companyId, jobId }),
        scorecardsService.listTemplates(companyId),
      ]);
      setKits(k);
      setTemplates(t);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [companyId, jobId]);

  async function openKit(id: string) {
    const k = await scorecardsService.getKit(id);
    if (k) setEditing(k);
  }

  if (creating) {
    return (
      <NewKitForm
        companyId={companyId}
        jobId={jobId}
        templates={templates}
        onCancel={() => setCreating(false)}
        onCreated={async (k) => {
          setCreating(false);
          await refresh();
          setEditing(k);
        }}
      />
    );
  }

  if (editing) {
    return (
      <KitDetailEditor
        kit={editing}
        templates={templates}
        onClose={() => {
          setEditing(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Interview kits</h3>
          <p className="text-sm text-muted-foreground">
            Stage-by-stage interview plans with attached scorecards.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={templates.length === 0}>
          <Plus className="mr-2 h-4 w-4" /> New kit
        </Button>
      </div>

      {templates.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Create at least one scorecard template before building an interview kit.
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : kits.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No interview kits yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {kits.map((k) => (
            <Card
              key={k.id}
              className="cursor-pointer transition hover:border-primary"
              onClick={() => openKit(k.id)}
            >
              <CardHeader>
                <CardTitle className="text-base">{k.name}</CardTitle>
                {k.jobId && (
                  <Badge variant="outline" className="w-fit">
                    Job-bound
                  </Badge>
                )}
              </CardHeader>
              {k.description && (
                <CardContent className="text-xs text-muted-foreground line-clamp-2">
                  {k.description}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function NewKitForm({
  companyId,
  jobId,
  templates,
  onCancel,
  onCreated,
}: {
  companyId: string;
  jobId?: string;
  templates: ScorecardTemplate[];
  onCancel: () => void;
  onCreated: (k: InterviewKit) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [blindReviewMode, setBlindReviewMode] = useState<BlindReviewMode>("off");
  const [stages, setStages] = useState<StageInput[]>([
    { name: "Recruiter screen", durationMinutes: 30, displayOrder: 0 },
    { name: "Hiring manager", durationMinutes: 45, displayOrder: 1 },
    { name: "Onsite — Technical", durationMinutes: 60, displayOrder: 2 },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      const cleaned = stages
        .filter((s) => s.name.trim().length > 0)
        .map((s, i) => ({ ...s, displayOrder: i }));
      if (cleaned.length === 0) {
        setError("Add at least one stage.");
        return;
      }
      const kit = await scorecardsService.createKit({
        companyId,
        jobId,
        name: name.trim(),
        description: description.trim() || undefined,
        blindReviewMode,
        stages: cleaned,
      });
      onCreated(kit);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create kit");
    } finally {
      setSaving(false);
    }
  }

  function setStage(idx: number, patch: Partial<StageInput>) {
    setStages((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New interview kit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Kit name</Label>
          <Input
            placeholder="e.g. Senior Engineer — Full Loop"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>
        <BlindReviewModeField value={blindReviewMode} onChange={setBlindReviewMode} />
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Stages</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setStages((arr) => [
                  ...arr,
                  { name: "", durationMinutes: 60, displayOrder: arr.length },
                ])
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Add stage
            </Button>
          </div>
          <div className="space-y-2">
            {stages.map((s, i) => (
              <div key={i} className="rounded border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Input
                    className="flex-1"
                    placeholder="Stage name"
                    value={s.name}
                    onChange={(e) => setStage(i, { name: e.target.value })}
                  />
                  <Input
                    type="number"
                    className="w-20"
                    placeholder="Min"
                    value={s.durationMinutes ?? 60}
                    onChange={(e) =>
                      setStage(i, { durationMinutes: Number(e.target.value) || 60 })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setStages((arr) => arr.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <Label className="text-xs">Scorecard template</Label>
                  <Select
                    value={s.scorecardTemplateId ?? ""}
                    onValueChange={(v) => setStage(i, { scorecardTemplateId: v || undefined })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a template" />
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
              </div>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Create kit"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function KitDetailEditor({
  kit,
  templates,
  onClose,
}: {
  kit: InterviewKit;
  templates: ScorecardTemplate[];
  onClose: () => void;
}) {
  const [k, setK] = useState<InterviewKit>(kit);
  const [savingMeta, setSavingMeta] = useState(false);

  async function saveMeta() {
    setSavingMeta(true);
    try {
      const updated = await scorecardsService.updateKit(k.id, {
        name: k.name,
        description: k.description,
        blindReviewMode: k.blindReviewMode,
      });
      setK({ ...updated, stages: k.stages });
    } finally {
      setSavingMeta(false);
    }
  }

  async function archive() {
    await scorecardsService.updateKit(k.id, { isArchived: true });
    onClose();
  }

  async function addStage() {
    const created = await scorecardsService.addStage(k.id, {
      name: "New stage",
      durationMinutes: 60,
      displayOrder: (k.stages?.length ?? 0),
    });
    setK({ ...k, stages: [...(k.stages ?? []), created] });
  }

  async function updateStage(id: string, patch: Partial<StageInput>) {
    const updated = await scorecardsService.updateStage(id, patch);
    setK({
      ...k,
      stages: (k.stages ?? []).map((s) => (s.id === id ? updated : s)),
    });
  }

  async function deleteStage(id: string) {
    await scorecardsService.deleteStage(id);
    setK({ ...k, stages: (k.stages ?? []).filter((s) => s.id !== id) });
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onClose}>
        ← Back to kits
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Edit kit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={k.name} onChange={(e) => setK({ ...k, name: e.target.value })} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={k.description ?? ""}
              onChange={(e) => setK({ ...k, description: e.target.value })}
              rows={2}
            />
          </div>
          <BlindReviewModeField
            value={parseBlindReviewMode(k.blindReviewMode)}
            onChange={(v) => setK({ ...k, blindReviewMode: v })}
          />
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={archive}>
              <Archive className="mr-2 h-4 w-4" /> Archive
            </Button>
            <Button onClick={saveMeta} disabled={savingMeta}>
              <Save className="mr-2 h-4 w-4" /> {savingMeta ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Stages ({k.stages?.length ?? 0})</CardTitle>
          <Button variant="outline" size="sm" onClick={addStage}>
            <Plus className="mr-1 h-4 w-4" /> Add stage
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {(k.stages ?? []).map((s) => (
            <div key={s.id} className="rounded border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={s.name}
                  onBlur={(e) => updateStage(s.id, { name: e.target.value })}
                  onChange={(e) =>
                    setK({
                      ...k,
                      stages: (k.stages ?? []).map((x) =>
                        x.id === s.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Input
                  type="number"
                  className="w-20"
                  value={s.durationMinutes ?? 60}
                  onBlur={(e) =>
                    updateStage(s.id, { durationMinutes: Number(e.target.value) || 60 })
                  }
                  onChange={(e) =>
                    setK({
                      ...k,
                      stages: (k.stages ?? []).map((x) =>
                        x.id === s.id ? { ...x, durationMinutes: Number(e.target.value) || 60 } : x,
                      ),
                    })
                  }
                />
                <Button variant="ghost" size="icon" onClick={() => deleteStage(s.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Select
                value={s.scorecardTemplateId ?? ""}
                onValueChange={(v) =>
                  updateStage(s.id, { scorecardTemplateId: v || undefined })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No scorecard attached" />
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
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
