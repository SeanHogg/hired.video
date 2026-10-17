/**
 * event-kinds.ts — kind → (schema, handler) registry behind the ONE
 * analytics ingestion endpoint, `POST /api/analytics/events`.
 *
 * The wire schemas are the SSoT in shared/analytics-events.ts; this file
 * binds each kind to the writer that owns its table (the same services /
 * repositories the retired per-surface beacons used). Adding a new event
 * kind = one schema in shared + one entry here.
 *
 * Every handler is best-effort: ingestion never fails the client, so the
 * dispatcher swallows handler errors and only counts accepted / rejected.
 */
import type { ZodTypeAny } from "zod";
import {
  ANALYTICS_EVENT_SCHEMAS,
  MAX_ANALYTICS_EVENTS_PER_REQUEST,
  type AnalyticsEventKind,
  type AnalyticsEventOf,
  type AnalyticsEventsResult,
} from "../../../../shared/analytics-events.js";
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { ListingViewsRepository, type ViewEventInsert } from "../../repositories/listingViewsRepository.js";
import { UsageService } from "../usage/UsageService.js";
import { recordArtifactView } from "./artifactView.js";
import { lookupArtifactOwner } from "./artifactAnalytics.js";

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

interface EventKindDef<K extends AnalyticsEventKind> {
  schema: ZodTypeAny;
  handle(event: AnalyticsEventOf<K>, ctx: AnalyticsRequestContext): Promise<void>;
}

type Registry = { [K in AnalyticsEventKind]: EventKindDef<K> };

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

export const EVENT_KINDS: Registry = {
  usage: {
    schema: ANALYTICS_EVENT_SCHEMAS.usage,
    async handle(e, ctx) {
      const { kind: _kind, ...batch } = e;
      await new UsageService(buildRepos(getDb()).usageTracking).recordBatch(batch, {
        userId: ctx.userId,
        roles: ctx.roles,
        country: ctx.countryHeader,
        userAgent: ctx.userAgent,
      });
    },
  },
  activity: {
    schema: ANALYTICS_EVENT_SCHEMAS.activity,
    async handle(e, ctx) {
      await buildRepos(getDb()).audit.insertActivity({
        userId: ctx.userId,
        action: e.event,
        entityType: e.entityType ?? null,
        entityId: (e.entityId ?? null) as string | null,
        metadata: e.metadata ?? null,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      } as never);
    },
  },
  ad: {
    schema: ANALYTICS_EVENT_SCHEMAS.ad,
    async handle(e, ctx) {
      await buildRepos(getDb()).audit.insertActivity({
        userId: ctx.userId,
        action: e.action === "click" ? "ad_click" : "ad_impression",
        entityType: "ad_slot",
        entityId: null,
        metadata: { slotId: e.slotId, page: e.page ?? null },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      } as never);
    },
  },
  artifact_view: {
    schema: ANALYTICS_EVENT_SCHEMAS.artifact_view,
    async handle(e, ctx) {
      // Owner is resolved server-side per kind so the client can't spoof
      // attribution.
      const ownerUserId = await lookupArtifactOwner(e.artifactKind, e.artifactId);
      await recordArtifactView({
        artifactKind: e.artifactKind,
        artifactId: e.artifactId,
        ownerUserId,
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
    },
  },
  job_view: {
    schema: ANALYTICS_EVENT_SCHEMAS.job_view,
    async handle(e, ctx) {
      await new ListingViewsRepository(getDb()).insertJobView(e.jobId, listingView(ctx, e.source));
    },
  },
  company_view: {
    schema: ANALYTICS_EVENT_SCHEMAS.company_view,
    async handle(e, ctx) {
      await new ListingViewsRepository(getDb()).insertCompanyView(e.companyId, listingView(ctx, e.source));
    },
  },
};

function isKind(v: unknown): v is AnalyticsEventKind {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(EVENT_KINDS, v);
}

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

/** Validate + dispatch each event to its kind's handler. Never throws. */
export async function ingestAnalyticsEvents(
  events: unknown[],
  ctx: AnalyticsRequestContext,
): Promise<AnalyticsEventsResult> {
  let accepted = 0;
  let rejected = 0;
  await Promise.all(
    events.map(async (raw) => {
      const kind = raw && typeof raw === "object" ? (raw as { kind?: unknown }).kind : undefined;
      if (!isKind(kind)) {
        rejected++;
        return;
      }
      const def = EVENT_KINDS[kind] as EventKindDef<AnalyticsEventKind>;
      const parsed = def.schema.safeParse(raw);
      if (!parsed.success) {
        rejected++;
        return;
      }
      accepted++;
      await def.handle(parsed.data, ctx).catch(() => undefined);
    }),
  );
  return { accepted, rejected };
}
