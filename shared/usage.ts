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
