/**
 * Generic reviews + ratings section. Mountable on any subject's
 * detail page:
 *
 *   <ReviewsSection
 *     subjectType="company"
 *     subjectId={company.id}
 *     subjectName={company.name}
 *     isOwner={isOwner}
 *   />
 *
 * Owns:
 *   - aggregate header (overall + axis averages + 1..5 distribution)
 *   - paginated list of published reviews
 *   - "Write/Edit" CTA, branched on auth + pro + descriptor
 *   - threaded comments under each review
 *
 * Form shape, eligibility, and verification badges are all driven by
 * the descriptor in shared/reviews/subject-descriptors.ts. To support
 * a new subject type, add a descriptor — no new components needed.
 */

import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";

import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/hooks/useSubscription";
import {
  reviewService,
  type Review,
  type ReviewAggregate,
} from "@/lib/services/review-service";
import {
  getSubjectDescriptor,
  type SubjectType,
} from "@shared/reviews/subject-descriptors";

import { RatingStars } from "@/components/ui/RatingStars";
import { ReviewCard } from "./ReviewCard";
import { ReviewForm } from "./ReviewForm";
import { ReviewComments } from "./ReviewComments";

interface ReviewsSectionProps {
  subjectType: SubjectType;
  subjectId: string;
  subjectName: string;
  /** True when the current user owns the subject (e.g. company owner). */
  isOwner: boolean;
}

export function ReviewsSection({
  subjectType,
  subjectId,
  subjectName,
  isOwner,
}: ReviewsSectionProps) {
  const descriptor = getSubjectDescriptor(subjectType);
  const { user, isAuthenticated } = useAuth();
  const { isPro } = useSubscription();

  const [reviewsList, setReviewsList] = useState<Review[]>([]);
  const [aggregate, setAggregate] = useState<ReviewAggregate | null>(null);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const loadPublic = Promise.all([
      reviewService.list(subjectType, subjectId, 1, 10),
      reviewService.aggregate(subjectType, subjectId),
    ]);
    const loadMine = isAuthenticated
      ? reviewService.mine(subjectType, subjectId).catch(() => null)
      : Promise.resolve<Review | null>(null);

    Promise.all([loadPublic, loadMine])
      .then(([[list, agg], mine]) => {
        if (cancelled) return;
        setReviewsList(list.items);
        setAggregate(agg);
        setMyReview(mine);
      })
      .catch((err) => {
        console.error("[ReviewsSection] load failed:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [subjectType, subjectId, isAuthenticated]);

  const handleSaved = (saved: Review) => {
    setMyReview(saved);
    setReviewsList((prev) => {
      const without = prev.filter((r) => r.id !== saved.id);
      return [saved, ...without];
    });
    reviewService.aggregate(subjectType, subjectId).then(setAggregate).catch(() => {});
  };

  const handleDelete = async (review: Review) => {
    try {
      await reviewService.delete(review.id);
      setReviewsList((prev) => prev.filter((r) => r.id !== review.id));
      if (myReview?.id === review.id) setMyReview(null);
      reviewService.aggregate(subjectType, subjectId).then(setAggregate).catch(() => {});
      toast({ title: "Review deleted" });
    } catch (err: any) {
      toast({
        title: "Couldn't delete",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  const hasReviews = (aggregate?.total ?? 0) > 0;

  // Branched CTA — auth → pro → owner-blocked → buyer-only-aware
  // (the buyer check is enforced server-side; the frontend just shows
  // the button optimistically since checking `was the user a buyer?`
  // would require a separate fetch per render).
  const cta = useMemo(() => {
    if (descriptor.eligibility === "owner_blocked" && isOwner) return null;

    if (!isAuthenticated) {
      return (
        <Button asChild variant="outline">
          <Link to="/login">Sign in to write a review</Link>
        </Button>
      );
    }
    if (descriptor.requiresProToWrite && !isPro) {
      return (
        <Button asChild>
          <Link to="/settings/billing">Upgrade to Pro to write a review</Link>
        </Button>
      );
    }
    return (
      <Button onClick={() => setFormOpen(true)}>
        {myReview ? "Edit your review" : descriptor.writeCta}
      </Button>
    );
  }, [descriptor, isOwner, isAuthenticated, isPro, myReview]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {descriptor.sectionTitle}
            {aggregate && aggregate.total > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({aggregate.total})
              </span>
            )}
          </CardTitle>
          {cta}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {!loading && !hasReviews && (
          <div className="py-8 text-center">
            <Star className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {descriptor.emptyState(subjectName)}
            </p>
          </div>
        )}

        {!loading && hasReviews && aggregate && (
          <>
            {/* Aggregate header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-2">
              <div className="text-center md:text-left">
                <div className="text-4xl font-bold">
                  {aggregate.averages.overall?.toFixed(1) ?? "—"}
                </div>
                <RatingStars
                  size="md"
                  value={aggregate.averages.overall ?? null}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Based on {aggregate.total} review{aggregate.total === 1 ? "" : "s"}
                </p>
              </div>

              <div className="space-y-1">
                {[5, 4, 3, 2, 1].map((bucket) => {
                  const count = (aggregate.distribution as Record<number, number>)[bucket] ?? 0;
                  const pct =
                    aggregate.total > 0 ? Math.round((count / aggregate.total) * 100) : 0;
                  return (
                    <div key={bucket} className="flex items-center gap-2 text-xs">
                      <span className="w-3 text-right">{bucket}</span>
                      <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                      <div className="flex-1 h-2 rounded bg-gray-200 overflow-hidden">
                        <div className="h-full bg-yellow-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-10 text-muted-foreground text-right">{count}</span>
                    </div>
                  );
                })}
              </div>

              {/* Sub-axis averages — descriptor-driven. */}
              <div className="space-y-2">
                {descriptor.subRatings.map((axis) => {
                  const value =
                    (aggregate.averages as Record<string, number | null>)[axis.key] ?? null;
                  if (value === null) return null;
                  return (
                    <div key={axis.key} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">{axis.label}</span>
                      <div className="flex items-center gap-2">
                        <RatingStars value={value} size="sm" />
                        <span className="text-xs w-7 text-right">{value.toFixed(1)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reviews list */}
            <div className="space-y-3">
              {reviewsList.map((r) => (
                <ReviewCard
                  key={r.id}
                  review={r}
                  descriptor={descriptor}
                  canEdit={!!user && r.userId === user.id}
                  onEdit={() => setFormOpen(true)}
                  onDelete={() => handleDelete(r)}
                  footer={<ReviewComments reviewId={r.id} />}
                />
              ))}
            </div>
          </>
        )}
      </CardContent>

      {/* Form modal — only mounted when the user qualifies, so we
          never render it for ineligible callers. */}
      {isAuthenticated &&
        !(descriptor.eligibility === "owner_blocked" && isOwner) &&
        (!descriptor.requiresProToWrite || isPro) && (
          <ReviewForm
            open={formOpen}
            onOpenChange={setFormOpen}
            subjectType={subjectType}
            subjectId={subjectId}
            subjectName={subjectName}
            descriptor={descriptor}
            existing={myReview}
            onSaved={handleSaved}
          />
        )}
    </Card>
  );
}
