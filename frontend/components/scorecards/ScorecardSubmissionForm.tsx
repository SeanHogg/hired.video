// ScorecardSubmissionForm — evaluator fills out their structured scorecard
// for an interview. Pulls the bound template, captures per-attribute
// ratings + overall recommendation + freeform notes, then submits.

import { useEffect, useMemo, useState } from "react";
import { Save, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  scorecardsService,
  type RatingScale,
  type Recommendation,
  type ScorecardSubmission,
  type ScorecardTemplate,
} from "@/lib/services/scorecards-service";
import { BlindReviewBadge } from "./BlindReviewBadge";
import { DueInBadge } from "./DueInBadge";
import { BiasFlagPanel } from "./BiasFlagPanel";

interface Props {
  templateId: string;
  applicationId: string;
  interviewId?: string;
  kitStageId?: string;
  candidateUserId?: string;
  /** Existing submission to edit; if omitted a new draft is created on first save. */
  existingSubmissionId?: string;
  onSubmitted?: (submission: ScorecardSubmission) => void;
}

const RECOMMENDATION_OPTIONS: { value: Recommendation; label: string }[] = [
  { value: "strong_yes", label: "Strong yes" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "strong_no", label: "Strong no" },
];

function ratingValues(scale: RatingScale): number[] {
  switch (scale) {
    case "1-4":
      return [1, 2, 3, 4];
    case "1-5":
      return [1, 2, 3, 4, 5];
    case "thumbs":
    case "yes-no":
      return [0, 1];
  }
}

function ratingLabel(scale: RatingScale, v: number): string {
  if (scale === "thumbs") return v === 1 ? "👍" : "👎";
  if (scale === "yes-no") return v === 1 ? "Yes" : "No";
  return String(v);
}

export function ScorecardSubmissionForm({
  templateId,
  applicationId,
  interviewId,
  kitStageId,
  candidateUserId,
  existingSubmissionId,
  onSubmitted,
}: Props) {
  const [template, setTemplate] = useState<ScorecardTemplate | null>(null);
  const [submission, setSubmission] = useState<ScorecardSubmission | null>(null);
  const [ratings, setRatings] = useState<Record<string, { rating: number | null; notes: string }>>({});
  const [recommendation, setRecommendation] = useState<Recommendation | "">("");
  const [summary, setSummary] = useState("");
  const [strengths, setStrengths] = useState("");
  const [concerns, setConcerns] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tpl = await scorecardsService.getTemplate(templateId);
      if (cancelled) return;
      setTemplate(tpl);
      if (existingSubmissionId) {
        const sub = await scorecardsService.getSubmission(existingSubmissionId);
        if (!cancelled && sub) {
          setSubmission(sub);
          const r: Record<string, { rating: number | null; notes: string }> = {};
          for (const x of sub.ratings ?? []) {
            r[x.attributeId] = { rating: x.rating, notes: x.notes ?? "" };
          }
          setRatings(r);
          setRecommendation(sub.overallRecommendation ?? "");
          setSummary(sub.summary ?? "");
          setStrengths(sub.strengths ?? "");
          setConcerns(sub.concerns ?? "");
        }
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId, existingSubmissionId]);

  const scale = template?.ratingScale ?? "1-4";
  const allowedRatings = useMemo(() => ratingValues(scale), [scale]);

  function setRating(attributeId: string, rating: number | null) {
    setRatings((r) => ({ ...r, [attributeId]: { ...r[attributeId], rating, notes: r[attributeId]?.notes ?? "" } }));
  }
  function setNotes(attributeId: string, notes: string) {
    setRatings((r) => ({ ...r, [attributeId]: { ...r[attributeId], notes, rating: r[attributeId]?.rating ?? null } }));
  }

  function buildPayload() {
    return {
      ratings: Object.entries(ratings).map(([attributeId, v]) => ({
        attributeId,
        rating: v.rating,
        notes: v.notes || undefined,
      })),
      overallRecommendation: (recommendation || undefined) as Recommendation | undefined,
      summary: summary || null,
      strengths: strengths || null,
      concerns: concerns || null,
    };
  }

  async function ensureSubmission(): Promise<ScorecardSubmission> {
    if (submission) return submission;
    const created = await scorecardsService.createSubmission({
      templateId,
      applicationId,
      interviewId,
      kitStageId,
      candidateUserId,
    });
    setSubmission(created);
    return created;
  }

  async function saveDraft() {
    setError(null);
    setSaving(true);
    try {
      const sub = await ensureSubmission();
      const updated = await scorecardsService.updateSubmission(sub.id, buildPayload());
      setSubmission(updated);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function finalSubmit() {
    setError(null);
    if (!recommendation) {
      setError("Pick an overall recommendation before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const sub = await ensureSubmission();
      await scorecardsService.updateSubmission(sub.id, buildPayload());
      const submitted = await scorecardsService.submitSubmission(sub.id);
      setSubmission(submitted);
      onSubmitted?.(submitted);
    } catch (e: any) {
      setError(e?.message ?? "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!template) return <p className="text-sm text-destructive">Template not found.</p>;

  const isSubmitted = submission?.status === "submitted";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{template.name}</CardTitle>
          {template.description && (
            <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <BlindReviewBadge submission={submission} />
          <DueInBadge submission={submission} />
          {isSubmitted && (
            <Badge className="bg-green-600 text-white">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Submitted
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(template.attributes ?? []).map((a) => (
          <div key={a.id} className="rounded border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-medium">{a.name}</Label>
              {a.weight > 1 && (
                <Badge variant="outline">×{a.weight}</Badge>
              )}
            </div>
            {a.description && (
              <p className="text-xs text-muted-foreground">{a.description}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {allowedRatings.map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant={ratings[a.id]?.rating === v ? "default" : "outline"}
                  disabled={isSubmitted}
                  onClick={() => setRating(a.id, v)}
                >
                  {ratingLabel(scale, v)}
                </Button>
              ))}
            </div>
            <Textarea
              placeholder="Notes (optional)"
              rows={2}
              value={ratings[a.id]?.notes ?? ""}
              disabled={isSubmitted}
              onChange={(e) => setNotes(a.id, e.target.value)}
            />
          </div>
        ))}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Strengths</Label>
            <Textarea
              rows={3}
              value={strengths}
              disabled={isSubmitted}
              onChange={(e) => setStrengths(e.target.value)}
            />
          </div>
          <div>
            <Label>Concerns</Label>
            <Textarea
              rows={3}
              value={concerns}
              disabled={isSubmitted}
              onChange={(e) => setConcerns(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label>Summary</Label>
          <Textarea
            rows={2}
            value={summary}
            disabled={isSubmitted}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>

        {!isSubmitted && (
          <BiasFlagPanel
            summary={summary}
            strengths={strengths}
            concerns={concerns}
          />
        )}

        <div>
          <Label>Overall recommendation</Label>
          <Select
            value={recommendation}
            onValueChange={(v) => setRecommendation(v as Recommendation)}
            disabled={isSubmitted}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick a recommendation" />
            </SelectTrigger>
            <SelectContent>
              {RECOMMENDATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!isSubmitted && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={saveDraft} disabled={saving || submitting}>
              <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Save draft"}
            </Button>
            <Button onClick={finalSubmit} disabled={saving || submitting}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {submitting ? "Submitting…" : "Submit scorecard"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
