/**
 * PublicationService — records + reads "where has this Studio project been
 * published" (#1896, migration 0196).
 *
 * The editor's Save menu and Details drawer both ask "list the destinations
 * this project went to (with their view URLs)". That read is served through
 * the canonical read-through cache (getOrSetCached) keyed per project and
 * invalidated on every record/upsert — the keyspace is bounded (one key per
 * project) so a stable key is fine (no version token needed).
 *
 * Writes UPSERT on the (project_id, destination) unique index: re-publishing
 * to the same destination updates the existing row in place (new external
 * id/url + bumped published_at), so the table is "current state per
 * destination", not an append log. This is what answers the user's
 * "same or new URL?" — the row IS the latest publish for that destination.
 *
 * Zero Hono/Context awareness — callable from a route, a queue consumer, or
 * a test with an injected db.
 */
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";

const { studioProjectPublications } = schema;

type Db = ReturnType<typeof getDb>;

/** Mirror of the client `PublicationStatus`. */
export type PublicationStatus = "published" | "failed" | "pending";

export interface PublicationRecord {
  destination: string;
  externalId: string | null;
  externalUrl: string | null;
  status: PublicationStatus;
  publishedAt: string; // ISO
  updatedAt: string; // ISO
}

export interface RecordPublicationInput {
  projectId: string;
  destination: string;
  externalId?: string | null;
  externalUrl?: string | null;
  status?: PublicationStatus;
}

const TTL_SECONDS = 300;

function cacheKey(projectId: string): string {
  return `studio:pubs:${projectId}`;
}

export function invalidatePublicationsCache(projectId: string): void {
  invalidateCachedKey(cacheKey(projectId));
}

/**
 * Upsert a publication record for (projectId, destination). Re-publishing
 * the same destination updates the row in place. Invalidates the cached
 * list so the editor sees the new link immediately.
 */
export async function recordPublication(
  input: RecordPublicationInput,
  db: Db = getDb(),
): Promise<PublicationRecord> {
  const now = new Date();
  const [row] = await db
    .insert(studioProjectPublications)
    .values({
      projectId: input.projectId,
      destination: input.destination,
      externalId: input.externalId ?? null,
      externalUrl: input.externalUrl ?? null,
      status: input.status ?? "published",
      publishedAt: now,
      updatedAt: now,
    } as any)
    .onConflictDoUpdate({
      target: [
        studioProjectPublications.projectId,
        studioProjectPublications.destination,
      ],
      set: {
        externalId: input.externalId ?? null,
        externalUrl: input.externalUrl ?? null,
        status: input.status ?? "published",
        publishedAt: now,
        updatedAt: now,
      } as any,
    })
    .returning();

  invalidatePublicationsCache(input.projectId);
  return toRecord(row);
}

/**
 * List a project's publications (one per destination), cached. Ordered by
 * destination for stable rendering.
 */
export async function listPublications(
  projectId: string,
  db: Db = getDb(),
): Promise<PublicationRecord[]> {
  return getOrSetCached<PublicationRecord[]>({
    key: cacheKey(projectId),
    ttlSeconds: TTL_SECONDS,
    loader: async () => {
      const rows = await db
        .select()
        .from(studioProjectPublications)
        .where(eq(studioProjectPublications.projectId, projectId))
        .orderBy(asc(studioProjectPublications.destination));
      return rows.map(toRecord);
    },
  });
}

/**
 * Drop a project's publication record for one destination — used when a
 * project is UN-published from a destination (e.g. removed from profile) so
 * the editor's "Published to" list reflects reality. Invalidates the cache.
 */
export async function removePublication(
  projectId: string,
  destination: string,
  db: Db = getDb(),
): Promise<void> {
  await db
    .delete(studioProjectPublications)
    .where(
      and(
        eq(studioProjectPublications.projectId, projectId),
        eq(studioProjectPublications.destination, destination),
      ),
    );
  invalidatePublicationsCache(projectId);
}

/** Read a single (project, destination) record — uncached helper for write
 *  paths that want to short-circuit duplicate work. */
export async function getPublication(
  projectId: string,
  destination: string,
  db: Db = getDb(),
): Promise<PublicationRecord | null> {
  const [row] = await db
    .select()
    .from(studioProjectPublications)
    .where(
      and(
        eq(studioProjectPublications.projectId, projectId),
        eq(studioProjectPublications.destination, destination),
      ),
    )
    .limit(1);
  return row ? toRecord(row) : null;
}

function toRecord(
  row: typeof studioProjectPublications.$inferSelect,
): PublicationRecord {
  return {
    destination: row.destination,
    externalId: row.externalId,
    externalUrl: row.externalUrl,
    status: row.status as PublicationStatus,
    publishedAt:
      row.publishedAt instanceof Date
        ? row.publishedAt.toISOString()
        : String(row.publishedAt),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
  };
}
