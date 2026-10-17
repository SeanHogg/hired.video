/**
 * AdminArticleReviewService — the SuperAdmin article review queue: listing,
 * bulk moderation re-scan, bulk approve (publish + feed post + author points
 * + notification) and bulk reject. Every action is audit-logged.
 */
import { publicArticlePath } from "../../../../shared/public-paths.js";
import type { JwtPayload } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import {
  AdminArticlesRepository,
  type ArticleModerationUpdate,
} from "../../repositories/adminArticlesRepository.js";
import { scanContent } from "../moderation/contentScan.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import { NotificationService } from "../notifications/notificationService.js";

type QueueStatus = "submitted" | "rejected" | "published";
type ArticleKind = "article" | "faq" | "guide";

function kindEmoji(kind: string): string {
  if (kind === "faq") return "❓";
  if (kind === "guide") return "📘";
  return "📝";
}

export class AdminArticleReviewService {
  constructor(
    private readonly repo: AdminArticlesRepository,
    private readonly db: ReturnType<typeof getDb>,
  ) {}

  static create(): AdminArticleReviewService {
    const db = getDb();
    return new AdminArticleReviewService(new AdminArticlesRepository(db), db);
  }

  async queue(status: QueueStatus, kind: ArticleKind | undefined, limit: number) {
    const rows = await this.repo.listQueue(status, kind, limit);
    return rows.map((r) => ({
      article: r.article,
      author: {
        id: r.author.id,
        name: r.author.name,
        email: r.author.email,
        avatarUrl: r.authorProfile?.avatarUrl ?? null,
        slug: r.authorProfile?.customUrlSlug ?? r.author.id,
      },
    }));
  }

  /** Re-runs moderation per article; persists results in ONE batched UPDATE. */
  async scan(ids: string[], actor: JwtPayload) {
    const rows = await this.repo.findByIds(ids);
    if (rows.length === 0) return { scanned: 0, results: [] as unknown[] };
    const results: Array<{ id: string; score: number; severity: string; recommendation: string }> = [];
    const updates: ArticleModerationUpdate[] = [];
    for (const row of rows) {
      const scan = await scanContent({ title: row.title, bodyMd: row.bodyMd, kind: row.kind as ArticleKind }, actor);
      updates.push({ id: row.id, score: scan.score, findings: scan.findings });
      results.push({ id: row.id, score: scan.score, severity: scan.findings.severity, recommendation: scan.recommendation });
    }
    await this.repo.bulkSetModeration(updates, actor.sub, new Date());
    await this.repo.insertAudit({
      actorId: actor.sub,
      action: "articles.bulk_scan",
      targetType: "article",
      targetId: ids.join(","),
      metadata: { count: rows.length, results },
    });
    return { scanned: rows.length, results };
  }

  /** Publishes rows still in `submitted` (guards double-publish mid-batch). */
  async approve(ids: string[], actorId: string) {
    const updatedRows = await this.repo.publishSubmitted(ids, actorId, new Date());
    if (updatedRows.length > 0) {
      bumpSearchVersion();
      await this.awardAuthors(updatedRows);
    }

    // Author name/slug/avatar for every approved article in ONE query.
    const authors = await this.repo.findAuthorCards(updatedRows.map((a) => a.userId));
    const authorSlugOf = (userId: string) => authors.get(userId)?.slug ?? userId;

    // One feed post per approved article — ONE multi-row insert.
    await this.repo.insertFeedPosts(updatedRows.map((a) => {
      const author = authors.get(a.userId);
      const authorSlug = authorSlugOf(a.userId);
      return {
        userId: a.userId,
        content: `${kindEmoji(a.kind)} New ${a.kind}: ${a.title}${a.summary ? ` — ${a.summary}` : ""}`,
        linkUrl: publicArticlePath(authorSlug, a.slug),
        linkTitle: a.title,
        linkDescription: a.summary ?? null,
        linkImageUrl: a.coverImageUrl ?? null,
        privacy: "Public",
        subjectType: "article",
        subjectId: a.id,
        embedPayload: {
          kind: a.kind,
          title: a.title,
          slug: a.slug,
          summary: a.summary,
          coverImageUrl: a.coverImageUrl,
          readMinutes: a.readMinutes,
          category: a.category,
          tags: a.tags,
          author: { name: author?.name ?? null, slug: authorSlug, avatarUrl: author?.avatarUrl ?? null },
        },
      };
    }));

    // Notify each author their submission was approved + published (#898).
    for (const a of updatedRows) {
      await NotificationService.notify({
        userId: a.userId,
        type: "review",
        title: `Your ${a.kind} was approved`,
        message: a.title,
        url: publicArticlePath(authorSlugOf(a.userId), a.slug),
        refType: "article",
        refId: a.id,
      });
    }

    const approvedIds = updatedRows.map((r) => r.id);
    await this.repo.insertAudit({
      actorId,
      action: "articles.bulk_approve",
      targetType: "article",
      targetId: ids.join(","),
      metadata: { count: updatedRows.length, approvedIds },
    });
    return { approved: updatedRows.length, ids: approvedIds };
  }

  async reject(ids: string[], actorId: string, reason: string) {
    const updatedRows = await this.repo.rejectSubmitted(ids, actorId, reason, new Date());
    // Notify each author their submission was not approved, with the reason (#898).
    for (const a of updatedRows) {
      await NotificationService.notify({
        userId: a.userId,
        type: "review",
        title: `Your ${a.kind} was not approved`,
        message: reason,
        url: `/services/creator/articles`,
        refType: "article",
        refId: a.id,
      });
    }
    const rejectedIds = updatedRows.map((r) => r.id);
    await this.repo.insertAudit({
      actorId,
      action: "articles.bulk_reject",
      targetType: "article",
      targetId: ids.join(","),
      metadata: { count: updatedRows.length, reason, rejectedIds },
    });
    return { rejected: updatedRows.length, ids: rejectedIds };
  }

  /** Award the article AUTHOR (not the approving admin) publish points;
   *  an award glitch never fails the approve. */
  private async awardAuthors(rows: Array<{ id: string; userId: string }>): Promise<void> {
    let mod: typeof import("../../domains/gamification/index.js");
    try {
      mod = await import("../../domains/gamification/index.js");
    } catch {
      return;
    }
    const game = new mod.GamificationService(buildRepos(this.db));
    for (const a of rows) {
      await game
        .awardWithRoleLookup(mod.ACTIONS.ARTICLE_PUBLISHED, { userId: a.userId, refId: a.id, refType: "article" })
        .catch(() => undefined);
    }
  }
}
