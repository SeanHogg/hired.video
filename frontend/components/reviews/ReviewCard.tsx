/**
 * Single-review card. Generic across subject types — the descriptor
 * tells it which metadata fields to render and which sub-axis labels
 * to surface. Knows nothing about companies / voice clones / etc.
 */

import { useState } from "react";
import { formatDateMedium } from "@/lib/format";
import { CardContent } from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, BadgeCheck } from "lucide-react";
import { RatingStars } from "@/components/ui/RatingStars";
import { PromoteButton } from "@/components/promote/PromoteButton";
import type { Review } from "@/lib/services/review-service";
import type { SubjectDescriptor } from "@shared/reviews/subject-descriptors";

interface ReviewCardProps {
  review: Review;
  descriptor: SubjectDescriptor;
  canEdit: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Optional slot rendered under the body — typically the comments thread. */
  footer?: React.ReactNode;
}

export function ReviewCard({
  review,
  descriptor,
  canEdit,
  onEdit,
  onDelete,
  footer,
}: ReviewCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const meta = review.metadata ?? {};

  return (
    <BaseCard hover={false}>
      <CardContent className="pt-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <RatingStars value={review.overallRating} size="md" />
              <span className="text-sm font-medium">{review.overallRating.toFixed(1)}</span>
              {review.isVerified && (
                <Badge
                  variant="secondary"
                  className="text-xs gap-1 bg-emerald-50 text-emerald-700 border-emerald-200"
                >
                  <BadgeCheck className="h-3 w-3" />
                  {review.verificationMethod === "was_buyer"
                    ? "Verified buyer"
                    : "Verified employee"}
                </Badge>
              )}
            </div>
            <h4 className="font-semibold text-base leading-snug">{review.title}</h4>

            {/* Reviewer context — descriptor declares which metadata
                fields make sense for this subject type. */}
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
              {descriptor.metadataFields.map((field) => {
                const value = meta[field.key];
                if (!value) return null;
                if (field.type === "select" && field.options) {
                  const opt = field.options.find((o) => o.value === value);
                  return (
                    <Badge key={field.key} variant="outline" className="capitalize">
                      {opt?.label ?? value}
                    </Badge>
                  );
                }
                return <span key={field.key}>· {value}</span>;
              })}
              <span>· {formatDateMedium(review.createdAt)}</span>
            </div>
          </div>

          {canEdit && (
            <div className="flex items-center gap-2 shrink-0">
              <PromoteButton
                subjectType="review"
                subjectId={review.id}
                subjectLabel="your review"
              />
              <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Edit review">
                <Pencil className="h-4 w-4" />
              </Button>
              <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label="Delete review">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this review?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes your review. You can write a new
                      one later.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        setConfirmingDelete(false);
                        onDelete?.();
                      }}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        {/* Body sections — the descriptor declares which keys to render.
            "body" comes from the top-level `body` column; everything else
            is in metadata. */}
        {descriptor.bodySections.map((section) => {
          const value =
            section.key === "body" ? review.body : (meta[section.key] ?? null);
          if (!value || !value.trim()) return null;
          const labelClass =
            section.key === "pros"
              ? "text-green-700"
              : section.key === "cons"
                ? "text-red-700"
                : section.key === "advice"
                  ? "text-primary"
                  : "text-foreground";
          return (
            <div key={section.key}>
              <p className={`text-sm font-medium mb-1 ${labelClass}`}>
                {section.label}
              </p>
              <p className="text-sm whitespace-pre-line">{value}</p>
            </div>
          );
        })}

        {footer}
      </CardContent>
    </BaseCard>
  );
}
