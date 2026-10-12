/**
 * Usage tracking — shared SSoT for the page/session/event analytics that feed
 * the "who is active, engage them" surface (#2043-2046). Both the client
 * tracker (frontend/lib/usage-tracker.ts) and the ingestion route import from
 * here so the wire shape can't drift.
 *
 * Privacy: marketing-visitor tracking is consent-gated client-side; the payload
 * carries the consent flag and the server stores nothing when it's false.
 */
import { z } from "zod";

/** Event kinds we record. `feature_key` aligns with the Feature Registry keys
 *  (nav:/tool:/module:) so per-role/per-feature usage reuses one vocabulary. */
export const USAGE_EVENT_TYPES = [
  "page_view",
  "search",
  "tool_run",
  "feature_open",
  "cta_click",
] as const;
export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];

export const UsageEventSchema = z.object({
  type: z.enum(USAGE_EVENT_TYPES),
  path: z.string().max(2048).default(""),
  /** Feature Registry key when the event is about a gated surface. */
  featureKey: z.string().max(200).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  /** Client ISO timestamp; server clamps to now() if absent/invalid. */
  occurredAt: z.string().datetime().optional(),
});
export type UsageEventInput = z.infer<typeof UsageEventSchema>;

export const UsageContextSchema = z.object({
  entryPath: z.string().max(2048).optional(),
  referrer: z.string().max(2048).optional(),
  utmSource: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
});
export type UsageContextInput = z.infer<typeof UsageContextSchema>;

/** Batched beacon body. `visitorId` is a first-party cookie id; `consent`
 *  reflects the client's analytics-consent state (server drops the batch when
 *  false). Capped at 50 events/batch to bound a single request. */
export const TrackUsageSchema = z.object({
  visitorId: z.string().min(8).max(64),
  consent: z.boolean(),
  context: UsageContextSchema.optional(),
  events: z.array(UsageEventSchema).min(1).max(50),
});
export type TrackUsageInput = z.infer<typeof TrackUsageSchema>;

/** A presence row for the staff "active now" view. */
export interface ActiveSessionDto {
  sessionId: string;
  visitorId: string;
  userId: string | null;
  isAuthenticated: boolean;
  role: string | null;
  lastSeen: string;
  entryPath: string | null;
  country: string | null;
  lastEventType: string | null;
  lastPath: string | null;
}

/** Default presence window — a session is "active" if seen within this many
 *  minutes. */
export const ACTIVE_WINDOW_MINUTES = 5;

// ── Traffic + funnels (admin read side) ─────────────────────────────────────

/** Look-back windows the admin traffic view offers. */
export const TRAFFIC_WINDOW_DAYS = [7, 30, 90] as const;
export type TrafficWindowDays = (typeof TRAFFIC_WINDOW_DAYS)[number];

export function toTrafficWindow(raw: unknown): TrafficWindowDays {
  const n = Number(raw);
  return (TRAFFIC_WINDOW_DAYS as readonly number[]).includes(n) ? (n as TrafficWindowDays) : 30;
}

/** One day of traffic. `visitors` = distinct visitor sessions with any event;
 *  `signedIn` = those linked to a user. */
export interface TrafficPointDto {
  day: string;
  visitors: number;
  signedIn: number;
  pageViews: number;
}

/** Top entry paths + referrers for sessions first seen in the window. */
export interface TrafficSourceDto {
  key: string;
  visitors: number;
}

export interface TrafficReportDto {
  days: TrafficWindowDays;
  series: TrafficPointDto[];
  entryPaths: TrafficSourceDto[];
  referrers: TrafficSourceDto[];
  utmSources: TrafficSourceDto[];
}

/** What a funnel step matches in usage_events. Every given field must match.
 *  `paths` matches a page path exactly or as a prefix segment ("/studio"
 *  matches "/studio/abc"); `stage` matches payload.stage. */
export interface FunnelStepMatch {
  type?: UsageEventType;
  paths?: readonly string[];
  featureKey?: string;
  stage?: string;
}

export interface FunnelStepDefinition {
  id: string;
  labelKey: string;
  match: FunnelStepMatch;
}

export interface FunnelDefinition {
  id: string;
  labelKey: string;
  steps: readonly FunnelStepDefinition[];
}

/** Feature key the job-seeker journey's stage events carry. */
export const JOB_SEEKER_FUNNEL_KEY = "funnel.jobseeker";
/** Stages the client emits via trackFunnelStage(JOB_SEEKER_FUNNEL_KEY, …). */
export type JobSeekerFunnelStage = "resume_created" | "signed_up" | "exported" | "published";
/** Feature key of the anonymous studio-create funnel (lib/studio/anon-conversion). */
export const STUDIO_FUNNEL_FEATURE_KEY = "studio.anon-create";

/**
 * Funnel registry — a new funnel is a new entry here, never a new branch in
 * the reader. A visitor counts at step N only if they reached step N-1 first
 * (sequential, per visitor, inside the window).
 */
export const USAGE_FUNNELS: readonly FunnelDefinition[] = [
  {
    id: "jobseeker",
    labelKey: "admin.traffic.funnel.jobseeker.title",
    steps: [
      { id: "visit", labelKey: "admin.traffic.funnel.jobseeker.visit", match: { type: "page_view" } },
      { id: "build", labelKey: "admin.traffic.funnel.jobseeker.build", match: { type: "page_view", paths: ["/studio"] } },
      { id: "resume_created", labelKey: "admin.traffic.funnel.jobseeker.resumeCreated", match: { featureKey: JOB_SEEKER_FUNNEL_KEY, stage: "resume_created" } },
      { id: "signed_up", labelKey: "admin.traffic.funnel.jobseeker.signedUp", match: { featureKey: JOB_SEEKER_FUNNEL_KEY, stage: "signed_up" } },
      { id: "exported", labelKey: "admin.traffic.funnel.jobseeker.exported", match: { featureKey: JOB_SEEKER_FUNNEL_KEY, stage: "exported" } },
      { id: "published", labelKey: "admin.traffic.funnel.jobseeker.published", match: { featureKey: JOB_SEEKER_FUNNEL_KEY, stage: "published" } },
    ],
  },
  {
    id: "studio-anon",
    labelKey: "admin.traffic.funnel.studio.title",
    steps: [
      { id: "enter", labelKey: "admin.traffic.funnel.studio.enter", match: { featureKey: STUDIO_FUNNEL_FEATURE_KEY, stage: "enter" } },
      { id: "edit", labelKey: "admin.traffic.funnel.studio.edit", match: { featureKey: STUDIO_FUNNEL_FEATURE_KEY, stage: "edit" } },
      { id: "gate", labelKey: "admin.traffic.funnel.studio.gate", match: { featureKey: STUDIO_FUNNEL_FEATURE_KEY, stage: "gate" } },
      { id: "convert", labelKey: "admin.traffic.funnel.studio.convert", match: { featureKey: STUDIO_FUNNEL_FEATURE_KEY, stage: "convert" } },
    ],
  },
];

export function findFunnel(id: string): FunnelDefinition | undefined {
  return USAGE_FUNNELS.find((f) => f.id === id);
}

export interface FunnelStepResultDto {
  id: string;
  labelKey: string;
  visitors: number;
}

export interface FunnelReportDto {
  funnelId: string;
  labelKey: string;
  days: TrafficWindowDays;
  steps: FunnelStepResultDto[];
}
