/**
 * Article reader-engagement use cases (view beacon, read progress, claps,
 * shares, owner engagement summary) and the author-triggered AI classify
 * (#175). Routes read input and call these; failures are DomainErrors.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  ArticleEngagementRepository,
  type ArticleRow,
  type IArticleEngagementRepository,
} from "../../repositories/articleEngagementRepository.js";
import { findClapTotal, upsertClapTotal } from "../../repositories/articleClapsRepository.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import { toFindings, type ClassifierResult, type gateForSeverity } from "./moderation-classifier.js";

const CLAP_CAP = 50;
const ROLLUP_LIMIT = 60;

const notFound = () => new DomainError(404, "NOT_FOUND", "Article not found");
const today = () => new Date().toISOString().slice(0, 10);

async function requirePublished(repo: ArticleEngagementRepository, articleId: string): Promise<void> {
  const art = await repo.findStatus(articleId);
  if (!art || art.status !== "published") throw notFound();
}

/** View-count beacon (#858) — bumps the denormalised `articles.view_count`
 *  in ONE statement; the published check lives in its WHERE (404 otherwise). */
export async function recordArticleView(
  articleId: string,
  repo: Pick<IArticleEngagementRepository, "incrementPublishedViewCount"> = new ArticleEngagementRepository(getDb()),
): Promise<void> {
  if (!(await repo.incrementPublishedViewCount(articleId))) throw notFound();
}

/** Read-progress beacon. Only an authenticated AND email-verified reader's
 *  seconds accrue to the partner-pool column (#1757). Returns `counted`. */
export async function recordArticleReadProgress(
  articleId: string,
  userId: string | null | undefined,
  seconds: number,
): Promise<boolean> {
  const db = getDb();
  const repo = new ArticleEngagementRepository(db);
  await requirePublished(repo, articleId);
  let verified = false;
  if (userId) {
    const u = await new UsersRepository(db).findVerificationStatus(userId);
    verified = !!u?.emailVerified;
  }
  await repo.addReadSeconds(articleId, today(), seconds, verified);
  return verified;
}

/** Add claps, capped at 50 per (user, article). */
export async function clapArticle(
  articleId: string,
  userId: string,
  delta: number,
): Promise<{ total: number; addedThisCall: number }> {
  const db = getDb();
  const repo = new ArticleEngagementRepository(db);
  await requirePublished(repo, articleId);
  const current = await findClapTotal(db, articleId, userId);
  const newTotal = Math.min(CLAP_CAP, current + delta);
  const actualDelta = newTotal - current;
  if (actualDelta <= 0) return { total: current, addedThisCall: 0 };
  await upsertClapTotal(db, articleId, userId, newTotal);
  await repo.addClaps(articleId, today(), actualDelta);
  return { total: newTotal, addedThisCall: actualDelta };
}

export async function recordArticleShare(
  input: { articleId: string; userId: string | null | undefined; channel: string; userAgent: string | null },
): Promise<void> {
  const repo = new ArticleEngagementRepository(getDb());
  await repo.insertShare(input);
  await repo.addShare(input.articleId, today());
}

async function requireOwned(repo: ArticleEngagementRepository, articleId: string, userId: string): Promise<void> {
  const parent = await repo.findOwnerId(articleId);
  if (!parent) throw notFound();
  if (parent.userId !== userId) throw new DomainError(403, "FORBIDDEN", "Not your article");
}

/** The owner's last 60 daily engagement rollups. */
export async function getArticleEngagement(articleId: string, userId: string) {
  const db = getDb();
  const repo = new ArticleEngagementRepository(db);
  await requireOwned(repo, articleId, userId);
  return repo.listRollups(articleId, ROLLUP_LIMIT);
}

type ClassifierRun = (art: ArticleRow) => Promise<{
  result: ClassifierResult;
  gate: ReturnType<typeof gateForSeverity>;
}>;

/** Load the author's article (404/403), for the classify use case. */
export async function loadOwnArticle(articleId: string, userId: string): Promise<ArticleRow> {
  const db = getDb();
  const art = await new ArticleEngagementRepository(db).findById(articleId);
  if (!art) throw notFound();
  if (art.userId !== userId) throw new DomainError(403, "FORBIDDEN", "Not your article");
  return art;
}

/** Run the classifier on the article and persist quality + moderation fields;
 *  the gate may flip status (→ published), so the search version is bumped. */
export async function classifyOwnArticle(art: ArticleRow, userId: string, run: ClassifierRun) {
  const db = getDb();
  const { result, gate } = await run(art);
  const now = new Date();
  const update: Record<string, unknown> = {
    qualityScore: result.qualityScore,
    qualityRationale: result.qualityRationale,
    qualityCheckedAt: now,
    moderationScore: result.qualityScore,
    moderationFindings: toFindings(result),
    moderationScannedAt: now,
    moderationScannedBy: userId,
    partnerProgramEligible: gate.partnerProgramEligible,
    updatedAt: now,
  };
  if (gate.status) update.status = gate.status;
  const updated = await new ArticleEngagementRepository(db).updateArticle(art.id, update);
  bumpSearchVersion();
  return { article: updated, findings: result };
}
