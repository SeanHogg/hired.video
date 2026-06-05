/**
 * Bookings & Reservations — shared types, Zod schemas, and a pure
 * slot-grid resolver.
 *
 * Imported by both api/src and frontend so wire contracts + slot-grid
 * logic never drift between the two.
 *
 * Reference: docs/prd/bookings-and-reservations.md, gap #1648.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants — kept in lockstep with api/src/db/schema/bookings.ts.
// ---------------------------------------------------------------------------
export const BOOKING_DURATIONS_MINUTES = [30, 60, 90, 120] as const;
export type BookingDurationMinutes = (typeof BOOKING_DURATIONS_MINUTES)[number];

export const RESERVATION_STATUSES = [
  "pending_payment",
  "confirmed",
  "cancelled_by_host",
  "cancelled_by_booker",
  "no_show",
  "completed",
  "refunded",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const AVAILABILITY_OVERRIDE_KINDS = ["add", "block"] as const;
export type AvailabilityOverrideKind = (typeof AVAILABILITY_OVERRIDE_KINDS)[number];

export const BOOKING_AUTHOR_KINDS = ["host", "booker"] as const;
export type BookingAuthorKind = (typeof BOOKING_AUTHOR_KINDS)[number];

// Default platform fee on booking revenue. Matches creator_profiles.platform_fee_bps
// default (500 = 5%). Per-host override applies via creator_profiles when set.
export const DEFAULT_BOOKING_PLATFORM_FEE_BPS = 500;

// Slot-grid resolution window cap. 60 days is enough for any sensible UI;
// beyond that callers paginate. Caps the per-request compute + cache size.
export const MAX_AVAILABILITY_WINDOW_DAYS = 60;

// ---------------------------------------------------------------------------
// Wire types.
// ---------------------------------------------------------------------------
export interface BookingOfferingDTO {
  id: string;
  slug: string;
  name: string;
  durationMinutes: BookingDurationMinutes;
  priceCents: number;
  currency: string;
  descriptionMd: string;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  isActive: boolean;
  displayOrder: number;
}

export interface AvailabilityRuleDTO {
  id: string;
  weekday: number;
  startTimeLocal: string;
  endTimeLocal: string;
  effectiveFromDate: string | null;
  effectiveUntilDate: string | null;
}

export interface AvailabilityOverrideDTO {
  id: string;
  dateLocal: string;
  startTimeLocal: string;
  endTimeLocal: string;
  kind: AvailabilityOverrideKind;
  reason: string | null;
}

// Slot returned to the public slot grid. NEVER includes booker identity.
// Owner-only details flow through ReservationDetailDTO on a separate path.
export interface PublicSlotDTO {
  slotStartUtc: string;
  slotEndUtc: string;
  status: "available" | "booked";
}

export interface PublicHostProfileDTO {
  handle: string;
  displayName: string;
  bio: string | null;
  timezone: string;
  avatarUrl: string | null;
  offerings: BookingOfferingDTO[];
}

// Wide reservation shape — host-only (or booker via magic-link token).
export interface ReservationDetailDTO {
  id: string;
  hostUserId: string;
  hostHandle: string;
  hostDisplayName: string;
  offeringId: string | null;
  offeringName: string;
  durationMinutes: BookingDurationMinutes;
  slotStartUtc: string;
  slotEndUtc: string;
  bookerEmail: string;
  bookerName: string;
  bookerPhone: string | null;
  status: ReservationStatus;
  amountCents: number;
  platformFeeCents: number;
  currency: string;
  videoConferenceLink: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
}

export interface ReservationSummaryDTO {
  id: string;
  offeringName: string;
  durationMinutes: BookingDurationMinutes;
  slotStartUtc: string;
  slotEndUtc: string;
  bookerName: string;
  bookerEmail: string;
  status: ReservationStatus;
  amountCents: number;
  currency: string;
}

export interface BookingCommentDTO {
  id: string;
  reservationId: string;
  authorKind: BookingAuthorKind;
  authorDisplayName: string;
  bodyMd: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Zod schemas — request validation.
// ---------------------------------------------------------------------------

const slugRe = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export const BookingOfferingInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().regex(slugRe, "slug must be lowercase kebab-case").max(64),
  durationMinutes: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
  priceCents: z.number().int().min(0).max(1_000_000_00),
  currency: z.string().length(3).default("USD"),
  descriptionMd: z.string().max(8000).default(""),
  videoConferenceLink: z.string().url().max(2048).nullable().optional(),
  bufferBeforeMinutes: z.number().int().min(0).max(240).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(240).default(0),
  displayOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});
export type BookingOfferingInput = z.infer<typeof BookingOfferingInputSchema>;

const HHmm = /^([01]\d|2[0-3]):[0-5]\d$/;
const HHmmss = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

export const AvailabilityRuleInputSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTimeLocal: z.string().regex(HHmm),
  endTimeLocal: z.string().regex(HHmm),
  effectiveFromDate: z.string().regex(dateOnly).nullable().optional(),
  effectiveUntilDate: z.string().regex(dateOnly).nullable().optional(),
}).refine((r) => r.endTimeLocal > r.startTimeLocal, {
  message: "endTimeLocal must be after startTimeLocal",
});
export type AvailabilityRuleInput = z.infer<typeof AvailabilityRuleInputSchema>;

export const AvailabilityOverrideInputSchema = z.object({
  dateLocal: z.string().regex(dateOnly),
  startTimeLocal: z.string().regex(HHmm),
  endTimeLocal: z.string().regex(HHmm),
  kind: z.enum(["add", "block"]),
  reason: z.string().max(255).nullable().optional(),
}).refine((r) => r.endTimeLocal > r.startTimeLocal, {
  message: "endTimeLocal must be after startTimeLocal",
});
export type AvailabilityOverrideInput = z.infer<typeof AvailabilityOverrideInputSchema>;

export const CreateReservationInputSchema = z.object({
  hostHandle: z.string().trim().min(1).max(64),
  offeringSlug: z.string().trim().min(1).max(64),
  slotStartUtc: z.string().datetime(),
  bookerEmail: z.string().email().max(320),
  bookerName: z.string().trim().min(1).max(255),
  bookerPhone: z.string().trim().max(40).nullable().optional(),
});
export type CreateReservationInput = z.infer<typeof CreateReservationInputSchema>;

export const AddCommentInputSchema = z.object({
  bodyMd: z.string().trim().min(1).max(4000),
});
export type AddCommentInput = z.infer<typeof AddCommentInputSchema>;

export const RescheduleReservationInputSchema = z.object({
  slotStartUtc: z.string().datetime(),
});
export type RescheduleReservationInput = z.infer<typeof RescheduleReservationInputSchema>;

export const CancelReservationInputSchema = z.object({
  reason: z.string().max(2000).nullable().optional(),
});
export type CancelReservationInput = z.infer<typeof CancelReservationInputSchema>;

// ---------------------------------------------------------------------------
// Pure slot-grid resolver — single seam, used by API + tests.
//
// Given a host's recurring rules + one-off overrides + busy windows
// from confirmed reservations, project a list of bookable slots for
// a service of `slotMinutes` length (incl. buffers) over `[from, to)`.
//
// Times in the rules / overrides are LOCAL to `timezone` (IANA name).
// Slots are returned in UTC ISO strings.
//
// This is the function the AvailabilityService wraps with caching.
// ---------------------------------------------------------------------------

export interface AvailabilityResolverInputs {
  /** IANA timezone of the host, e.g. "America/Los_Angeles". */
  timezone: string;
  /** Recurring weekly rules. */
  rules: Array<{
    weekday: number;
    startTimeLocal: string; // "HH:mm" or "HH:mm:ss"
    endTimeLocal: string;
    effectiveFromDate?: string | null;
    effectiveUntilDate?: string | null;
  }>;
  /** Per-date overrides — adds and blocks. */
  overrides: Array<{
    dateLocal: string; // "YYYY-MM-DD"
    startTimeLocal: string;
    endTimeLocal: string;
    kind: AvailabilityOverrideKind;
  }>;
  /** Reservations the host is already committed to (UTC, busy windows). */
  busyWindows: Array<{ startUtc: string; endUtc: string }>;
  /** Date range to project [fromUtc, toUtc). Cap is MAX_AVAILABILITY_WINDOW_DAYS. */
  fromUtc: string;
  toUtc: string;
  /** Length of slot to publish, including the host's pre/post buffers. */
  slotMinutes: number;
  /** Step between candidate slot starts. Defaults to slotMinutes. */
  stepMinutes?: number;
}

export interface ResolvedSlot {
  slotStartUtc: string;
  slotEndUtc: string;
}

/**
 * Project a host's availability into a list of bookable slots over a
 * time range. Returned slots are pre-filtered against busy windows.
 *
 * Implementation notes:
 *   - We iterate per LOCAL day (host timezone) and project each day's
 *     base availability (rule intersect override-block plus override-add).
 *   - Slots step by `stepMinutes` and must fit entirely within the
 *     available window. Buffers are encoded in the caller's slotMinutes
 *     (so a 60-min service with 5-min pre/post buffers asks for 70).
 *   - A slot collides if it overlaps ANY busy window (half-open intervals).
 */
export function resolveAvailableSlots(input: AvailabilityResolverInputs): ResolvedSlot[] {
  const {
    timezone,
    rules,
    overrides,
    busyWindows,
    fromUtc,
    toUtc,
    slotMinutes,
    stepMinutes = slotMinutes,
  } = input;

  if (slotMinutes <= 0) return [];
  if (stepMinutes <= 0) return [];
  const fromMs = Date.parse(fromUtc);
  const toMs = Date.parse(toUtc);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return [];
  if (toMs - fromMs > MAX_AVAILABILITY_WINDOW_DAYS * 86_400_000) {
    throw new RangeError(
      `Availability window exceeds ${MAX_AVAILABILITY_WINDOW_DAYS} days`,
    );
  }

  // Normalise busy windows once.
  const busy = busyWindows
    .map((w) => ({ start: Date.parse(w.startUtc), end: Date.parse(w.endUtc) }))
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start)
    .sort((a, b) => a.start - b.start);

  const overridesByDate = new Map<string, typeof overrides>();
  for (const o of overrides) {
    const list = overridesByDate.get(o.dateLocal) ?? [];
    list.push(o);
    overridesByDate.set(o.dateLocal, list);
  }

  const out: ResolvedSlot[] = [];
  const slotMs = slotMinutes * 60_000;
  const stepMs = stepMinutes * 60_000;

  // Iterate local days that intersect [fromMs, toMs). Use the host's
  // calendar day in `timezone` to anchor rule weekdays + override dates.
  for (const dayLocalIso of iterateLocalDays(fromMs, toMs, timezone)) {
    const weekday = weekdayFromLocalDate(dayLocalIso, timezone); // 0..6
    const intervals = baseIntervalsForDay(
      dayLocalIso,
      weekday,
      rules,
      overridesByDate.get(dayLocalIso) ?? [],
    );

    for (const { startLocal, endLocal } of intervals) {
      const startMs = localTimeToUtcMs(dayLocalIso, startLocal, timezone);
      const endMs = localTimeToUtcMs(dayLocalIso, endLocal, timezone);
      for (let t = startMs; t + slotMs <= endMs; t += stepMs) {
        if (t < fromMs || t + slotMs > toMs) continue;
        if (overlapsBusy(t, t + slotMs, busy)) continue;
        out.push({
          slotStartUtc: new Date(t).toISOString(),
          slotEndUtc: new Date(t + slotMs).toISOString(),
        });
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Helpers — internal.
// ---------------------------------------------------------------------------

function overlapsBusy(
  startMs: number,
  endMs: number,
  busy: Array<{ start: number; end: number }>,
): boolean {
  for (const b of busy) {
    if (b.end <= startMs) continue;
    if (b.start >= endMs) return false;
    return true;
  }
  return false;
}

/**
 * Compute the LOCAL calendar date (YYYY-MM-DD) in `timezone` for a UTC ms.
 * Uses Intl.DateTimeFormat with the en-CA locale which always emits
 * ISO YYYY-MM-DD.
 */
function localDateIso(utcMs: number, timezone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(utcMs));
}

function iterateLocalDays(fromMs: number, toMs: number, timezone: string): string[] {
  const days: string[] = [];
  let cursor = fromMs;
  let lastDay = "";
  // Step in 12-hour chunks to safely handle DST transitions while
  // discovering every distinct local-day string.
  while (cursor < toMs + 86_400_000) {
    const d = localDateIso(cursor, timezone);
    if (d !== lastDay) {
      days.push(d);
      lastDay = d;
    }
    cursor += 12 * 3_600_000;
  }
  return days;
}

function weekdayFromLocalDate(dateLocalIso: string, timezone: string): number {
  // Map ISO date to a stable UTC noon timestamp, then read the weekday in
  // the host's timezone. Noon avoids edge cases around DST cutovers.
  const ms = localTimeToUtcMs(dateLocalIso, "12:00", timezone);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const short = fmt.format(new Date(ms));
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[short] ?? 0;
}

/**
 * Convert a local wall-clock time on `dateLocalIso` in `timezone` to a UTC ms.
 *
 * Works without a third-party tz library by:
 *   1. Computing the UTC ms that LOOKS like the desired wall-clock when read in `timezone`,
 *   2. Adjusting by the discovered offset.
 *
 * The two-step adjustment handles ambiguity around DST cutovers within
 * minute-level accuracy — sufficient for slot grids that work in 5-min steps.
 */
function localTimeToUtcMs(
  dateLocalIso: string,
  timeLocal: string,
  timezone: string,
): number {
  const [Y, M, D] = dateLocalIso.split("-").map((s) => Number.parseInt(s, 10));
  const [h, m, s] = timeLocal.split(":").map((p) => Number.parseInt(p, 10));
  const hour = h ?? 0;
  const minute = m ?? 0;
  const second = Number.isFinite(s) ? (s as number) : 0;
  // First guess: treat the wall clock as UTC.
  const guessUtcMs = Date.UTC(Y, (M ?? 1) - 1, D ?? 1, hour, minute, second);
  // Compute the offset in `timezone` at that instant.
  const offset = tzOffsetMs(guessUtcMs, timezone);
  // Second pass: subtract the offset so the LOCAL wall clock matches.
  const correctedMs = guessUtcMs - offset;
  // Verify the correction didn't cross a DST boundary; redo if so.
  const offset2 = tzOffsetMs(correctedMs, timezone);
  if (offset2 !== offset) {
    return guessUtcMs - offset2;
  }
  return correctedMs;
}

function tzOffsetMs(utcMs: number, timezone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(utcMs));
  const lookup: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") lookup[p.type] = p.value;
  }
  const Y = Number.parseInt(lookup.year ?? "1970", 10);
  const M = Number.parseInt(lookup.month ?? "01", 10);
  const D = Number.parseInt(lookup.day ?? "01", 10);
  const h = Number.parseInt(lookup.hour ?? "00", 10);
  const min = Number.parseInt(lookup.minute ?? "00", 10);
  const sec = Number.parseInt(lookup.second ?? "00", 10);
  const localAsUtc = Date.UTC(Y, M - 1, D, h === 24 ? 0 : h, min, sec);
  return localAsUtc - utcMs;
}

interface DayInterval {
  startLocal: string; // "HH:mm"
  endLocal: string;
}

function baseIntervalsForDay(
  dateLocalIso: string,
  weekday: number,
  rules: AvailabilityResolverInputs["rules"],
  overridesOnDate: AvailabilityResolverInputs["overrides"],
): DayInterval[] {
  const effective: DayInterval[] = [];
  for (const r of rules) {
    if (r.weekday !== weekday) continue;
    if (r.effectiveFromDate && dateLocalIso < r.effectiveFromDate) continue;
    if (r.effectiveUntilDate && dateLocalIso > r.effectiveUntilDate) continue;
    effective.push({
      startLocal: normalizeHHmm(r.startTimeLocal),
      endLocal: normalizeHHmm(r.endTimeLocal),
    });
  }
  // Apply override `add` intervals — union with rule intervals.
  for (const o of overridesOnDate) {
    if (o.kind === "add") {
      effective.push({
        startLocal: normalizeHHmm(o.startTimeLocal),
        endLocal: normalizeHHmm(o.endTimeLocal),
      });
    }
  }
  let merged = mergeIntervals(effective);
  // Apply override `block` intervals — subtract.
  for (const o of overridesOnDate) {
    if (o.kind === "block") {
      merged = subtractInterval(merged, {
        startLocal: normalizeHHmm(o.startTimeLocal),
        endLocal: normalizeHHmm(o.endTimeLocal),
      });
    }
  }
  return merged;
}

function normalizeHHmm(t: string): string {
  if (HHmmss.test(t)) return t.slice(0, 5);
  return t;
}

function toMin(t: string): number {
  const [h, m] = t.split(":").map((p) => Number.parseInt(p, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

function fromMin(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function mergeIntervals(intervals: DayInterval[]): DayInterval[] {
  if (!intervals.length) return [];
  const sorted = intervals
    .map((i) => ({ s: toMin(i.startLocal), e: toMin(i.endLocal) }))
    .filter((i) => i.e > i.s)
    .sort((a, b) => a.s - b.s);
  const merged: Array<{ s: number; e: number }> = [];
  for (const cur of sorted) {
    const last = merged[merged.length - 1];
    if (last && cur.s <= last.e) {
      last.e = Math.max(last.e, cur.e);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged.map((m) => ({ startLocal: fromMin(m.s), endLocal: fromMin(m.e) }));
}

function subtractInterval(intervals: DayInterval[], blocker: DayInterval): DayInterval[] {
  const bs = toMin(blocker.startLocal);
  const be = toMin(blocker.endLocal);
  const out: DayInterval[] = [];
  for (const i of intervals) {
    const is = toMin(i.startLocal);
    const ie = toMin(i.endLocal);
    if (be <= is || bs >= ie) {
      out.push(i);
      continue;
    }
    if (bs > is) out.push({ startLocal: fromMin(is), endLocal: fromMin(bs) });
    if (be < ie) out.push({ startLocal: fromMin(be), endLocal: fromMin(ie) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Magic-link token generator. Caller-supplied randomness keeps this pure
// + testable; api/src wraps with crypto.getRandomValues.
// ---------------------------------------------------------------------------
export function encodeMagicLinkToken(randomBytes: Uint8Array): string {
  if (randomBytes.length < 32) {
    throw new RangeError("magic-link tokens need ≥ 32 bytes of entropy");
  }
  // URL-safe base64 (RFC 4648 §5) without padding.
  let bin = "";
  for (const b of randomBytes) bin += String.fromCharCode(b);
  // btoa is available in Workers + Node 18+.
  const b64 = typeof btoa === "function"
    ? btoa(bin)
    : Buffer.from(randomBytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "").slice(0, 64);
}

// ---------------------------------------------------------------------------
// Fee math — the SINGLE seam every caller uses. Mirrors `creator_profiles
// .platform_fee_bps` snapshot semantics: the bps in effect AT BOOKING TIME
// is captured on the reservation row, so later rate changes don't alter
// historical payouts.
// ---------------------------------------------------------------------------
export function computePlatformFeeCents(
  amountCents: number,
  platformFeeBps: number,
): number {
  if (amountCents <= 0) return 0;
  const bps = Math.max(0, Math.min(10_000, platformFeeBps));
  return Math.floor((amountCents * bps) / 10_000);
}

export function computeNetPayoutCents(
  amountCents: number,
  platformFeeBps: number,
): number {
  return Math.max(0, amountCents - computePlatformFeeCents(amountCents, platformFeeBps));
}
