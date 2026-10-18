/**
 * Article authoring use cases behind routes/articles/authoring.ts: create
 * (Articles Creator Program enrollment gate + per-author unique slug), the
 * owner read/patch/delete, and the review lifecycle — submit-for-review
 * with the inline moderation gate (#1512), withdraw, unpublish.
 * SQL lives in repositories/articlesRepository.ts; failures throw DomainError.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { slugify } from "../../../../shared/slugify.js";
import { USER_ROLES } from "../../../../shared/user-roles.js";
import { logger } from "../../lib/logger.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import { buildAIErrorEnvelope } from "../adapters/llm-error.js";
import { NotificationService } from "../notifications/notificationService.js";
import { toFindings, type ClassifierResult, type gateForSeverity } from "./moderation-classifier.js";
import { findActiveEnrollment } from "../../repositories/creatorProfilesRepository.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import {
  articleSlugTaken,
  deleteOwnedArticle,
  findOwnedArticle,
  insertArticle,
  listArticlesOwnedBy,
  unpublishOwnedArticle,
  updateArticleById,
  withdrawOwnedSubmission,
  type ArticlePatch,
  type ArticleRow,
} from "../../repositories/articlesRepository.js";

export interface ArticleFieldsInput {
  title?: string;
  bodyMd?: string;
  bodyJson?: unknown;
  summary?: string;
  coverImageUrl?: string;
  category?: string;
  tags?: string[];
  kind?: string;
  sector?: string;
  audience?: string;
}
export type CreateArticleInput = ArticleFieldsInput & { title: string };
export type UpdateArticleInput = ArticleFieldsInput & { slug?: string };

/** The moderation classifier, injected by the HTTP layer (it needs the request's LLM env). */
export type ArticleClassifier = (art: ArticleRow) => Promise<{
  result: ClassifierResult;
  gate: ReturnType<typeof gateForSeverity>;
}>;

const notFound = () => new DomainError(404, "NOT_FOUND", "Article not found");

/** Estimated read time at 225 wpm, minimum one minute. */
export function readMinutes(bodyMd: string): number {
  const words = bodyMd.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 225));
}

/** True when the user holds an open enrollment with the Articles program on. */
async function isArticlesEnrolled(userId: string): Promise<boolean> {
  const row = await findActiveEnrollment(getDb(), userId);
  return row?.articlesActive === true;
}

/** `slug`, `slug-2` … `slug-50`, then a timestamp suffix — unique per author. */
async function uniqueSlugFor(userId: string, title: string): Promise<string> {
  const db = getDb();
  const baseSlug = slugify(title, { fallback: () => `article-${Date.now()}` });
  let slug = baseSlug;
  let n = 1;
  while (await articleSlugTaken(db, userId, slug)) {
    n += 1;
    slug = `${baseSlug}-${n}`;
    if (n > 50) return `${baseSlug}-${Date.now()}`;
  }
  return slug;
}

export async function createArticle(userId: string, body: CreateArticleInput): Promise<ArticleRow> {
  if (!(await isArticlesEnrolled(userId))) {
    throw new DomainError(
      403,
      "PROGRAM_NOT_ENROLLED",
      "Articles publishing requires enrollment in the Articles Creator Program. Visit /services to enroll.",
    );
  }
  const slug = await uniqueSlugFor(userId, body.title);
  return insertArticle(getDb(), {
    userId,
    slug,
    title: body.title,
    bodyMd: body.bodyMd ?? "",
    bodyJson: body.bodyJson ?? null,
    summary: body.summary ?? null,
    coverImageUrl: body.coverImageUrl ?? null,
    category: body.category ?? null,
    tags: body.tags ?? [],
    sector: body.sector ?? null,
    audience: body.audience ?? null,
    kind: body.kind ?? "article",
    status: "draft",
    readMinutes: readMinutes(body.bodyMd ?? ""),
  });
}

export function listMyArticles(userId: string): Promise<ArticleRow[]> {
  return listArticlesOwnedBy(getDb(), userId);
}

export async function getMyArticle(userId: string, id: string): Promise<ArticleRow> {
  const row = await findOwnedArticle(getDb(), userId, id);
  if (!row) throw notFound();
  return row;
}

export async function updateMyArticle(userId: string, id: string, body: UpdateArticleInput): Promise<ArticleRow> {
  const db = getDb();
  const existing = await findOwnedArticle(db, userId, id);
  if (!existing) throw notFound();
  // Editing is blocked while a submission is in the SA queue — creator must
  // withdraw first. Published articles can still be edited (changes don't go
  // live until a new submit-for-review + SA approval cycle).
  if (existing.status === "submitted") {
    throw new DomainError(409, "LOCKED_FOR_REVIEW", "Withdraw from review before editing.");
  }

  const patch: ArticlePatch = { updatedAt: new Date() };
  if (body.title !== undefined) patch.title = body.title;
  if (body.bodyMd !== undefined) {
    patch.bodyMd = body.bodyMd;
    patch.readMinutes = readMinutes(body.bodyMd);
  }
  if (body.bodyJson !== undefined) patch.bodyJson = body.bodyJson;
  if (body.summary !== undefined) patch.summary = body.summary;
  if (body.coverImageUrl !== undefined) patch.coverImageUrl = body.coverImageUrl;
  if (body.category !== undefined) patch.category = body.category;
  if (body.tags !== undefined) patch.tags = body.tags;
  if (body.slug !== undefined) patch.slug = body.slug;
  if (body.kind !== undefined) patch.kind = body.kind;
  if (body.sector !== undefined) patch.sector = body.sector || null;
  if (body.audience !== undefined) patch.audience = body.audience || null;

  // A rejected article being edited bumps back to draft so the creator
  // re-submits cleanly. Published edits leave status alone (they're a fresh
  // revision of an already-live article until the next submit cycle).
  if (existing.status === "rejected") {
    patch.status = "draft";
    patch.rejectionReason = null;
    patch.rejectedAt = null;
    patch.rejectedBy = null;
  }

  const updated = await updateArticleById(db, existing.id, patch);
  // Title/summary edits surface in unified search for published articles.
  bumpSearchVersion();
  return updated;
}

/** Ping SuperAdmin reviewers that a submission landed (#898). Best-effort. */
function notifyReviewers(article: ArticleRow): void {
  void (async () => {
    const adminIds = await new UsersRepository(getDb()).findIdsByRole(USER_ROLES.SUPER_ADMIN);
    for (const adminId of adminIds) {
      await NotificationService.notify({
        userId: adminId,
        type: "review",
        title: `New ${article.kind} awaiting review`,
        message: article.title,
        url: `/admin/articles`,
        refType: "article",
        refId: article.id,
        push: false,
      });
    }
  })().catch((err) => logger.warn("[articles] reviewer notify failed", err));
}

export async function submitArticleForReview(
  userId: string,
  id: string,
  classify: ArticleClassifier,
): Promise<ArticleRow> {
  if (!(await isArticlesEnrolled(userId))) {
    throw new DomainError(403, "PROGRAM_NOT_ENROLLED", "Re-enable the Articles Creator Program at /services to submit.");
  }
  const db = getDb();
  const existing = await findOwnedArticle(db, userId, id);
  if (!existing) throw notFound();
  if (!existing.title.trim() || !existing.bodyMd.trim()) {
    throw new DomainError(400, "VALIDATION_ERROR", "Title and body are required to submit");
  }
  if (existing.status === "submitted") {
    throw new DomainError(409, "ALREADY_SUBMITTED", "Already in the review queue.");
  }

  // Auto-run the SAME classifier POST /:id/classify uses (#1512), so a
  // submission's quality_score + partner_program_eligible are set the moment
  // it enters review — no separate classify step, no second LLM call.
  let classified: Awaited<ReturnType<ArticleClassifier>>;
  try {
    classified = await classify(existing);
  } catch (e) {
    // #529: an exhausted AI plan surfaces the upgrade banner; genuine
    // classifier faults keep the specific CLASSIFIER_FAILED code.
    const envelope = buildAIErrorEnvelope(e);
    if (envelope) throw new DomainError(envelope.status, envelope.code, envelope.message, envelope.payload);
    throw new DomainError(502, "CLASSIFIER_FAILED", e instanceof Error ? e.message : String(e));
  }
  const { result, gate } = classified;
  const findings = toFindings(result);
  const now = new Date();
  const qualityFields: ArticlePatch = {
    qualityScore: result.qualityScore,
    qualityRationale: result.qualityRationale,
    qualityCheckedAt: now,
    moderationScore: result.qualityScore,
    moderationFindings: findings,
    moderationScannedAt: now,
    moderationScannedBy: userId,
  };

  // block | high (slurs / harassment / illegal) bounce straight back to the
  // author instead of entering the SA queue. Creator can revise and re-submit.
  if (result.findings.severity === "block" || result.findings.severity === "high") {
    return updateArticleById(db, existing.id, {
      ...qualityFields,
      status: "rejected",
      rejectionReason:
        "Automatic rejection: content failed moderation. " +
        (findings.rationale ?? "Please revise and re-submit."),
      rejectedAt: now,
      partnerProgramEligible: false,
      updatedAt: now,
    });
  }

  // low | medium → enters the SA review queue and is marked partner-eligible
  // (gateForSeverity). Earning still requires status='published' downstream.
  const updated = await updateArticleById(db, existing.id, {
    ...qualityFields,
    status: "submitted",
    submittedForReviewAt: now,
    partnerProgramEligible: gate.partnerProgramEligible,
    updatedAt: now,
  });
  notifyReviewers(existing);
  return updated;
}

export async function withdrawMyArticle(userId: string, id: string): Promise<ArticleRow> {
  const updated = await withdrawOwnedSubmission(getDb(), userId, id, new Date());
  if (!updated) throw new DomainError(404, "NOT_FOUND", "Article not found or not in review");
  return updated;
}

export async function unpublishMyArticle(userId: string, id: string): Promise<ArticleRow> {
  const updated = await unpublishOwnedArticle(getDb(), userId, id, new Date());
  if (!updated) throw notFound();
  bumpSearchVersion();
  return updated;
}

export async function deleteMyArticle(userId: string, id: string): Promise<{ deleted: string }> {
  const deleted = await deleteOwnedArticle(getDb(), userId, id);
  if (!deleted) throw notFound();
  bumpSearchVersion();
  return { deleted };
}
