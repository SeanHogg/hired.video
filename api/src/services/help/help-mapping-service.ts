/**
 * Context-aware help — mapping + search service (v2, slug-keyed meta).
 *
 * Owns DB access for `help_mappings` (context → ordered slug list) and the
 * semantic-search bridge to Vectorize. It deals only in SLUGS + meta — help
 * CONTENT lives in bundled Markdown files on the client, never the DB.
 *
 * Caching: the context keyspace is bounded (AIContextType is a code enum),
 * so resolve is cached per-context through the canonical read-through helper
 * and invalidated on every write.
 */

import { and, asc, eq } from "drizzle-orm";
import type { getDb } from "../../db/index.js";
import { helpMappings } from "../../db/schema/helpMappings.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import {
  semanticSearchHelpIds,
  upsertHelpEmbedding,
} from "./help-embeddings.js";
import type {
  HelpContextKey,
  HelpIndexItem,
  HelpMappingListItem,
} from "../../../../shared/help.js";

type Db = ReturnType<typeof getDb>;

const RESOLVE_TTL_SECONDS = 300;
const CONTEXTS_TTL_SECONDS = 600;

const ctxCacheKey = (contextKey: string) => `help:ctx:${contextKey}`;
const CONTEXTS_KEY = "help:contexts";

export class HelpMappingService {
  constructor(private readonly db: Db) {}

  /** The curated, ordered slug list for a page context. Read-through
   *  cached; invalidated on any write that touches the context. Content
   *  is resolved from these slugs on the client (bundled files). */
  async resolveForContext(contextKey: HelpContextKey): Promise<string[]> {
    return getOrSetCached<string[]>({
      key: ctxCacheKey(contextKey),
      ttlSeconds: RESOLVE_TTL_SECONDS,
      loader: async () => {
        const rows = await this.db
          .select({ slug: helpMappings.slug })
          .from(helpMappings)
          .where(and(eq(helpMappings.contextKey, contextKey), eq(helpMappings.isActive, true)))
          .orderBy(asc(helpMappings.position));
        return rows.map((r) => r.slug);
      },
    });
  }

  /** Semantic search over help content via Vectorize (vectors keyed by
   *  slug). Returns ranked slugs + whether semantic ran; the client falls
   *  back to its local keyword index when `semantic` is false. */
  async searchSemantic(query: string, limit = 12): Promise<{ slugs: string[]; semantic: boolean }> {
    const q = query.trim().slice(0, 200);
    if (q.length < 2) return { slugs: [], semantic: false };
    const slugs = await semanticSearchHelpIds(q, limit);
    return slugs === null ? { slugs: [], semantic: false } : { slugs, semantic: true };
  }

  /** Cheap membership set — which context keys have any active help, so the
   *  drawer skips the per-context resolve on pages with no mapping. */
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
        slug: helpMappings.slug,
        position: helpMappings.position,
        isActive: helpMappings.isActive,
        updatedAt: helpMappings.updatedAt,
      })
      .from(helpMappings)
      .orderBy(asc(helpMappings.contextKey), asc(helpMappings.position));

    return rows.map((r) => ({
      id: r.id,
      contextKey: r.contextKey as HelpContextKey,
      slug: r.slug,
      position: r.position,
      isActive: r.isActive,
      updatedAt:
        r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
    }));
  }

  /** Curate: map a content slug to a context (upsert-by pair). */
  async set(input: {
    contextKey: HelpContextKey;
    slug: string;
    position?: number;
    userId: string;
  }): Promise<void> {
    await this.db
      .insert(helpMappings)
      .values({
        contextKey: input.contextKey,
        slug: input.slug,
        position: input.position ?? 0,
        isActive: true,
        createdBy: input.userId,
      })
      .onConflictDoUpdate({
        target: [helpMappings.contextKey, helpMappings.slug],
        set: { position: input.position ?? 0, isActive: true, updatedAt: new Date() },
      });
    this.invalidate(input.contextKey);
  }

  /** Remove a mapping row by id. Returns true when a row matched. */
  async remove(id: string): Promise<boolean> {
    const res = await this.db
      .delete(helpMappings)
      .where(eq(helpMappings.id, id))
      .returning({ contextKey: helpMappings.contextKey });
    if (res.length === 0) return false;
    this.invalidate(res[0].contextKey);
    return true;
  }

  /** (Re)build semantic-search vectors from client-supplied content. The
   *  client reads the bundled catalog and sends slug + text; we embed +
   *  upsert into Vectorize. Text is transient (embedded, never persisted) —
   *  content of record stays in the files. Returns the count indexed. */
  async reindex(items: HelpIndexItem[]): Promise<number> {
    for (const item of items) {
      await upsertHelpEmbedding({ slug: item.slug, text: item.text });
    }
    return items.length;
  }

  private invalidate(contextKey: string): void {
    invalidateCachedKey(ctxCacheKey(contextKey));
    invalidateCachedKey(CONTEXTS_KEY);
  }
}
