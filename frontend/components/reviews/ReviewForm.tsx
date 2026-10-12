/**
 * Polymorphic review form. Renders fields off the subject descriptor —
 * sub-rating axes, metadata fields (text/multiline/select), and body
 * sections (pros/cons/advice/body). On submit it calls
 * reviewService.upsert which the backend keys on (subjectType,
 * subjectId, userId).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "@/components/ui/use-toast";
import { RatingStars } from "@/components/ui/RatingStars";
import { reviewService, type Review, type ReviewInput } from "@/lib/services/review-service";
import type { SubjectDescriptor, SubjectType } from "@shared/reviews/subject-descriptors";

interface ReviewFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectType: SubjectType;
  subjectId: string;
  subjectName: string;
  descriptor: SubjectDescriptor;
  existing?: Review | null;
  onSaved: (review: Review) => void;
}

interface FormState {
  overallRating: number;
  title: string;
  body: string;
  subRatings: Record<string, number | null>;
  metadata: Record<string, string>;
}

function emptyState(descriptor: SubjectDescriptor): FormState {
  const subRatings: Record<string, number | null> = {};
  for (const axis of descriptor.subRatings) subRatings[axis.key] = null;
  const metadata: Record<string, string> = {};
  for (const f of descriptor.metadataFields) metadata[f.key] = "";
  for (const s of descriptor.bodySections) if (s.key !== "body") metadata[s.key] = "";
  return { overallRating: 0, title: "", body: "", subRatings, metadata };
}

function fromExisting(descriptor: SubjectDescriptor, r: Review): FormState {
  const state = emptyState(descriptor);
  state.overallRating = r.overallRating;
  state.title = r.title;
  state.body = r.body ?? "";
  for (const axis of descriptor.subRatings) {
    const v = r.subRatings?.[axis.key];
    state.subRatings[axis.key] = typeof v === "number" ? v : null;
  }
  for (const f of descriptor.metadataFields) {
    state.metadata[f.key] = (r.metadata?.[f.key] as string | null) ?? "";
  }
  for (const s of descriptor.bodySections) {
    if (s.key !== "body") {
      state.metadata[s.key] = (r.metadata?.[s.key] as string | null) ?? "";
    }
  }
  return state;
}

export function ReviewForm({
  open,
  onOpenChange,
  subjectType,
  subjectId,
  subjectName,
  descriptor,
  existing,
  onSaved,
}: ReviewFormProps) {
  const [form, setForm] = useState<FormState>(() =>
    existing ? fromExisting(descriptor, existing) : emptyState(descriptor),
  );
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setForm(existing ? fromExisting(descriptor, existing) : emptyState(descriptor));
      setErrors({});
    }
    onOpenChange(next);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.overallRating || form.overallRating < 1) {
      next.overallRating = "Please pick an overall rating.";
    }
    if (!form.title || form.title.trim().length < 5) {
      next.title = "Headline must be at least 5 characters.";
    }
    if (form.title && form.title.length > 200) {
      next.title = "Headline must be 200 characters or fewer.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      // Strip empty strings out of metadata so the server doesn't
      // store "" for optional fields.
      const metadata: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(form.metadata)) {
        const trimmed = v.trim();
        metadata[k] = trimmed.length === 0 ? null : trimmed;
      }
      // Drop nulls out of subRatings — server treats absence as "skipped".
      const subRatings: Record<string, number> = {};
      for (const [k, v] of Object.entries(form.subRatings)) {
        if (typeof v === "number") subRatings[k] = v;
      }
      const hasBodySection = descriptor.bodySections.some((s) => s.key === "body");
      const input: ReviewInput = {
        overallRating: form.overallRating,
        title: form.title.trim(),
        body: hasBodySection ? form.body.trim() || null : null,
        subRatings,
        metadata,
      };
      const saved = existing
        ? await reviewService.update(existing.id, input)
        : await reviewService.upsert(subjectType, subjectId, input);
      toast({
        title: existing ? "Review updated" : "Review posted",
        description: `Your review of ${subjectName} is live.`,
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Couldn't save review",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setSubRating = (key: string, value: number | null) => {
    setForm((prev) => ({ ...prev, subRatings: { ...prev.subRatings, [key]: value } }));
  };

  const setMeta = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, metadata: { ...prev.metadata, [key]: value } }));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit your review" : descriptor.formTitle(subjectName)}
          </DialogTitle>
          <DialogDescription>
            Share an honest, useful review. Your name will be shown alongside it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Overall */}
          <div>
            <Label className="mb-2 block">Overall rating *</Label>
            <RatingStars
              size="lg"
              value={form.overallRating || null}
              onChange={(v) => setField("overallRating", v ?? 0)}
              ariaLabel="Overall rating"
            />
            {errors.overallRating && (
              <p className="mt-1 text-sm text-destructive">{errors.overallRating}</p>
            )}
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="review-title" className="mb-2 block">
              Headline *
            </Label>
            <Input
              id="review-title"
              value={form.title}
              maxLength={200}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="Summarize your experience in one line"
            />
            {errors.title && (
              <p className="mt-1 text-sm text-destructive">{errors.title}</p>
            )}
          </div>

          {/* Sub-ratings */}
          {descriptor.subRatings.length > 0 && (
            <div>
              <Label className="mb-3 block">Rate by category (optional)</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {descriptor.subRatings.map((axis) => (
                  <div key={axis.key} className="flex items-center justify-between gap-3">
                    <span className="text-sm">{axis.label}</span>
                    <RatingStars
                      value={form.subRatings[axis.key] ?? null}
                      onChange={(v) => setSubRating(axis.key, v)}
                      size="sm"
                      ariaLabel={axis.label}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Body sections — render in declaration order. */}
          {descriptor.bodySections.map((section) => {
            const isPlainBody = section.key === "body";
            const value = isPlainBody ? form.body : form.metadata[section.key] ?? "";
            const setValue = (v: string) =>
              isPlainBody ? setField("body", v) : setMeta(section.key, v);
            return (
              <div key={section.key}>
                <Label htmlFor={`review-${section.key}`} className="mb-2 block">
                  {section.label}
                </Label>
                <Textarea
                  id={`review-${section.key}`}
                  value={value}
                  maxLength={section.maxLength ?? 4000}
                  rows={3}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={section.placeholder}
                />
              </div>
            );
          })}

          {/* Metadata fields */}
          {descriptor.metadataFields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {descriptor.metadataFields.map((field) => {
                if (field.type === "select" && field.options) {
                  const current = form.metadata[field.key] || "";
                  return (
                    <div key={field.key}>
                      <Label htmlFor={`review-meta-${field.key}`} className="mb-2 block">
                        {field.label}
                      </Label>
                      <Select
                        value={current || "__unset__"}
                        onValueChange={(v) => setMeta(field.key, v === "__unset__" ? "" : v)}
                      >
                        <SelectTrigger id={`review-meta-${field.key}`}>
                          <SelectValue placeholder="Choose…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unset__">Prefer not to say</SelectItem>
                          {field.options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                if (field.type === "multiline") {
                  return (
                    <div key={field.key} className="sm:col-span-3">
                      <Label htmlFor={`review-meta-${field.key}`} className="mb-2 block">
                        {field.label}
                      </Label>
                      <Textarea
                        id={`review-meta-${field.key}`}
                        value={form.metadata[field.key] ?? ""}
                        maxLength={field.maxLength ?? 4000}
                        rows={2}
                        placeholder={field.placeholder}
                        onChange={(e) => setMeta(field.key, e.target.value)}
                      />
                    </div>
                  );
                }
                return (
                  <div key={field.key}>
                    <Label htmlFor={`review-meta-${field.key}`} className="mb-2 block">
                      {field.label}
                    </Label>
                    <Input
                      id={`review-meta-${field.key}`}
                      value={form.metadata[field.key] ?? ""}
                      maxLength={field.maxLength ?? 200}
                      placeholder={field.placeholder}
                      onChange={(e) => setMeta(field.key, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : existing ? "Update review" : "Post review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
