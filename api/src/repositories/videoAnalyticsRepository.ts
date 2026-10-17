/**
 * Studio playback events (view / CTA click / share / impression), keyed on
 * the studio project (post-#665). Stored in the polymorphic artifact_views
 * table (artifact_id = studio_projects.id) under the event types mapped by
 * STUDIO_EVENT_TO_VIEW_EVENT_TYPE — video_analytics was folded in by W3-A
 * 0580. Callers keep speaking the studio event vocabulary
 * (shared/studio-analytics-events.ts); this module maps both ways.
 */
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import {
  STUDIO_EVENT_TO_VIEW_EVENT_TYPE,
  isArtifactKind,
  studioEventForViewEventType,
  type ArtifactKind,
} from "../../../shared/artifact-views.js";
import type { StudioAnalyticsEvent } from "../../../shared/studio-analytics-events.js";

const { artifactViews } = schema;

const STUDIO_EVENT_TYPES = Object.values(STUDIO_EVENT_TO_VIEW_EVENT_TYPE);

export interface StudioEventInsert {
  studioProjectId: string;
  /** The project's media kind (artifact_views.artifact_kind). */
  artifactKind: ArtifactKind;
  ownerUserId: string | null;
  viewerId: string | null;
  event: StudioAnalyticsEvent;
  referrer: string | null;
  campaignId: string | null;
  metadata: unknown;
}

export async function insertVideoAnalyticsEvent(db: Db, values: StudioEventInsert): Promise<void> {
  await db.insert(artifactViews).values({
    artifactKind: values.artifactKind,
    artifactId: values.studioProjectId,
    ownerUserId: values.ownerUserId,
    viewerId: values.viewerId,
    eventType: STUDIO_EVENT_TO_VIEW_EVENT_TYPE[values.event],
    referrer: values.referrer,
    campaignId: values.campaignId,
    metadata: values.metadata ?? null,
  });
}

/** Studio events of the given projects (any media kind). */
function studioEventsOf(projectIds: string[]) {
  return and(
    projectIds.length === 1 ? eq(artifactViews.artifactId, projectIds[0]) : inArray(artifactViews.artifactId, projectIds),
    inArray(artifactViews.eventType, STUDIO_EVENT_TYPES),
  );
}

/** `{ [studioEvent]: total }` across the given projects (one grouped query). */
export async function countEventsForProjects(db: Db, projectIds: string[]): Promise<Record<string, number>> {
  if (projectIds.length === 0) return {};
  const rows = await db
    .select({ eventType: artifactViews.eventType, total: count() })
    .from(artifactViews)
    .where(studioEventsOf(projectIds))
    .groupBy(artifactViews.eventType);
  const out: Record<string, number> = {};
  for (const r of rows) {
    const event = studioEventForViewEventType(r.eventType);
    if (event) out[event] = Number(r.total);
  }
  return out;
}

/** View + CTA-click counts per project (one grouped query) for list DTOs. */
export async function countViewsAndClicksByProject(
  db: Db,
  projectIds: string[],
): Promise<Map<string, { viewCount: number; ctaClickCount: number }>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({
      studioProjectId: artifactViews.artifactId,
      viewCount: sql<number>`count(*) filter (where ${artifactViews.eventType} = ${STUDIO_EVENT_TO_VIEW_EVENT_TYPE.view})::int`,
      ctaClickCount: sql<number>`count(*) filter (where ${artifactViews.eventType} = ${STUDIO_EVENT_TO_VIEW_EVENT_TYPE.cta_click})::int`,
    })
    .from(artifactViews)
    .where(studioEventsOf(projectIds))
    .groupBy(artifactViews.artifactId);
  return new Map(
    rows
      .filter((r): r is typeof r & { studioProjectId: string } => typeof r.studioProjectId === "string")
      .map((r) => [r.studioProjectId, { viewCount: r.viewCount, ctaClickCount: r.ctaClickCount }]),
  );
}

/** `{ event, n }` rows for the given studio events of ONE project — the CTA /
 *  impression rollup on ArtifactMetricsDTO (artifactEventRollup.ts). */
export async function countStudioEventRows(
  db: Db,
  projectId: string,
  events: readonly StudioAnalyticsEvent[],
): Promise<Array<{ event: string; n: number }>> {
  const rows = await db
    .select({ eventType: artifactViews.eventType, n: count() })
    .from(artifactViews)
    .where(
      and(
        eq(artifactViews.artifactId, projectId),
        inArray(artifactViews.eventType, events.map((e) => STUDIO_EVENT_TO_VIEW_EVENT_TYPE[e])),
      ),
    )
    .groupBy(artifactViews.eventType);
  return rows.flatMap((r) => {
    const event = studioEventForViewEventType(r.eventType);
    return event ? [{ event, n: Number(r.n) }] : [];
  });
}

/** The media kind + owner a studio event is stamped with (narrow select —
 *  the public beacon must not load the project's canvas JSON). Null when the
 *  project does not exist (the retired video_analytics FK rejected those). */
export async function findStudioEventSubject(
  db: Db,
  projectId: string,
): Promise<{ artifactKind: ArtifactKind; ownerUserId: string } | null> {
  const [row] = await db
    .select({ mediaKind: schema.studioProjects.mediaKind, userId: schema.studioProjects.userId })
    .from(schema.studioProjects)
    .where(eq(schema.studioProjects.id, projectId))
    .limit(1);
  if (!row) return null;
  return { artifactKind: isArtifactKind(row.mediaKind) ? row.mediaKind : "video", ownerUserId: row.userId };
}
