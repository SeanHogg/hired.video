/**
 * Single source of truth for public-event shapes. Imported by both
 * backend (services/event/*, routes/events.ts) and frontend (Events
 * pages, EventCard, RSVP button, map popover) so the wire contract
 * can't drift.
 *
 * Storage: parent rows live on `scheduled_events` (calendar.ts) with
 * type IN ('event', 'coffee'); auxiliary tables in events.ts.
 *
 * See migration 0122_events_coffee_shared_tasks.sql for storage layout.
 */
import { z } from "zod";
import { UuidLikeSchema } from "./validation.js";
import { ContentLocationSetSchema } from "./content-locations.js";

// ─── Enums ─────────────────────────────────────────────────────────────

export const EVENT_TYPES = ["event", "coffee"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_VISIBILITY = ["public", "unlisted", "private"] as const;
export type EventVisibility = (typeof EVENT_VISIBILITY)[number];

export const EVENT_FORMAT = ["in_person", "remote", "hybrid"] as const;
export type EventFormat = (typeof EVENT_FORMAT)[number];

export const VIDEO_PROVIDER = ["zoom", "meet", "teams", "other"] as const;
export type VideoProvider = (typeof VIDEO_PROVIDER)[number];

export const RSVP_STATUS = [
  "going",
  "maybe",
  "declined",
  "waitlist",
  "cancelled",
] as const;
export type RsvpStatus = (typeof RSVP_STATUS)[number];

export const APPROVAL_STATUS = ["approved", "pending", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUS)[number];

export const REMINDER_KEYS = ["1w", "24h", "1h", "start"] as const;
export type ReminderKey = (typeof REMINDER_KEYS)[number];

/** Minutes before event start. Stays in sync with REMINDER_KEYS order. */
export const REMINDER_OFFSETS_MIN: Record<ReminderKey, number> = {
  "1w": 7 * 24 * 60,
  "24h": 24 * 60,
  "1h": 60,
  start: 0,
};

// ─── Custom registration questions (host-defined) ──────────────────────

export const RegistrationQuestionSchema = z.object({
  key: z.string().min(1).max(48),
  label: z.string().min(1).max(200),
  type: z.enum(["text", "textarea", "select", "checkbox"]),
  options: z.array(z.string().max(120)).optional(),
  required: z.boolean().default(false),
});
export type RegistrationQuestion = z.infer<typeof RegistrationQuestionSchema>;

// ─── Create / update event payloads ────────────────────────────────────

export const CreateEventSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(20_000).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string().max(100).default("UTC"),

  type: z.enum(EVENT_TYPES).default("event"),
  visibility: z.enum(EVENT_VISIBILITY).default("public"),
  eventFormat: z.enum(EVENT_FORMAT).default("in_person"),

  category: z.string().max(48).optional(),
  coverImageUrl: z.string().url().max(2048).optional(),

  // location may be free-text (legacy) AND/OR structured geo. The structured
  // set wins for map/radius search; free-text falls back for display only.
  location: z.string().max(500).optional(),
  geo: ContentLocationSetSchema.optional(),

  videoProvider: z.enum(VIDEO_PROVIDER).optional(),
  meetingUrl: z.string().url().max(2048).optional(),

  capacity: z.number().int().positive().max(100_000).optional(),
  allowsPlusOnes: z.boolean().default(false),
  requiresApproval: z.boolean().default(false),
  registrationQuestions: z.array(RegistrationQuestionSchema).max(15).optional(),
  matchmakingEnabled: z.boolean().default(true),

  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/i, "slug must be 3-80 chars, alphanumerics + hyphens, no leading/trailing hyphen")
    .optional(),

  coHostUserIds: z.array(UuidLikeSchema).max(10).default([]),
  publish: z.boolean().default(false),
});
export type CreateEventInput = z.infer<typeof CreateEventSchema>;

export const UpdateEventSchema = CreateEventSchema.partial().extend({
  cancelled: z.boolean().optional(),
});
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;

// ─── RSVP payloads ─────────────────────────────────────────────────────

export const RsvpSchema = z.object({
  status: z.enum(["going", "maybe", "declined", "cancelled"]),
  plusOneCount: z.number().int().min(0).max(20).default(0),
  customAnswers: z.record(z.string(), z.unknown()).optional(),
});
export type RsvpInput = z.infer<typeof RsvpSchema>;

export const GuestRsvpSchema = RsvpSchema.extend({
  guestEmail: z.string().email().max(255),
  guestName: z.string().max(255).optional(),
});
export type GuestRsvpInput = z.infer<typeof GuestRsvpSchema>;

// ─── Search filters ────────────────────────────────────────────────────

export const EventSearchFilterSchema = z.object({
  q: z.string().max(200).optional(),
  category: z.string().max(48).optional(),
  format: z.enum(EVENT_FORMAT).optional(),
  // Time window — defaults to "starting in the next 90 days".
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  // Location filter reuses the existing geo plumbing.
  countryId: z.number().int().positive().optional(),
  stateId: UuidLikeSchema.optional(),
  cityId: UuidLikeSchema.optional(),
  latitude: z.number().gte(-90).lte(90).optional(),
  longitude: z.number().gte(-180).lte(180).optional(),
  radiusKm: z.number().int().positive().max(20_000).optional(),
  hostUserId: UuidLikeSchema.optional(),
  matchmakingOnly: z.boolean().optional(),
  // 'upcoming' | 'past' | 'all'  — defaults to upcoming.
  scope: z.enum(["upcoming", "past", "all"]).default("upcoming"),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().min(0).max(10_000).default(0),
});
export type EventSearchFilter = z.infer<typeof EventSearchFilterSchema>;

// ─── Resolved DTO returned to the client ───────────────────────────────

export interface ResolvedEvent {
  id: string;
  type: EventType;
  visibility: EventVisibility;
  eventFormat: EventFormat;
  title: string;
  description: string | null;
  slug: string | null;
  category: string | null;
  coverImageUrl: string | null;
  startAt: string;
  endAt: string;
  timezone: string | null;
  location: string | null;
  meetingUrl: string | null;
  videoProvider: VideoProvider | null;
  capacity: number | null;
  attendeeCount: number;
  waitlistCount: number;
  allowsPlusOnes: boolean;
  requiresApproval: boolean;
  matchmakingEnabled: boolean;
  hostUserId: string;
  hostName: string | null;
  hostAvatarUrl: string | null;
  /** #1260 — true when the host has a verified account; drives the
   *  verification check rendered next to the host name on the detail page. */
  hostIsVerified: boolean;
  coHosts: Array<{ userId: string; name: string | null; avatarUrl: string | null }>;
  registrationQuestions: RegistrationQuestion[] | null;
  publishedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Viewer-relative: present only when a logged-in viewer is resolving.
  viewerRsvp?: {
    status: RsvpStatus;
    approvalStatus: ApprovalStatus;
    plusOneCount: number;
  } | null;
  viewerIsHost?: boolean;
  viewerIsCoHost?: boolean;
}

/** Slug generator used by the create flow when the host didn't pick one. */
export function generateEventSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  // Suffix with a 6-char random base36 chunk to avoid collisions without
  // a uniqueness probe loop.
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "event"}-${suffix}`;
}

/**
 * RSVP capacity outcome. Pure helper so service + UI can preview the
 * outcome before the network round-trip ("RSVP'ing now would put you
 * on the waitlist").
 */
export function computeRsvpOutcome(
  capacity: number | null,
  attendeeCount: number,
  requesterAlreadyGoing: boolean,
): "going" | "waitlist" {
  if (capacity == null) return "going";
  if (requesterAlreadyGoing) return "going";
  return attendeeCount >= capacity ? "waitlist" : "going";
}
