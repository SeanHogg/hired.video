/**
 * useResumeReview — loads a resume-feedback review (by id for the owner, or by
 * share `token` for an invited reviewer) and exposes the annotation + proposal
 * mutations the studio review surface (#1947) needs.
 *
 * The review detail already carries `annotations` + `proposals`, so every
 * mutation just re-fetches the whole detail afterwards — one round-trip,
 * always-consistent state, and it picks up owner-applied `suggestedEdit`
 * changes to the resume content for free (the annotation list endpoint is
 * edge-cached for 120s; the detail read is fresher).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ResumeReviewDetailDTO,
  CreateAnnotationInput,
  AnnotationStatus,
} from "@shared/resume-feedback";
import { resumeFeedbackService } from "@/lib/services/resume-feedback-service";

export interface UseResumeReviewArgs {
  /** Owner path: the review id. */
  reviewId?: string;
  /** Reviewer path: the unguessable share-link token. */
  token?: string;
}

export interface UseResumeReview {
  loading: boolean;
  /** `true` once we've concluded the review can't be loaded (404 / revoked). */
  notFound: boolean;
  detail: ResumeReviewDetailDTO | null;
  isOwner: boolean;
  busy: boolean;
  refresh: () => Promise<void>;
  createAnnotation: (input: CreateAnnotationInput) => Promise<void>;
  setAnnotationStatus: (annotationId: string, status: AnnotationStatus) => Promise<void>;
  editAnnotationBody: (annotationId: string, body: string) => Promise<void>;
  acceptAnnotation: (annotationId: string) => Promise<{ appliedEdit: boolean }>;
  deleteAnnotation: (annotationId: string) => Promise<void>;
  submitReview: (message?: string) => Promise<void>;
  completeReview: () => Promise<void>;
  cancelReview: () => Promise<void>;
  /** Reviewer: submit a full edited copy as a proposed draft (#2220). */
  proposeDraft: (resumeData: unknown, label?: string) => Promise<void>;
  acceptProposal: (versionId: string) => Promise<void>;
  rejectProposal: (versionId: string) => Promise<void>;
}

export function useResumeReview({ reviewId, token }: UseResumeReviewArgs): UseResumeReview {
  const [detail, setDetail] = useState<ResumeReviewDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<void> => {
    if (!reviewId && !token) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    try {
      const d = token
        ? await resumeFeedbackService.getReviewByToken(token)
        : await resumeFeedbackService.getReview(reviewId ?? "");
      if (!mounted.current) return;
      setDetail(d);
      setNotFound(false);
    } catch {
      if (!mounted.current) return;
      setNotFound(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [reviewId, token]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  // Every mutation funnels through here so the busy flag + post-write refresh
  // are uniform and we never leave the surface showing stale feedback.
  const run = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setBusy(true);
      try {
        const result = await fn();
        await load();
        return result;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [load],
  );

  const id = detail?.review.id ?? reviewId ?? "";

  return {
    loading,
    notFound,
    detail,
    isOwner: detail?.role === "owner",
    busy,
    refresh,
    createAnnotation: (input) =>
      run(() => resumeFeedbackService.createAnnotation(id, input, token)).then(() => undefined),
    setAnnotationStatus: (annotationId, status) =>
      run(() => resumeFeedbackService.updateAnnotation(annotationId, { status })).then(() => undefined),
    editAnnotationBody: (annotationId, body) =>
      run(() => resumeFeedbackService.updateAnnotation(annotationId, { body })).then(() => undefined),
    acceptAnnotation: (annotationId) =>
      run(() => resumeFeedbackService.acceptAnnotation(annotationId)).then((r) => ({
        appliedEdit: r.appliedEdit,
      })),
    deleteAnnotation: (annotationId) =>
      run(() => resumeFeedbackService.deleteAnnotation(annotationId)).then(() => undefined),
    submitReview: (message) =>
      run(() => resumeFeedbackService.submitReview(id, { message }, token)).then(() => undefined),
    completeReview: () =>
      run(() => resumeFeedbackService.completeReview(id)).then(() => undefined),
    cancelReview: () =>
      run(() => resumeFeedbackService.cancelReview(id)).then(() => undefined),
    proposeDraft: (resumeData, label) =>
      run(() => resumeFeedbackService.proposeDraft(id, { resumeData, ...(label ? { label } : {}) }, token)).then(() => undefined),
    acceptProposal: (versionId) =>
      run(() => resumeFeedbackService.acceptProposal(versionId)).then(() => undefined),
    rejectProposal: (versionId) =>
      run(() => resumeFeedbackService.rejectProposal(versionId)).then(() => undefined),
  };
}
