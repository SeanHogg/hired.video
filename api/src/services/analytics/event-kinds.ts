/**
 * event-kinds.ts — validation + batched dispatch behind the ONE analytics
 * ingestion endpoint, `POST /api/analytics/events`.
 *
 * The wire schemas are the SSoT in shared/analytics-events.ts. A request
 * carries up to 50 events; they are validated one by one, grouped by kind,
 * and folded into per-TABLE batch writes (analyticsIngestSink.ts) so a full
 * beacon costs a constant number of statements:
 *
 *   activity + ad          → ONE activity_logs INSERT
 *   artifact_view          → ONE owner lookup per owner source (IN-list)
 *   artifact_view + job_view + company_view → ONE artifact_views INSERT
 *   usage                  → one session upsert + one events INSERT per
 *                            distinct visitor (batches merged per visitor)
 *
 * Adding a new event kind = one schema in shared + one row mapper here.
 *
 * Ingestion is best-effort: it never fails the client. Each table write is
 * isolated (a failed activity insert doesn't drop the views) and only
 * logged; the response counts accepted / rejected exactly as before.
 */
import type { ZodType } from "zod";
import {
  ANALYTICS_EVENT_SCHEMAS,
  MAX_ANALYTICS_EVENTS_PER_REQUEST,
  type AnalyticsEventKind,
  type AnalyticsEventOf,
  type AnalyticsEventsResult,
} from "../../../../shared/analytics-events.js";
import { UUID_LIKE_REGEX } from "../../../../shared/validation.js";
import type { ActivityLogInsert } from "../../repositories/auditRepository.js";
import { listingViewRow, type ViewEventInsert } from "../../repositories/listingViewsRepository.js";
import { logger } from "../../lib/logger.js";
import { buildArtifactViewRow, type NewArtifactView } from "./artifactView.js";
import { artifactRefKey } from "./artifactOwners.js";
import { liveAnalyticsIngestSink, type AnalyticsIngestSink } from "./analyticsIngestSink.js";

/** Request-derived identity + network context (never trusted from the body). */
export interface AnalyticsRequestContext {
  userId: string | null;
  roles: readonly string[] | null;
  /** Raw client IP (activity_logs keeps it, as before). */
  ipAddress: string | null;
  /** Daily-salted IP bucket (artifact_views). */
  ipHash: string | null;
  /** Edge-verified country (request.cf) with header fallback. */
  ipCountry: string | null;
  /** cf-ipcountry header (usage sessions, listing views). */
  countryHeader: string | null;
  region: string | null;
  userAgent: string | null;
  referer: string | null;
}

/** Validated events, grouped by kind. */
export type EventsByKind = { [K in AnalyticsEventKind]: AnalyticsEventOf<K>[] };

/** Postgres `integer` upper bound — a larger value would fail the whole
 *  multi-row INSERT, so such an event is dropped on its own (as the old
 *  per-event insert did implicitly). */
const PG_INT_MAX = 2_147_483_647;

function isKind(v: unknown): v is AnalyticsEventKind {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ANALYTICS_EVENT_SCHEMAS, v);
}

function emptyByKind(): EventsByKind {
  return { usage: [], activity: [], ad: [], artifact_view: [], job_view: [], company_view: [] };
}

function collect<K extends AnalyticsEventKind>(kind: K, raw: unknown, into: EventsByKind): boolean {
  const schema = ANALYTICS_EVENT_SCHEMAS[kind] as unknown as ZodType<AnalyticsEventOf<K>>;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return false;
  (into[kind] as AnalyticsEventOf<K>[]).push(parsed.data);
  return true;
}

/** Validate each raw event against its kind's schema (pure). */
export function classifyEvents(events: readonly unknown[]): AnalyticsEventsResult & { byKind: EventsByKind } {
  const byKind = emptyByKind();
  let accepted = 0;
  let rejected = 0;
  for (const raw of events) {
    const kind = raw && typeof raw === "object" ? (raw as { kind?: unknown }).kind : undefined;
    if (isKind(kind) && collect(kind, raw, byKind)) accepted++;
    else rejected++;
  }
  return { accepted, rejected, byKind };
}

// ─── Row mappers (pure) ──────────────────────────────────────────────────────

/** activity + ad events → activity_logs rows. An `activity` event whose
 *  entityId isn't UUID-shaped is skipped (activity_logs.entity_id is a uuid
 *  column; it would otherwise fail every other row in the batch insert). */
export function activityRows(byKind: EventsByKind, ctx: AnalyticsRequestContext): ActivityLogInsert[] {
  const rows: ActivityLogInsert[] = [];
  for (const e of byKind.activity) {
    const entityId = e.entityId ?? null;
    if (entityId !== null && !UUID_LIKE_REGEX.test(entityId)) continue;
    rows.push({
      userId: ctx.userId,
      action: e.event,
      entityType: e.entityType ?? null,
      entityId,
      metadata: e.metadata ?? null,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }
  for (const e of byKind.ad) {
    rows.push({
      userId: ctx.userId,
      action: e.action === "click" ? "ad_click" : "ad_impression",
      entityType: "ad_slot",
      entityId: null,
      metadata: { slotId: e.slotId, page: e.page ?? null },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }
  return rows;
}

function listingView(ctx: AnalyticsRequestContext, source: string): ViewEventInsert {
  return {
    viewerUserId: ctx.userId,
    countryCode: ctx.countryHeader,
    region: ctx.region,
    referrer: ctx.referer,
    source: source.slice(0, 32),
    userAgent: ctx.userAgent?.slice(0, 512) ?? null,
  };
}

/** artifact_view (owner-stamped, owner self-views skipped) + job_view +
 *  company_view → artifact_views rows. `owners` is keyed by artifactRefKey. */
export function artifactViewRows(
  byKind: EventsByKind,
  owners: ReadonlyMap<string, string | null>,
  ctx: AnalyticsRequestContext,
): NewArtifactView[] {
  const rows: NewArtifactView[] = [];
  for (const e of byKind.artifact_view) {
    if ((e.totalEngagementSec ?? 0) > PG_INT_MAX || (e.dropOffBucket ?? 0) > PG_INT_MAX) continue;
    const row = buildArtifactViewRow({
      artifactKind: e.artifactKind,
      artifactId: e.artifactId,
      ownerUserId: owners.get(artifactRefKey(e.artifactKind, e.artifactId)) ?? null,
      viewerId: ctx.userId,
      viewerEmail: e.viewerEmail ?? null,
      viewerCompany: e.viewerCompany ?? null,
      ipHash: ctx.ipHash,
      ipCountry: ctx.ipCountry,
      referrer: e.referrer ?? ctx.referer,
      userAgent: ctx.userAgent,
      engagement: e.engagement ?? null,
      engagementUnit: e.artifactKind === "video" ? "s" : "%",
      totalEngagementSec: e.totalEngagementSec ?? 0,
      percentConsumed: e.percentConsumed ?? 0,
      dropOffBucket: e.dropOffBucket ?? null,
    });
    if (row) rows.push(row);
  }
  for (const e of byKind.job_view) rows.push(listingViewRow("job", e.jobId, listingView(ctx, e.source)));
  for (const e of byKind.company_view) {
    rows.push(listingViewRow("company", e.companyId, listingView(ctx, e.source)));
  }
  return rows;
}

// ─── Body parsing + dispatch ─────────────────────────────────────────────────

/**
 * Parse a raw request body (text — sendBeacon posts text/plain or a Blob,
 * so the content-type can't be trusted) into a list of candidate events.
 * Returns null when the body is not a JSON object.
 */
export function parseEventsBody(raw: string): unknown[] | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  // A single event carries `kind`; only a kind-less body is a batch envelope
  // (the `usage` kind has its own nested `events` array).
  if (!("kind" in obj) && Array.isArray(obj.events)) {
    return obj.events.slice(0, MAX_ANALYTICS_EVENTS_PER_REQUEST);
  }
  return [obj];
}

async function isolated(table: string, write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (err) {
    logger.warn("[analytics] batch write failed", { table, error: err });
  }
}

/** Validate + batch-write a request's events. Never throws. */
export async function ingestAnalyticsEvents(
  events: unknown[],
  ctx: AnalyticsRequestContext,
  sink: AnalyticsIngestSink = liveAnalyticsIngestSink(),
): Promise<AnalyticsEventsResult> {
  const { accepted, rejected, byKind } = classifyEvents(events);
  if (accepted === 0) return { accepted, rejected };

  const activity = activityRows(byKind, ctx);
  const writes: Promise<void>[] = [];
  if (activity.length > 0) writes.push(isolated("activity_logs", () => sink.insertActivities(activity)));

  const hasViews = byKind.artifact_view.length + byKind.job_view.length + byKind.company_view.length > 0;
  if (hasViews) {
    writes.push(
      isolated("artifact_views", async () => {
        // Owner is resolved server-side so the client can't spoof attribution.
        const refs = byKind.artifact_view.map((e) => ({ kind: e.artifactKind, id: e.artifactId }));
        const owners = refs.length > 0 ? await sink.lookupOwners(refs) : new Map<string, string | null>();
        await sink.insertArtifactViews(artifactViewRows(byKind, owners, ctx));
      }),
    );
  }

  if (byKind.usage.length > 0) {
    writes.push(
      isolated("usage", () =>
        sink.recordUsage(byKind.usage, {
          userId: ctx.userId,
          roles: ctx.roles,
          country: ctx.countryHeader,
          userAgent: ctx.userAgent,
        }),
      ),
    );
  }

  await Promise.all(writes);
  return { accepted, rejected };
}
