/**
 * Context-aware help — mapping service.
 *
 * Owns all DB access + domain logic for `help_mappings`: a SuperAdmin
 * curates which published help articles surface on each *kind* of page
 * (keyed on AIContextType — see shared/help.ts). The public resolver
 * reads the active, published set for a context; the drawer renders it.
 *
 * Boundary: routes do auth + the SuperAdmin gate + parsing; this module
 * owns the queries, the upsert semantics, and the article projection
 * (no raw Drizzle in route handlers — repo-per-aggregate convention).
 *
 * Caching: the context keyspace is bounded (AIContextType is a code
 * enum), so we cache per-context directly through the canonical
 * read-through helper and invalidate the touched keys on every write.
 */

import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import type { getDb } from "../../db/index.js";
import { helpMappings } from "../../db/schema/helpMappings.js";
import { helpContentTranslations } from "../../db/schema/helpContentTranslations.js";
import { articles } from "../../db/schema/articles.js";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "../../../../shared/i18n.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import { getSearchVersion } from "../../utils/search-cache.js";
import {
  isSemanticHelpAvailable,
  semanticSearchHelpIds,
  upsertHelpEmbedding,
} from "./help-embeddings.js";
import type {
  HelpArticleCard,
  HelpContextKey,
  HelpFaqGroup,
  HelpMappingListItem,
  ResolveHelpResponse,
} from "../../../../shared/help.js";

type Db = ReturnType<typeof getDb>;

const RESOLVE_TTL_SECONDS = 300;
const CONTEXTS_TTL_SECONDS = 600;

const ctxCacheKey = (contextKey: string) => `help:ctx:${contextKey}`;
const CONTEXTS_KEY = "help:contexts";

/** The single row→HelpArticleCard projection — every card-returning query
 *  selects these columns and maps through here (DRY). */
type HelpCardRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  kind: string;
  userId: string;
  readMinutes: number;
};

function toHelpCard(r: HelpCardRow): HelpArticleCard {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary ?? "",
    kind: r.kind,
    userId: r.userId,
    readMinutes: r.readMinutes,
  };
}

export class HelpMappingService {
  constructor(private readonly db: Db) {}

  /** Overlay per-locale title/summary onto cards (EN = base article; a
   *  missing translation row or null column falls back to the base).
   *  Two queries, never N+1. No-op for the EN/default locale. */
  private async localizeCards(
    cards: HelpArticleCard[],
    locale: Locale,
  ): Promise<HelpArticleCard[]> {
    if (locale === DEFAULT_LOCALE || cards.length === 0) return cards;
    const rows = await this.db
      .select({
        articleId: helpContentTranslations.articleId,
        title: helpContentTranslations.title,
        summary: helpContentTranslations.summary,
      })
      .from(helpContentTranslations)
      .where(
        and(
          eq(helpContentTranslations.locale, locale),
          inArray(
            helpContentTranslations.articleId,
            cards.map((c) => c.id),
          ),
        ),
      );
    const byId = new Map(rows.map((r) => [r.articleId, r] as const));
    return cards.map((c) => {
      const t = byId.get(c.id);
      if (!t) return c;
      return { ...c, title: t.title ?? c.title, summary: t.summary ?? c.summary };
    });
  }

  /** The curated, published article set for a page context. Read-through
   *  cached per (context, locale); invalidated on any write that touches
   *  the context. */
  async resolveForContext(
    contextKey: HelpContextKey,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<ResolveHelpResponse> {
    const articlesForCtx = await getOrSetCached<HelpArticleCard[]>({
      key: `${ctxCacheKey(contextKey)}:${locale}`,
      ttlSeconds: RESOLVE_TTL_SECONDS,
      loader: async () => this.localizeCards(await this.loadForContext(contextKey), locale),
    });
    return { context: contextKey, articles: articlesForCtx };
  }

  private async loadForContext(contextKey: HelpContextKey): Promise<HelpArticleCard[]> {
    const rows = await this.db
      .select({
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        summary: articles.summary,
        kind: articles.kind,
        userId: articles.userId,
        readMinutes: articles.readMinutes,
      })
      .from(helpMappings)
      .innerJoin(articles, eq(articles.id, helpMappings.articleId))
      .where(
        and(
          eq(helpMappings.contextKey, contextKey),
          eq(helpMappings.isActive, true),
          eq(articles.status, "published"),
        ),
      )
      .orderBy(asc(helpMappings.position));

    return rows.map(toHelpCard);
  }

  /** Full-text-ish search across published help content (kind faq|guide).
   *  Powers the drawer's "search the help" box. Cached under the global
   *  search version token — any article create/update/publish bumps it,
   *  so results never go stale without an explicit purge (the same
   *  contract the unified search uses; keyspace is unbounded). */
  async searchHelp(query: string, limit = 12, locale: Locale = DEFAULT_LOCALE): Promise<HelpArticleCard[]> {
    const q = query.trim().slice(0, 100);
    if (q.length < 2) return [];
    const version = await getSearchVersion();
    // `mode` in the key so flipping the Vectorize binding on/off doesn't
    // serve a cached result from the other path; `locale` so each language
    // caches its own localized cards.
    const mode = isSemanticHelpAvailable() ? "sem" : "kw";
    return getOrSetCached<HelpArticleCard[]>({
      key: `help:search:${mode}:${locale}:v${version}:${limit}:${q.toLowerCase()}`,
      ttlSeconds: 120,
      loader: async () => {
        // Phase 2: semantic KNN via Vectorize when available; the loader
        // returns null when unavailable OR the embed/query fails, so we
        // always have the keyword path as a correctness backstop (#2004).
        const semanticIds = await semanticSearchHelpIds(q, limit);
        if (semanticIds && semanticIds.length > 0) {
          const cards = await this.loadPublishedHelpCardsByIds(semanticIds);
          if (cards.length > 0) return this.localizeCards(cards, locale);
        }
        return this.localizeCards(await this.keywordSearch(q, limit), locale);
      },
    });
  }

  /** Keyword (ILIKE) help search — the Phase-1 path + semantic fallback. */
  private async keywordSearch(q: string, limit: number): Promise<HelpArticleCard[]> {
    const needle = `%${q}%`;
    const rows = await this.db
      .select({
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        summary: articles.summary,
        kind: articles.kind,
        userId: articles.userId,
        readMinutes: articles.readMinutes,
      })
      .from(articles)
      .where(
        and(
          eq(articles.status, "published"),
          inArray(articles.kind, ["faq", "guide"]),
          or(
            ilike(articles.title, needle),
            ilike(articles.summary, needle),
            ilike(articles.bodyMd, needle),
          ),
        ),
      )
      .orderBy(desc(articles.publishedAt))
      .limit(limit);
    return rows.map(toHelpCard);
  }

  /** Load published faq|guide cards for a set of ids, preserving the input
   *  order (Vectorize returns ids ranked by similarity). */
  private async loadPublishedHelpCardsByIds(ids: string[]): Promise<HelpArticleCard[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        summary: articles.summary,
        kind: articles.kind,
        userId: articles.userId,
        readMinutes: articles.readMinutes,
      })
      .from(articles)
      .where(
        and(
          eq(articles.status, "published"),
          inArray(articles.kind, ["faq", "guide"]),
          inArray(articles.id, ids),
        ),
      );
    const byId = new Map(rows.map((r) => [r.id, toHelpCard(r)] as const));
    return ids.map((id) => byId.get(id)).filter((c): c is HelpArticleCard => Boolean(c));
  }

  /** Backfill embeddings for every published faq|guide article — the
   *  one-time activation step after the Vectorize index is provisioned
   *  (SuperAdmin `POST /api/help/reindex`). Best-effort + idempotent
   *  (Vectorize upsert is by id). Returns the count indexed. */
  async reindexEmbeddings(): Promise<number> {
    const rows = await this.db
      .select({
        id: articles.id,
        kind: articles.kind,
        title: articles.title,
        summary: articles.summary,
        body: articles.bodyMd,
      })
      .from(articles)
      .where(and(eq(articles.status, "published"), inArray(articles.kind, ["faq", "guide"])));
    for (const r of rows) {
      await upsertHelpEmbedding({
        articleId: r.id,
        kind: r.kind,
        title: r.title,
        summary: r.summary ?? "",
        body: r.body ?? "",
      });
    }
    return rows.length;
  }

  /** All published FAQ articles grouped by category — powers the Help
   *  page accordion + the card feed's FAQ cards (the single DB-backed
   *  source that replaced the static help-faqs.ts catalogue). Cached under
   *  the global search version (bumped on any article write). */
  async listFaqs(locale: Locale = DEFAULT_LOCALE): Promise<HelpFaqGroup[]> {
    const version = await getSearchVersion();
    return getOrSetCached<HelpFaqGroup[]>({
      key: `help:faqs:${locale}:v${version}`,
      ttlSeconds: 300,
      loader: async () => {
        const rows = await this.db
          .select({
            id: articles.id,
            slug: articles.slug,
            userId: articles.userId,
            question: articles.title,
            answer: articles.bodyMd,
            category: articles.category,
          })
          .from(articles)
          .where(and(eq(articles.status, "published"), eq(articles.kind, "faq")))
          .orderBy(asc(articles.category), asc(articles.createdAt));

        // Per-locale overlay: question ← translated title, answer ←
        // translated body (EN base falls through on a miss/null).
        const tx = await this.faqTranslations(rows.map((r) => r.id), locale);
        const byCat = new Map<string, HelpFaqGroup>();
        for (const r of rows) {
          const category = r.category ?? "General";
          const group = byCat.get(category) ?? { category, questions: [] };
          const t = tx.get(r.id);
          group.questions.push({
            id: r.id,
            slug: r.slug,
            userId: r.userId,
            question: t?.title ?? r.question,
            answer: t?.body ?? r.answer,
          });
          byCat.set(category, group);
        }
        return [...byCat.values()];
      },
    });
  }

  /** Fetch (title, body) FAQ translations for a locale, keyed by article
   *  id. Empty map for the EN/default locale (no overlay needed). */
  private async faqTranslations(
    ids: string[],
    locale: Locale,
  ): Promise<Map<string, { title: string | null; body: string | null }>> {
    if (locale === DEFAULT_LOCALE || ids.length === 0) return new Map();
    const rows = await this.db
      .select({
        articleId: helpContentTranslations.articleId,
        title: helpContentTranslations.title,
        body: helpContentTranslations.bodyMd,
      })
      .from(helpContentTranslations)
      .where(
        and(
          eq(helpContentTranslations.locale, locale),
          inArray(helpContentTranslations.articleId, ids),
        ),
      );
    return new Map(rows.map((r) => [r.articleId, { title: r.title, body: r.body }] as const));
  }

  /** All published guide articles as cards — powers the card feed's guide
   *  cards (DB-backed, replacing the static HELP_GUIDES list). */
  async listGuides(locale: Locale = DEFAULT_LOCALE): Promise<HelpArticleCard[]> {
    const version = await getSearchVersion();
    return getOrSetCached<HelpArticleCard[]>({
      key: `help:guides:${locale}:v${version}`,
      ttlSeconds: 300,
      loader: async () => {
        const rows = await this.db
          .select({
            id: articles.id,
            slug: articles.slug,
            title: articles.title,
            summary: articles.summary,
            kind: articles.kind,
            userId: articles.userId,
            readMinutes: articles.readMinutes,
          })
          .from(articles)
          .where(and(eq(articles.status, "published"), eq(articles.kind, "guide")))
          .orderBy(asc(articles.title));
        return this.localizeCards(rows.map(toHelpCard), locale);
      },
    });
  }

  /** Cheap membership set — which context keys have any active help. Lets
   *  the drawer skip the per-context resolve on pages with no mapping
   *  (mirrors the page-embed `listActivePaths` optimisation). */
  async listActiveContextKeys(): Promise<string[]> {
    return getOrSetCached<string[]>({
      key: CONTEXTS_KEY,
      ttlSeconds: CONTEXTS_TTL_SECONDS,
      loader: async () => {
        const rows = await this.db
          .selectDistinct({ contextKey: helpMappings.contextKey })
          .from(helpMappings)
          .where(eq(helpMappings.isActive, true));
        return rows.map((r) => r.contextKey);
      },
    });
  }

  /** All mappings for the SuperAdmin curation list (any active state). */
  async listAll(): Promise<HelpMappingListItem[]> {
    const rows = await this.db
      .select({
        id: helpMappings.id,
        contextKey: helpMappings.contextKey,
        articleId: helpMappings.articleId,
        position: helpMappings.position,
        isActive: helpMappings.isActive,
        updatedAt: helpMappings.updatedAt,
        articleTitle: articles.title,
        articleKind: articles.kind,
      })
      .from(helpMappings)
      .innerJoin(articles, eq(articles.id, helpMappings.articleId))
      .orderBy(asc(helpMappings.contextKey), asc(helpMappings.position));

    return rows.map((r) => ({
      id: r.id,
      contextKey: r.contextKey as HelpContextKey,
      articleId: r.articleId,
      articleTitle: r.articleTitle,
      articleKind: r.articleKind,
      position: r.position,
      isActive: r.isActive,
      updatedAt:
        r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
    }));
  }

  /** Curate: map an article to a context (upsert-by pair). */
  async set(input: {
    contextKey: HelpContextKey;
    articleId: string;
    position?: number;
    userId: string;
  }): Promise<void> {
    await this.db
      .insert(helpMappings)
      .values({
        contextKey: input.contextKey,
        articleId: input.articleId,
        position: input.position ?? 0,
        isActive: true,
        createdBy: input.userId,
      })
      .onConflictDoUpdate({
        target: [helpMappings.contextKey, helpMappings.articleId],
        set: {
          position: input.position ?? 0,
          isActive: true,
          updatedAt: new Date(),
        },
      });
    this.invalidate(input.contextKey);
  }

  /** Remove a mapping row by id. Returns the freed context key (for cache
   *  invalidation) or null when no row matched. */
  async remove(id: string): Promise<boolean> {
    const res = await this.db
      .delete(helpMappings)
      .where(eq(helpMappings.id, id))
      .returning({ contextKey: helpMappings.contextKey });
    if (res.length === 0) return false;
    this.invalidate(res[0].contextKey);
    return true;
  }

  private invalidate(contextKey: string): void {
    // The resolve cache is keyed per (context, locale) — clear every locale.
    for (const locale of SUPPORTED_LOCALES) {
      invalidateCachedKey(`${ctxCacheKey(contextKey)}:${locale}`);
    }
    invalidateCachedKey(CONTEXTS_KEY);
  }
}
