/**
 * analytics-events.ts — SSoT wire contract for the ONE analytics ingestion
 * endpoint, `POST /api/analytics/events`.
 *
 * The body is either a single event (`{ kind, ...payload }`) or a batch
 * (`{ events: [{ kind, ...payload }, ...] }`). Each `kind` maps to one zod
 * schema here and one handler in api/src/services/analytics/event-kinds.ts,
 * which writes to the same table the retired per-surface beacons did:
 *
 *   usage          → usage_sessions / usage_events   (was /api/usage/track)
 *   activity       → activity_logs                   (was /api/analytics/beacon)
 *   ad             → activity_logs ad_impression/ad_click (was /api/analytics/ads/impression)
 *   artifact_view  → artifact_views                  (was /api/analytics/artifacts/beacon)
 *   job_view       → artifact_views (listing_view)   (was /api/artifact-metrics/track/job/:id)
 *   company_view   → artifact_views (listing_view)   (was /api/artifact-metrics/track/company/:id)
 *
 * Optional-auth: anonymous visitors and signed-in users both post; identity
 * (user id / roles), IP hash and geo always come from the request, never the
 * body. `navigator.sendBeacon` posts text/plain or a Blob, so the server
 * parses the raw body text rather than trusting the content-type.
 */
import { z } from "zod";
import { UuidLikeSchema } from "./validation.js";
import { TrackUsageSchema } from "./usage.js";
import { ARTIFACT_KINDS, type ArtifactKind } from "./artifact-views.js";

/** The single ingestion path. Clients resolve it to an absolute API URL. */
export const ANALYTICS_EVENTS_PATH = "/api/analytics/events";

/** Hard cap on events per request (a usage event itself batches ≤ 50). */
export const MAX_ANALYTICS_EVENTS_PER_REQUEST = 50;

export const ActivityEventSchema = z.object({
  kind: z.literal("activity"),
  event: z.string().max(100).default("pageview"),
  entityType: z.string().max(100).nullable().optional(),
  entityId: z.string().max(36).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const AdEventSchema = z.object({
  kind: z.literal("ad"),
  slotId: z.string().max(100).default("unknown"),
  action: z.enum(["impression", "click"]).default("impression"),
  page: z.string().max(2048).nullable().optional(),
});

export const ArtifactViewEventSchema = z.object({
  kind: z.literal("artifact_view"),
  artifactKind: z.enum(ARTIFACT_KINDS as unknown as [ArtifactKind, ...ArtifactKind[]]),
  artifactId: UuidLikeSchema,
  engagement: z.array(z.number()).optional(),
  totalEngagementSec: z.number().int().nonnegative().optional(),
  percentConsumed: z.number().min(0).max(1).optional(),
  dropOffBucket: z.number().int().nonnegative().nullable().optional(),
  viewerEmail: z.string().email().optional().nullable(),
  viewerCompany: z.string().max(255).optional().nullable(),
  referrer: z.string().max(2048).optional().nullable(),
});

export const UsageBatchEventSchema = TrackUsageSchema.extend({
  kind: z.literal("usage"),
});

export const JobViewEventSchema = z.object({
  kind: z.literal("job_view"),
  jobId: UuidLikeSchema,
  /** Acquisition source ("organic", "boost", …). */
  source: z.string().max(32).default("organic"),
});

export const CompanyViewEventSchema = z.object({
  kind: z.literal("company_view"),
  companyId: UuidLikeSchema,
  source: z.string().max(32).default("organic"),
});

export const ANALYTICS_EVENT_SCHEMAS = {
  usage: UsageBatchEventSchema,
  activity: ActivityEventSchema,
  ad: AdEventSchema,
  artifact_view: ArtifactViewEventSchema,
  job_view: JobViewEventSchema,
  company_view: CompanyViewEventSchema,
} as const;

export type AnalyticsEventKind = keyof typeof ANALYTICS_EVENT_SCHEMAS;
export const ANALYTICS_EVENT_KINDS = Object.keys(ANALYTICS_EVENT_SCHEMAS) as AnalyticsEventKind[];

/** Parsed (server-side) payload for one kind. */
export type AnalyticsEventOf<K extends AnalyticsEventKind> = z.infer<(typeof ANALYTICS_EVENT_SCHEMAS)[K]>;
/** Client-side input for one kind (defaults optional). */
export type AnalyticsEventInput<K extends AnalyticsEventKind = AnalyticsEventKind> =
  K extends AnalyticsEventKind ? z.input<(typeof ANALYTICS_EVENT_SCHEMAS)[K]> : never;

/** Request body: one event or a batch. */
export type AnalyticsEventsBody = AnalyticsEventInput | { events: AnalyticsEventInput[] };

/** Response body for `POST /api/analytics/events`. */
export interface AnalyticsEventsResult {
  accepted: number;
  rejected: number;
}
