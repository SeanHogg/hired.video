/**
 * useMyReviews — the feedback engagements surfaced in the Communication Hub's
 * "Reviews" tab. Merges two streams into one list the owner/reviewer acts on:
 *   • reviews I OWN          — feedback I asked for on my resumes
 *   • reviews ASSIGNED to me — resumes someone asked ME to review
 *
 * Each entry carries an `actionable` flag (the tab/badge highlights work that
 * needs me): a reviewer owes feedback while a review is pending/active; an
 * owner has feedback waiting once a reviewer has submitted. Fetched lazily —
 * the hook only mounts inside the open hub overlay, so there's no app-wide
 * poll (new feedback already pings the bell via the `review_submitted`
 * notification).
 */
import { useMemo } from "react";
import { useGatedResource } from "@/hooks/use-gated-resource";
import { resumeFeedbackService } from "@/lib/services/resume-feedback-service";
import type { ResumeReviewDTO, ReviewRole } from "@shared/resume-feedback";

export interface ReviewInboxEntry {
  id: string;
  resumeId: string;
  role: ReviewRole;
  title: string | null;
  status: ResumeReviewDTO["status"];
  /** The other party's label — the reviewer (owner view) or "Review request". */
  counterparty: string | null;
  openCount: number;
  totalCount: number;
  updatedAt: string;
  actionable: boolean;
}

interface ReviewsPayload {
  owned: ResumeReviewDTO[];
  assigned: ResumeReviewDTO[];
}

const EMPTY: ReviewsPayload = { owned: [], assigned: [] };

function toEntry(r: ResumeReviewDTO, role: ReviewRole): ReviewInboxEntry {
  const actionable =
    role === "reviewer"
      ? r.status === "pending" || r.status === "active"
      : r.status === "submitted" || (r.openAnnotationCount ?? 0) > 0;
  return {
    id: r.id,
    resumeId: r.resumeId,
    role,
    title: r.title,
    status: r.status,
    counterparty: role === "owner" ? r.reviewerName || r.reviewerEmail : null,
    openCount: r.openAnnotationCount ?? 0,
    totalCount: r.totalAnnotationCount ?? 0,
    updatedAt: r.updatedAt,
    actionable,
  };
}

export interface UseMyReviewsResult {
  entries: ReviewInboxEntry[];
  actionableCount: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useMyReviews(): UseMyReviewsResult {
  const { data, isLoading, refresh } = useGatedResource<ReviewsPayload>({
    cacheKey: "my-reviews",
    defaults: EMPTY,
    fetcher: async () => {
      const [owned, assigned] = await Promise.all([
        resumeFeedbackService.listOwnerReviews(),
        resumeFeedbackService.listAssigned(),
      ]);
      return { owned, assigned };
    },
  });

  const entries = useMemo(() => {
    const merged = [
      ...data.owned.map((r) => toEntry(r, "owner")),
      ...data.assigned.map((r) => toEntry(r, "reviewer")),
    ];
    merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return merged;
  }, [data]);

  const actionableCount = useMemo(
    () => entries.filter((e) => e.actionable).length,
    [entries],
  );

  return { entries, actionableCount, isLoading, refresh };
}
