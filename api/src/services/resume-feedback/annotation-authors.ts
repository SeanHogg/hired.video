/**
 * Display names for annotation authors, plus the annotation-list cache key
 * every annotation write invalidates (the list is served read-through from the
 * edge cache).
 */
import type {
  IResumeReviewUserDirectory,
  ResumeReviewAnnotationRow,
  ResumeReviewRow,
} from "../../repositories/resumeFeedbackRepository.js";

export const ANNOTATION_CACHE_TTL = 120;
export const annotationCacheKey = (reviewId: string) => `resume-feedback:annotations:${reviewId}`;

/** A reviewer's display label — the captured name, else their email. */
function reviewerLabel(review: ResumeReviewRow): string | null {
  return review.reviewerName ?? review.reviewerEmail ?? null;
}

/** Map each annotation id → its author's display name. Batched (no N+1):
 *  one lookup for all distinct platform authors; a null-author row (an
 *  external guest with no account) falls back to the review's reviewer
 *  name/email so the owner still sees who left it. */
export async function authorNamesByAnnotation(
  repo: IResumeReviewUserDirectory,
  review: ResumeReviewRow,
  rows: ResumeReviewAnnotationRow[],
): Promise<Map<string, string | null>> {
  const ids = [...new Set(rows.map((r) => r.authorId).filter((x): x is string => !!x))];
  const contacts = ids.length ? await repo.findUserContacts(ids) : [];
  const nameById = new Map(contacts.map((c) => [c.id, c.name ?? c.email ?? null]));
  const fallback = reviewerLabel(review);
  const out = new Map<string, string | null>();
  for (const r of rows) {
    out.set(r.id, r.authorId ? (nameById.get(r.authorId) ?? null) : fallback);
  }
  return out;
}

/** Single-author resolve for mutation responses. */
export async function nameForAuthor(
  repo: IResumeReviewUserDirectory,
  authorId: string | null,
  review: ResumeReviewRow,
): Promise<string | null> {
  if (!authorId) return reviewerLabel(review);
  const [c] = await repo.findUserContacts([authorId]);
  return c?.name ?? c?.email ?? null;
}
