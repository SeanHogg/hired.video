/**
 * artifactViewStreams — the read predicates that keep the event streams in
 * the polymorphic `artifact_views` table apart (W3-A, migration 0580; the
 * stream vocabulary is ARTIFACT_VIEW_EVENT_TYPES in shared/artifact-views.ts).
 *
 * Every artifact_views reader goes through one of these so a stream folded in
 * from a retired table (listing traffic, studio playback events) can never
 * leak into another stream's counts:
 *
 *   isArtifactView         — event_type = 'view' (creator stats, metrics
 *                            drawer, profile stats, ad targeting, counters).
 *   isServerRecordedView   — the 'view' rows a server GET records (engagement
 *                            NULL); client beacons always carry engagement.
 *                            These are exactly the former resume_views /
 *                            company_views rows, so the résumé / company
 *                            `viewCount` reads keep their meaning.
 */
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { ArtifactKind } from "../../../shared/artifact-views.js";

const { artifactViews } = schema;

export type DbLike = any;

export function isArtifactView(): SQL {
  return eq(artifactViews.eventType, "view");
}

/** One artifact's server-recorded page views. */
export function isServerRecordedViewOf(kind: ArtifactKind, artifactId: string): SQL | undefined {
  return and(
    eq(artifactViews.artifactKind, kind),
    eq(artifactViews.artifactId, artifactId),
    isArtifactView(),
    isNull(artifactViews.engagement),
  );
}

/** Server-recorded view count for one artifact. */
export async function countServerRecordedViews(
  db: DbLike,
  kind: ArtifactKind,
  artifactId: string,
): Promise<number> {
  const [row] = (await db
    .select({ c: sql<number>`count(*)::int` })
    .from(artifactViews)
    .where(isServerRecordedViewOf(kind, artifactId))) as Array<{ c: number | string }>;
  return Number(row?.c ?? 0);
}

/** Server-recorded view counts for many artifacts of one kind (one grouped
 *  query). Ids with no views are absent from the map. */
export async function countServerRecordedViewsBulk(
  db: DbLike,
  kind: ArtifactKind,
  artifactIds: string[],
): Promise<Map<string, number>> {
  if (artifactIds.length === 0) return new Map();
  const rows = (await db
    .select({ artifactId: artifactViews.artifactId, c: sql<number>`count(*)::int` })
    .from(artifactViews)
    .where(
      and(
        eq(artifactViews.artifactKind, kind),
        inArray(artifactViews.artifactId, artifactIds),
        isArtifactView(),
        isNull(artifactViews.engagement),
      ),
    )
    .groupBy(artifactViews.artifactId)) as Array<{ artifactId: string; c: number | string }>;
  return new Map(rows.map((r) => [r.artifactId, Number(r.c)]));
}
