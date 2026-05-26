// CompetencyLibraryEditor — manages the cross-template competency library
// (#1382). Recruiters / hiring leads define reusable rubric primitives
// here (name + taxonomy + leveled anchors), then ScorecardTemplateEditor
// attributes can point to a competency via CompetencyPicker.
//
// Levels follow replace-all semantics on save — the form holds the full
// leveled set and the API swaps the rows atomically.

import { useEffect, useState } from "react";
import { Plus, Save, Trash2, Archive, Library } from "lucide-react";
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
  type Competency,
  type CompetencyLevelInput,
  type CompetencyTaxonomy,
} from "@/lib/services/scorecards-service";

interface Props {
  companyId: string;
}

const TAXONOMIES: { value: CompetencyTaxonomy; label: string }[] = [
  { value: "technical", label: "Technical" },
  { value: "behavioral", label: "Behavioral" },
  { value: "leadership", label: "Leadership" },
  { value: "execution", label: "Execution" },
  { value: "other", label: "Other" },
];

const TAXONOMY_LABEL: Record<CompetencyTaxonomy, string> = Object.fromEntries(
  TAXONOMIES.map((t) => [t.value, t.label]),
) as Record<CompetencyTaxonomy, string>;

const STARTER_LEVELS: CompetencyLevelInput[] = [
  { level: 1, label: "L1 — Below bar", anchor: "Doesn't meet the role's minimum bar." },
  { level: 2, label: "L2 — Approaching", anchor: "Demonstrates partial mastery." },
  { level: 3, label: "L3 — Meets bar", anchor: "Consistently demonstrates the competency at the level expected." },
  { level: 4, label: "L4 — Exceeds", anchor: "Demonstrates the competency above the level expected for this role." },
];

export function CompetencyLibraryEditor({ companyId }: Props) {
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Competency | null>(null);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setCompetencies(await scorecardsService.listCompetencies(companyId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [companyId]);

  async function openCompetency(id: string) {
    const c = await scorecardsService.getCompetency(id);
    if (c) setEditing(c);
  }

  if (creating) {
    return (
      <CompetencyForm
        companyId={companyId}
        onCancel={() => setCreating(false)}
        onSaved={async () => {
          setCreating(false);
          await refresh();
        }}
      />
    );
  }

  if (editing) {
    return (
      <CompetencyForm
        companyId={companyId}
        existing={editing}
        onCancel={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Library className="h-4 w-4" /> Competency library
          </h3>
          <p className="text-sm text-muted-foreground">
            Reusable rubric primitives that scorecard attributes can reference.
            Cross-template analytics roll up by competency.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> New competency
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : competencies.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No competencies yet. Create one to unlock cross-template rubric reuse.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {competencies.map((c) => (
            <Card
              key={c.id}
              className="cursor-pointer transition hover:border-primary"
              onClick={() => openCompetency(c.id)}
            >
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {c.name}
                  <Badge variant="outline">{TAXONOMY_LABEL[c.taxonomy]}</Badge>
                </CardTitle>
              </CardHeader>
              {c.description && (
                <CardContent className="text-xs text-muted-foreground line-clamp-2">
                  {c.description}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CompetencyForm({
  companyId,
  existing,
  onCancel,
  onSaved,
}: {
  companyId: string;
  existing?: Competency;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [taxonomy, setTaxonomy] = useState<CompetencyTaxonomy>(
    existing?.taxonomy ?? "technical",
  );
  const [levels, setLevels] = useState<CompetencyLevelInput[]>(() => {
    const seed = existing?.levels ?? [];
    return seed.length > 0
      ? seed.map((lv) => ({ level: lv.level, label: lv.label, anchor: lv.anchor }))
      : STARTER_LEVELS;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setLevel(idx: number, patch: Partial<CompetencyLevelInput>) {
    setLevels((arr) => arr.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function submit() {
    setError(null);
    const cleaned = levels
      .filter((l) => l.label.trim().length > 0)
      .map((l, i) => ({ ...l, level: l.level || i + 1 }));
    if (cleaned.length === 0) {
      setError("Add at least one level.");
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        await scorecardsService.updateCompetency(existing.id, {
          name: name.trim(),
          description: description.trim() || null,
          taxonomy,
          levels: cleaned,
        });
      } else {
        await scorecardsService.createCompetency({
          companyId,
          name: name.trim(),
          description: description.trim() || undefined,
          taxonomy,
          levels: cleaned,
        });
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!existing) return;
    await scorecardsService.updateCompetency(existing.id, { isArchived: true });
    onSaved();
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onCancel}>
        ← Back to library
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{existing ? "Edit competency" : "New competency"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              placeholder="e.g. Technical depth"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Taxonomy</Label>
              <Select
                value={taxonomy}
                onValueChange={(v) => setTaxonomy(v as CompetencyTaxonomy)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAXONOMIES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              rows={2}
              placeholder="What this competency measures + when it applies."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Leveled anchors</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setLevels((arr) => [
                    ...arr,
                    {
                      level: arr.length + 1,
                      label: `L${arr.length + 1}`,
                      anchor: "",
                    },
                  ])
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Add level
              </Button>
            </div>
            <div className="space-y-2">
              {levels.map((l, i) => (
                <div key={i} className="rounded border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      className="w-16"
                      value={l.level}
                      onChange={(e) =>
                        setLevel(i, { level: Number(e.target.value) || i + 1 })
                      }
                    />
                    <Input
                      className="flex-1"
                      placeholder="Label (e.g. L3 — Meets bar)"
                      value={l.label}
                      onChange={(e) => setLevel(i, { label: e.target.value })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setLevels((arr) => arr.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    rows={2}
                    placeholder="What an evaluator should see to assign this level."
                    value={l.anchor}
                    onChange={(e) => setLevel(i, { anchor: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-between gap-2">
            {existing ? (
              <Button variant="outline" onClick={archive}>
                <Archive className="mr-2 h-4 w-4" /> Archive
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onCancel} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={saving || !name.trim()}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving…" : existing ? "Save" : "Create"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
