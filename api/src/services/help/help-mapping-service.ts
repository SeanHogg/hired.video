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
import { getDb } from "../../db/index.js";
import { helpMappings } from "../../db/schema/helpMappings.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import {
  deleteHelpEmbeddings,
  getIndexedHelpSlugs,
  isSemanticHelpAvailable,
  recordIndexedHelpSlugs,
  semanticSearchHelpIds,
  upsertHelpEmbedding,
} from "./help-embeddings.js";
import type {
  HelpContextKey,
  HelpIndexItem,
  HelpMappingListItem,
} from "../../../../shared/help.js";
import { logger } from "../../lib/logger.js";

type Db = ReturnType<typeof getDb>;

const RESOLVE_TTL_SECONDS = 300;
const CONTEXTS_TTL_SECONDS = 600;

const ctxCacheKey = (contextKey: string) => `help:ctx:${contextKey}`;
const CONTEXTS_KEY = "help:contexts";

/** The request-scoped service on the global db — what the /api/help routes use. */
export function helpMappingService(): HelpMappingService {
  return new HelpMappingService(getDb());
}

export class HelpMappingService {
  constructor(private readonly db: Db) {}

  /** The public help reads power a DECORATIVE, self-gating drawer. The
   *  mapping store is OPTIONAL curation meta — help CONTENT lives in bundled
   *  client files, so a missing/empty/unavailable `help_mappings` table must
   *  degrade to "no curated help here", never a 500 that breaks the page and
   *  spams client-error reports. Caught OUTSIDE getOrSetCached so the empty
   *  fallback is never cached (recovers on the next request once the DB is
   *  reachable). A persistent failure is operational — apply migration 0210;
   *  see the gap register. */
  private async safeRead<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      logger.error("[HelpMappingService] degraded (returning fallback)", { label, error: err });
      return fallback;
    }
  }

  /** The curated, ordered slug list for a page context. Read-through
   *  cached; invalidated on any write that touches the context. Content
   *  is resolved from these slugs on the client (bundled files). */
  async resolveForContext(contextKey: HelpContextKey): Promise<string[]> {
    return this.safeRead(`resolve:${contextKey}`, [], () =>
      getOrSetCached<string[]>({
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
      }),
    );
  }

  /** Semantic search over help content via Vectorize (vectors keyed by
   *  slug). Returns ranked slugs + whether semantic ran; the client falls
   *  back to its local keyword index when `semantic` is false. */
  async searchSemantic(query: string, limit = 12): Promise<{ slugs: string[]; semantic: boolean }> {
    const q = query.trim().slice(0, 200);
    if (q.length < 2) return { slugs: [], semantic: false };
    // Read-through cache: a semantic hit costs a Workers-AI embed + a
    // Vectorize query, so identical queries must not re-run that per request.
    // Keyspace is unbounded (free text) → TTL backstop; `avail` in the key so
    // provisioning Vectorize doesn't keep serving cached "unavailable" misses.
    const avail = isSemanticHelpAvailable() ? "1" : "0";
    return this.safeRead(`search`, { slugs: [], semantic: false }, () =>
      getOrSetCached<{ slugs: string[]; semantic: boolean }>({
        key: `help:sem:${avail}:${limit}:${q.toLowerCase()}`,
        ttlSeconds: 300,
        loader: async () => {
          const slugs = await semanticSearchHelpIds(q, limit);
          return slugs === null ? { slugs: [], semantic: false } : { slugs, semantic: true };
        },
      }),
    );
  }

  /** Cheap membership set — which context keys have any active help, so the
   *  drawer skips the per-context resolve on pages with no mapping. */
  async listActiveContextKeys(): Promise<string[]> {
    return this.safeRead(`contexts`, [], () =>
      getOrSetCached<string[]>({
        key: CONTEXTS_KEY,
        ttlSeconds: CONTEXTS_TTL_SECONDS,
        loader: async () => {
          const rows = await this.db
            .selectDistinct({ contextKey: helpMappings.contextKey })
            .from(helpMappings)
            .where(eq(helpMappings.isActive, true));
          return rows.map((r) => r.contextKey);
        },
      }),
    );
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
    // Prune vectors for slugs that are no longer in the catalog (#2076):
    // diff the new set against the ledger of previously-indexed slugs, then
    // record the new set. Best-effort + no-op when Vectorize/KV are absent.
    const current = items.map((i) => i.slug);
    const currentSet = new Set(current);
    const previous = await getIndexedHelpSlugs();
    const removed = previous.filter((slug) => !currentSet.has(slug));
    if (removed.length > 0) await deleteHelpEmbeddings(removed);
    await recordIndexedHelpSlugs(current);
    return items.length;
  }

  private invalidate(contextKey: string): void {
    invalidateCachedKey(ctxCacheKey(contextKey));
    invalidateCachedKey(CONTEXTS_KEY);
  }
}
