/**
 * Article version history use cases (#170 / #155) behind
 * routes/articles/versions.ts: list, snapshot (manual or autosave with the
 * retention window + cap), restore. Rows live in `entity_versions`
 * (subject_type 'article', W3-E migration 0640); the payload holds
 * { title, bodyMd, bodyJson } and is mapped back onto the historical
 * article_versions response shape. Failures throw DomainError.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import { EntityVersionRepository, type EntityVersionListItem, type EntityVersionRow } from "../../repositories/entityVersionRepository.js";
import {
  findArticleContent,
  findArticleOwnerId,
  updateArticleById,
  type ArticleRow,
} from "../../repositories/articlesRepository.js";
import type { ArticleVersionPayload } from "../../../../shared/entity-version-subjects.js";

const SUBJECT = "article" as const;
const ARTICLE_AUTOSAVE_CAP = 50;
const ARTICLE_AUTOSAVE_RETENTION_DAYS = 30;

const articleNotFound = () => new DomainError(404, "NOT_FOUND", "Article not found");
const notYourArticle = () => new DomainError(403, "FORBIDDEN", "Not your article");

/** Type guard — the API compiles with `strict: false`, so narrow the jsonb payload by hand. */
function isArticlePayload(value: unknown): value is ArticleVersionPayload {
  return typeof value === "object" && value !== null && typeof (value as { title?: unknown }).title === "string";
}

/** An `entity_versions` article row in the old article_versions response shape. */
function toArticleVersion(row: EntityVersionRow) {
  const payload: ArticleVersionPayload = isArticlePayload(row.payload)
    ? row.payload
    : { title: "", bodyMd: null, bodyJson: null };
  return {
    id: row.id,
    articleId: row.subjectId,
    userId: row.userId,
    versionNumber: row.versionNumber,
    label: row.label,
    title: payload.title,
    bodyMd: payload.bodyMd ?? null,
    bodyJson: payload.bodyJson ?? null,
    isAutosave: row.isAutosave,
    createdAt: row.createdAt,
  };
}

export type ArticleVersion = ReturnType<typeof toArticleVersion>;

async function assertOwner(userId: string, articleId: string): Promise<void> {
  const ownerId = await findArticleOwnerId(getDb(), articleId);
  if (!ownerId) throw articleNotFound();
  if (ownerId !== userId) throw notYourArticle();
}

export async function listArticleVersions(userId: string, articleId: string): Promise<EntityVersionListItem[]> {
  await assertOwner(userId, articleId);
  return new EntityVersionRepository(getDb()).list(SUBJECT, articleId, { limit: 200 });
}

/** Snapshot the article's current content; autosaves prune beyond the cap/retention window. */
export async function snapshotArticleVersion(
  userId: string,
  articleId: string,
  input: { label?: string; isAutosave?: boolean },
): Promise<ArticleVersion> {
  const db = getDb();
  const parent = await findArticleContent(db, articleId);
  if (!parent) throw articleNotFound();
  if (parent.userId !== userId) throw notYourArticle();

  const repo = new EntityVersionRepository(db);
  const payload: ArticleVersionPayload = {
    title: parent.title,
    bodyMd: parent.bodyMd ?? null,
    bodyJson: parent.bodyJson ?? null,
  };
  const created = await repo.insertNext({
    subjectType: SUBJECT,
    subjectId: articleId,
    userId,
    label: input.label ?? null,
    payload,
    isAutosave: input.isAutosave ?? false,
  });

  if (created.isAutosave) {
    // Retention window + cap (drop oldest beyond the cap) in one statement.
    await repo.pruneAutosaves(SUBJECT, articleId, {
      cap: ARTICLE_AUTOSAVE_CAP,
      retentionDays: ARTICLE_AUTOSAVE_RETENTION_DAYS,
    });
  }
  return toArticleVersion(created);
}

/** Copy a version's content back onto the article. */
export async function restoreArticleVersion(
  userId: string,
  articleId: string,
  versionId: string,
): Promise<{ restoredVersion: ArticleVersion; article: ArticleRow }> {
  await assertOwner(userId, articleId);
  const db = getDb();
  const row = await new EntityVersionRepository(db).find(SUBJECT, articleId, versionId);
  if (!row) throw new DomainError(404, "NOT_FOUND", "Version not found");
  const version = toArticleVersion(row);
  const article = await updateArticleById(db, articleId, {
    title: version.title,
    bodyMd: version.bodyMd ?? "",
    bodyJson: version.bodyJson as ArticleRow["bodyJson"],
    updatedAt: new Date(),
  });
  bumpSearchVersion();
  return { restoredVersion: version, article };
}
