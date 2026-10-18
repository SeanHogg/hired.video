/**
 * PublicationService — records + reads "where has this Studio project been
 * published" (#1920, migration 0196).
 *
 * The editor's Save menu and Details drawer both ask "list the destinations
 * this project went to (with their view URLs)". That read is served through
 * the isolate read-through cache (getOrSetIsolateCached — zero KV writes)
 * keyed per project and
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
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getOrSetIsolateCached, invalidateIsolateKey } from "../../utils/isolate-cache.js";
import { signalWork } from "../scheduling/work-signals.js";

const { studioProjectPublications } = schema;

type Db = ReturnType<typeof getDb>;

/** Mirror of the client `PublicationStatus`. */
export type PublicationStatus = "published" | "failed" | "pending";

export interface PublicationRecord {
  /** The row id — what a scheduled job and its metric snapshots reference. */
  id: string;
  destination: string;
  externalId: string | null;
  externalUrl: string | null;
  status: PublicationStatus;
  publishedAt: string; // ISO
  updatedAt: string; // ISO
  /** Fitted cut posted; null = the master. */
  renderVariantId: string | null;
}

export interface RecordPublicationInput {
  projectId: string;
  destination: string;
  externalId?: string | null;
  externalUrl?: string | null;
  status?: PublicationStatus;
  /** The fitted cut posted (studio_project_render_variants, #2045); null/absent = the master. */
  renderVariantId?: string | null;
  /** The account that actually posted (an owner, company member or delegate);
   *  metrics are read with this account's connection. */
  publishedBy?: string | null;
}

/** Short: invalidation clears this isolate only; others converge in TTL. */
const TTL_SECONDS = 120;

function cacheKey(projectId: string): string {
  return `studio:pubs:${projectId}`;
}

export function invalidatePublicationsCache(projectId: string): void {
  invalidateIsolateKey(cacheKey(projectId));
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
      renderVariantId: input.renderVariantId ?? null,
      publishedBy: input.publishedBy ?? null,
      publishedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        studioProjectPublications.projectId,
        studioProjectPublications.destination,
        studioProjectPublications.renderVariantId,
      ],
      set: {
        externalId: input.externalId ?? null,
        externalUrl: input.externalUrl ?? null,
        status: input.status ?? "published",
        renderVariantId: input.renderVariantId ?? null,
        publishedBy: input.publishedBy ?? null,
        publishedAt: now,
        updatedAt: now,
      },
    })
    .returning();

  invalidatePublicationsCache(input.projectId);
  if (row.status === "published" && row.externalId) await signalWork("post-metrics");
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
  return getOrSetIsolateCached<PublicationRecord[]>({
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
  renderVariantId?: string | null,
  db: Db = getDb(),
): Promise<void> {
  const variantCond = publicationVariantMatch(renderVariantId);
  await db
    .delete(studioProjectPublications)
    .where(
      and(
        eq(studioProjectPublications.projectId, projectId),
        eq(studioProjectPublications.destination, destination),
        ...(variantCond !== undefined ? [variantCond] : []),
      ),
    );
  invalidatePublicationsCache(projectId);
}

/**
 * How many channels each project is live on — the number of DISTINCT
 * destinations with a `published` record (failed/pending attempts don't
 * count; one row per destination already, the DISTINCT just keeps the rule
 * honest). ONE grouped query for the whole list (GET /projects) — never a
 * per-row read. Projects with no published record are absent from the map
 * (read as 0). Uncached on purpose: the project list it rides on is an
 * uncached read, so a publish/unpublish shows up on the next list fetch.
 */
export async function countPublishedChannelsByProject(
  projectIds: readonly string[],
  db: Db = getDb(),
): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({
      projectId: studioProjectPublications.projectId,
      channels: sql<number>`count(distinct ${studioProjectPublications.destination}) filter (where ${studioProjectPublications.status} = 'published')::int`,
    })
    .from(studioProjectPublications)
    .where(inArray(studioProjectPublications.projectId, [...projectIds]))
    .groupBy(studioProjectPublications.projectId);
  return publishedChannelCounts(rows);
}

/** Pure: grouped rows → Map<projectId, count>, dropping zero counts. */
export function publishedChannelCounts(
  rows: ReadonlyArray<{ projectId: string; channels: number | string | null }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const n = Number(row.channels ?? 0);
    if (Number.isFinite(n) && n > 0) counts.set(row.projectId, n);
  }
  return counts;
}

/**
 * A network finished an asynchronous publish (#2048 webhooks): the post it
 * first answered with a job id for (TikTok's `publish_id`) now has its real
 * post id. Re-keys that one row so stats readers — which take post ids —
 * can find it. Returns the project id of the row it updated, or null.
 */
export async function confirmPublishedPost(
  args: { destination: string; pendingExternalId: string; externalId: string; externalUrl?: string | null },
  db: Db = getDb(),
): Promise<string | null> {
  const [row] = await db
    .update(studioProjectPublications)
    .set({
      externalId: args.externalId,
      ...(args.externalUrl ? { externalUrl: args.externalUrl } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(studioProjectPublications.destination, args.destination),
        eq(studioProjectPublications.externalId, args.pendingExternalId),
      ),
    )
    .returning({ projectId: studioProjectPublications.projectId });
  if (!row) return null;
  invalidatePublicationsCache(row.projectId);
  return row.projectId;
}

/**
 * Variant filter for publication queries (R12).
 *
 * - undefined (omitted) → no filter → all rows for the destination (destination-wide)
 * - null → master-only (isNull)
 * - explicit string → that specific cut
 */
/** Exported for unit tests (R12 omit vs null vs cut). */
export function publicationVariantMatch(renderVariantId?: string | null) {
  if (renderVariantId === undefined) {
    return undefined; // no filter → delete all for destination
  }
  return renderVariantId === null
    ? isNull(studioProjectPublications.renderVariantId)
    : eq(studioProjectPublications.renderVariantId, renderVariantId);
}

function toRecord(
  row: typeof studioProjectPublications.$inferSelect,
): PublicationRecord {
  return {
    id: row.id,
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
    renderVariantId: row.renderVariantId ?? null,
  };
}
