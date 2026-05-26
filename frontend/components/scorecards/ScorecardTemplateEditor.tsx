// ScorecardTemplateEditor — list + edit scorecard templates and their
// rating attributes. Used inside the Scorecards hub page.

import { useEffect, useState } from "react";
import { Plus, Trash2, GripVertical, Save, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  scorecardsService,
  type AttributeInput,
  type RatingScale,
  type ScorecardTemplate,
} from "@/lib/services/scorecards-service";
import { CompetencyPicker } from "./CompetencyPicker";

interface Props {
  companyId: string;
}

const RATING_SCALES: { value: RatingScale; label: string }[] = [
  { value: "1-4", label: "1–4 (Greenhouse default)" },
  { value: "1-5", label: "1–5" },
  { value: "thumbs", label: "Thumbs up / down" },
  { value: "yes-no", label: "Yes / No" },
];

const STARTER_ATTRIBUTES: AttributeInput[] = [
  { name: "Technical depth", weight: 2, displayOrder: 0 },
  { name: "Problem solving", weight: 2, displayOrder: 1 },
  { name: "Communication", weight: 1, displayOrder: 2 },
  { name: "Culture add", weight: 1, displayOrder: 3 },
];

export function ScorecardTemplateEditor({ companyId }: Props) {
  const [templates, setTemplates] = useState<ScorecardTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ScorecardTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setTemplates(await scorecardsService.listTemplates(companyId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [companyId]);

  async function openTemplate(id: string) {
    const tpl = await scorecardsService.getTemplate(id);
    if (tpl) setEditing(tpl);
  }

  if (creating) {
    return (
      <NewTemplateForm
        companyId={companyId}
        onCancel={() => setCreating(false)}
        onCreated={async (t) => {
          setCreating(false);
          await refresh();
          setEditing(t);
        }}
      />
    );
  }

  if (editing) {
    return (
      <TemplateDetailEditor
        template={editing}
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
          <h3 className="text-lg font-semibold">Scorecard templates</h3>
          <p className="text-sm text-muted-foreground">
            Reusable rubrics evaluators fill out after each interview.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> New template
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No scorecard templates yet. Start with a few rating dimensions you
            already use.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <Card
              key={t.id}
              className="cursor-pointer transition hover:border-primary"
              onClick={() => openTemplate(t.id)}
            >
              <CardHeader>
                <CardTitle className="text-base">{t.name}</CardTitle>
                {t.roleFamily && (
                  <Badge variant="secondary" className="w-fit">
                    {t.roleFamily}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-muted-foreground">
                <div>Scale: {t.ratingScale}</div>
                {t.description && <div className="line-clamp-2">{t.description}</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function NewTemplateForm({
  companyId,
  onCancel,
  onCreated,
}: {
  companyId: string;
  onCancel: () => void;
  onCreated: (t: ScorecardTemplate) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ratingScale, setRatingScale] = useState<RatingScale>("1-4");
  const [roleFamily, setRoleFamily] = useState("");
  const [attributes, setAttributes] = useState<AttributeInput[]>(STARTER_ATTRIBUTES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setAttr(idx: number, patch: Partial<AttributeInput>) {
    setAttributes((arr) => arr.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      const cleaned = attributes
        .filter((a) => a.name.trim().length > 0)
        .map((a, i) => ({ ...a, displayOrder: i }));
      if (cleaned.length === 0) {
        setError("Add at least one rating attribute.");
        return;
      }
      const tpl = await scorecardsService.createTemplate({
        companyId,
        name: name.trim(),
        description: description.trim() || undefined,
        ratingScale,
        roleFamily: roleFamily.trim() || undefined,
        attributes: cleaned,
      });
      onCreated(tpl);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New scorecard template</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Template name</Label>
          <Input
            placeholder="e.g. Senior Software Engineer — Onsite"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Rating scale</Label>
            <Select value={ratingScale} onValueChange={(v) => setRatingScale(v as RatingScale)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATING_SCALES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Role family (optional)</Label>
            <Input
              placeholder="Engineering"
              value={roleFamily}
              onChange={(e) => setRoleFamily(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Description (optional)</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Rating attributes</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setAttributes((arr) => [
                  ...arr,
                  { name: "", weight: 1, displayOrder: arr.length },
                ])
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Add attribute
            </Button>
          </div>
          <div className="space-y-2">
            {attributes.map((a, i) => (
              <div key={i} className="rounded border p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Input
                    className="flex-1"
                    placeholder="Attribute name (e.g. Communication)"
                    value={a.name}
                    onChange={(e) => setAttr(i, { name: e.target.value })}
                  />
                  <div className="flex items-center gap-1">
                    <Label className="text-xs text-muted-foreground">Weight</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      className="w-16"
                      value={a.weight ?? 1}
                      onChange={(e) =>
                        setAttr(i, { weight: Number(e.target.value) || 1 })
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAttributes((arr) => arr.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <CompetencyPicker
                  companyId={companyId}
                  value={a.competencyId}
                  onChange={(competencyId) => setAttr(i, { competencyId })}
                  compact
                />
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
            {saving ? "Saving…" : "Create template"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateDetailEditor({
  template,
  onClose,
}: {
  template: ScorecardTemplate;
  onClose: () => void;
}) {
  const companyId = template.companyId;
  const [tpl, setTpl] = useState<ScorecardTemplate>(template);
  const [savingMeta, setSavingMeta] = useState(false);

  async function saveMeta() {
    setSavingMeta(true);
    try {
      const updated = await scorecardsService.updateTemplate(tpl.id, {
        name: tpl.name,
        description: tpl.description,
        ratingScale: tpl.ratingScale,
        roleFamily: tpl.roleFamily,
      });
      setTpl({ ...updated, attributes: tpl.attributes });
    } finally {
      setSavingMeta(false);
    }
  }

  async function archive() {
    await scorecardsService.updateTemplate(tpl.id, { isArchived: true });
    onClose();
  }

  async function addAttribute() {
    const created = await scorecardsService.addAttribute(tpl.id, {
      name: "New attribute",
      weight: 1,
      displayOrder: (tpl.attributes?.length ?? 0),
    });
    setTpl({ ...tpl, attributes: [...(tpl.attributes ?? []), created] });
  }

  async function updateAttr(id: string, patch: Partial<AttributeInput>) {
    const updated = await scorecardsService.updateAttribute(id, patch);
    setTpl({
      ...tpl,
      attributes: (tpl.attributes ?? []).map((a) => (a.id === id ? updated : a)),
    });
  }

  async function deleteAttr(id: string) {
    await scorecardsService.deleteAttribute(id);
    setTpl({ ...tpl, attributes: (tpl.attributes ?? []).filter((a) => a.id !== id) });
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onClose}>
        ← Back to templates
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Edit template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Rating scale</Label>
              <Select
                value={tpl.ratingScale}
                onValueChange={(v) => setTpl({ ...tpl, ratingScale: v as RatingScale })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATING_SCALES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Role family</Label>
              <Input
                value={tpl.roleFamily ?? ""}
                onChange={(e) => setTpl({ ...tpl, roleFamily: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={tpl.description ?? ""}
              onChange={(e) => setTpl({ ...tpl, description: e.target.value })}
              rows={2}
            />
          </div>
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
          <CardTitle>Attributes ({tpl.attributes?.length ?? 0})</CardTitle>
          <Button variant="outline" size="sm" onClick={addAttribute}>
            <Plus className="mr-1 h-4 w-4" /> Add attribute
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {(tpl.attributes ?? []).map((a) => (
            <div key={a.id} className="rounded border p-2 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={a.name}
                  onBlur={(e) => updateAttr(a.id, { name: e.target.value })}
                  onChange={(e) =>
                    setTpl({
                      ...tpl,
                      attributes: (tpl.attributes ?? []).map((x) =>
                        x.id === a.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-muted-foreground">Weight</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    className="w-16"
                    value={a.weight}
                    onBlur={(e) =>
                      updateAttr(a.id, { weight: Number(e.target.value) || 1 })
                    }
                    onChange={(e) =>
                      setTpl({
                        ...tpl,
                        attributes: (tpl.attributes ?? []).map((x) =>
                          x.id === a.id
                            ? { ...x, weight: Number(e.target.value) || 1 }
                            : x,
                        ),
                      })
                    }
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteAttr(a.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <CompetencyPicker
                companyId={companyId}
                value={a.competencyId}
                onChange={(competencyId) => updateAttr(a.id, { competencyId })}
                compact
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
